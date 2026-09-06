/**
 * Byte-level media inspection. No native dependencies, no network, no I/O:
 * every parser is bounds-checked and returns `null` on malformed input.
 * Nothing in this module throws.
 */

import { ACCEPTED_UPLOAD_MIME_TYPES } from "@/lib/validation/limits";

export type AcceptedMimeType = (typeof ACCEPTED_UPLOAD_MIME_TYPES)[number];

export type ImageProbe = { width: number; height: number };

export type VideoProbe = {
  /** Duration in seconds. */
  duration: number;
  width?: number;
  height?: number;
};

export type MediaProbe = {
  width: number | null;
  height: number | null;
  /** Duration in seconds. */
  duration: number | null;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (offset < 0 || offset + signature.length > bytes.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index]);
  }
  return out;
}

function u16be(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function u32le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset + 3] << 24) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 1] << 8) |
      bytes[offset]) >>>
    0
  );
}

function u64be(bytes: Uint8Array, offset: number): number {
  return u32be(bytes, offset) * 0x1_0000_0000 + u32be(bytes, offset + 4);
}

function safe<T>(run: () => T | null): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

function dimensions(width: number, height: number): ImageProbe | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Walks JPEG markers to the first SOF marker, which carries the frame size.
 * Handles restart markers, fill bytes and any segment length.
 */
function probeJpeg(bytes: Uint8Array): ImageProbe | null {
  if (!matches(bytes, 0, [0xff, 0xd8, 0xff])) return null;

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // desynchronised: resynchronise on the next 0xff
      continue;
    }

    const marker = bytes[offset + 1];

    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    if (marker === 0xd9) return null; // EOI without a frame header

    const length = u16be(bytes, offset + 2);
    if (length < 2) return null;

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC

    if (isStartOfFrame) {
      if (offset + 9 > bytes.length) return null;
      // precision: bytes[offset + 4]
      return dimensions(u16be(bytes, offset + 7), u16be(bytes, offset + 5));
    }

    offset += 2 + length;
  }

  return null;
}

function probePng(bytes: Uint8Array): ImageProbe | null {
  if (!matches(bytes, 0, PNG_SIGNATURE)) return null;
  // IHDR must be the first chunk: length (4) + "IHDR" (4) + width (4) + height (4)
  if (text(bytes, 12, 4) !== "IHDR") return null;
  if (bytes.length < 24) return null;
  return dimensions(u32be(bytes, 16), u32be(bytes, 20));
}

function probeWebp(bytes: Uint8Array): ImageProbe | null {
  if (bytes.length < 16) return null;
  if (text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP") return null;

  const riffSize = u32le(bytes, 4);
  const limit =
    riffSize > 0 && 8 + riffSize <= bytes.length ? 8 + riffSize : bytes.length;

  let offset = 12;

  while (offset + 8 <= limit) {
    const fourcc = text(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(limit, dataStart + size);

    if (fourcc === "VP8 ") {
      // 3 byte frame tag, 3 byte start code, then 14 bit width and height.
      if (dataEnd - dataStart >= 10) {
        const width = u16le(bytes, dataStart + 6) & 0x3fff;
        const height = u16le(bytes, dataStart + 8) & 0x3fff;
        const found = dimensions(width, height);
        if (found) return found;
      }
    } else if (fourcc === "VP8L") {
      // Signature byte, then 14 bits width-1 and 14 bits height-1, little endian.
      if (dataEnd - dataStart >= 5 && bytes[dataStart] === 0x2f) {
        const bits = u32le(bytes, dataStart + 1);
        const found = dimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
        if (found) return found;
      }
    } else if (fourcc === "VP8X") {
      // Flags, 3 reserved bytes, then 24 bit canvas width-1 and height-1.
      if (dataEnd - dataStart >= 10) {
        const width =
          (bytes[dataStart + 4] | (bytes[dataStart + 5] << 8) | (bytes[dataStart + 6] << 16)) + 1;
        const height =
          (bytes[dataStart + 7] | (bytes[dataStart + 8] << 8) | (bytes[dataStart + 9] << 16)) + 1;
        const found = dimensions(width, height);
        if (found) return found;
      }
    }

    offset = dataStart + size + (size % 2); // chunks are padded to even sizes
  }

  return null;
}

function u16le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

type Box = {
  type: string;
  /** First byte after the box header. */
  start: number;
  /** One past the last byte of the box. */
  end: number;
};

function readBox(bytes: Uint8Array, offset: number, limit: number): Box | null {
  if (offset < 0 || offset + 8 > limit) return null;

  const size = u32be(bytes, offset);
  const type = text(bytes, offset + 4, 4);

  let headerSize = 8;
  let end: number;

  if (size === 1) {
    if (offset + 16 > limit) return null;
    const large = u64be(bytes, offset + 8);
    if (!Number.isFinite(large) || large < 16) return null;
    headerSize = 16;
    end = offset + large;
  } else if (size === 0) {
    end = limit; // box extends to the end of the file
  } else {
    if (size < 8) return null;
    end = offset + size;
  }

  if (end > limit) return null;
  const start = offset + headerSize;
  if (end < start) return null;

  return { type, start, end };
}

function scanBoxes(
  bytes: Uint8Array,
  start: number,
  limit: number,
  visit: (box: Box) => void,
): void {
  let offset = start;
  while (offset + 8 <= limit) {
    const box = readBox(bytes, offset, limit);
    if (!box) return;
    visit(box);
    if (box.end <= offset) return; // malformed: refuse to loop forever
    offset = box.end;
  }
}

/** MP4 and MOV share the same box structure: `moov.mvhd` carries the duration. */
function readMvhdDuration(bytes: Uint8Array, start: number, end: number): number | null {
  if (start + 4 > end) return null;

  const version = bytes[start];
  let timescale: number;
  let duration: number;

  if (version === 0) {
    if (start + 20 > end) return null;
    timescale = u32be(bytes, start + 12);
    duration = u32be(bytes, start + 16);
  } else if (version === 1) {
    if (start + 32 > end) return null;
    timescale = u32be(bytes, start + 20);
    duration = u64be(bytes, start + 24);
  } else {
    return null;
  }

  if (!Number.isFinite(timescale) || timescale <= 0) return null;
  if (!Number.isFinite(duration) || duration < 0) return null;

  return duration / timescale;
}

function readTkhdSize(
  bytes: Uint8Array,
  start: number,
  end: number,
): { width: number; height: number } | null {
  if (start + 4 > end) return null;

  const version = bytes[start];
  // v0: 84 byte payload, v1: 96 byte payload. Width is a 16.16 fixed point value.
  const offset = version === 1 ? 88 : version === 0 ? 76 : -1;
  if (offset < 0 || start + offset + 8 > end) return null;

  const width = u32be(bytes, start + offset) / 65536;
  const height = u32be(bytes, start + offset + 4) / 65536;

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return { width: Math.round(width), height: Math.round(height) };
}

function probeIsoBmff(bytes: Uint8Array): {
  duration: number | null;
  width: number | null;
  height: number | null;
} {
  const result: { duration: number | null; width: number | null; height: number | null } = {
    duration: null,
    width: null,
    height: null,
  };

  scanBoxes(bytes, 0, bytes.length, (box) => {
    if (box.type !== "moov") return;

    scanBoxes(bytes, box.start, box.end, (child) => {
      if (child.type === "mvhd" && result.duration === null) {
        result.duration = readMvhdDuration(bytes, child.start, child.end);
        return;
      }

      if (child.type === "trak" && result.width === null) {
        scanBoxes(bytes, child.start, child.end, (leaf) => {
          if (leaf.type !== "tkhd" || result.width !== null) return;
          const size = readTkhdSize(bytes, leaf.start, leaf.end);
          if (size) {
            result.width = size.width;
            result.height = size.height;
          }
        });
      }
    });
  });

  return result;
}

function isVideo(mimeType: string): boolean {
  return mimeType === "video/mp4" || mimeType === "video/quicktime";
}

/**
 * MP4 and MOV normally start with an `ftyp` box, but a few QuickTime files
 * lead with `moov`. Both are recognised, scanning only the first few boxes.
 */
function sniffIsoBmff(bytes: Uint8Array): AcceptedMimeType | null {
  if (bytes.length < 12) return null;

  let offset = 0;
  for (let index = 0; index < 8 && offset + 8 <= bytes.length; index += 1) {
    const size = u32be(bytes, offset);
    const type = text(bytes, offset + 4, 4);

    if (type === "ftyp") {
      const brand = text(bytes, offset + 8, 4);
      return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
    }

    if (type === "moov") return "video/mp4";

    // A zero size means "to the end of the file"; a size of one introduces a
    // 64 bit length. Neither can appear before `ftyp` in a real container.
    if (size === 0) return null;
    offset += size < 8 ? 8 : size;
  }

  return null;
}

/**
 * Identifies the real media type from the leading bytes. Only the types the
 * app accepts are ever returned, so a match is also an allow-list decision.
 */
export function sniffMimeType(bytes: Uint8Array): AcceptedMimeType | null {
  return safe(() => {
    if (bytes.length < 12) return null;

    if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (matches(bytes, 0, PNG_SIGNATURE)) return "image/png";
    if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") {
      return "image/webp";
    }

    return sniffIsoBmff(bytes);
  });
}

export function probeImage(bytes: Uint8Array, mimeType: string): ImageProbe | null {
  return safe(() => {
    const detected = sniffMimeType(bytes);
    const candidates =
      mimeType === "image/jpeg"
        ? ["image/jpeg", "image/png", "image/webp"]
        : mimeType === "image/png"
          ? ["image/png", "image/jpeg", "image/webp"]
          : mimeType === "image/webp"
            ? ["image/webp", "image/png", "image/jpeg"]
            : detected
              ? [detected]
              : ["image/jpeg", "image/png", "image/webp"];

    for (const candidate of candidates) {
      if (candidate === "image/jpeg") {
        const found = probeJpeg(bytes);
        if (found) return found;
      } else if (candidate === "image/png") {
        const found = probePng(bytes);
        if (found) return found;
      } else if (candidate === "image/webp") {
        const found = probeWebp(bytes);
        if (found) return found;
      }
    }

    return null;
  });
}

export function probeVideo(bytes: Uint8Array, mimeType: string): VideoProbe | null {
  return safe(() => {
    if (!isVideo(mimeType) && !(sniffMimeType(bytes) ?? "").startsWith("video/")) {
      return null;
    }

    const { duration, width, height } = probeIsoBmff(bytes);
    if (duration === null && width === null) return null;

    return {
      duration: duration ?? 0,
      ...(width !== null && height !== null ? { width, height } : {}),
    };
  });
}

export function probeMedia(bytes: Uint8Array, mimeType: string): MediaProbe {
  const image = probeImage(bytes, mimeType);
  const video = probeVideo(bytes, mimeType);

  return {
    width: image?.width ?? video?.width ?? null,
    height: image?.height ?? video?.height ?? null,
    duration: video?.duration ?? null,
  };
}

const EXTENSION_BY_MIME: Record<AcceptedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType as AcceptedMimeType] ?? "bin";
}
