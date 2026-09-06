import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  extensionForMimeType,
  probeImage,
  probeMedia,
  probeVideo,
  sniffMimeType,
} from "@/lib/media/probe";

/* -------------------------------------------------------------------------- */
/* Synthetic builders — every buffer is assembled by hand so the tests never   */
/* depend on a fixture file checked into the repository.                       */
/* -------------------------------------------------------------------------- */

function bytes(...parts: Array<number[] | Uint8Array>): Uint8Array {
  const chunks = parts.map((part) => Uint8Array.from(part));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function ascii(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function zeroes(length: number): number[] {
  return new Array<number>(length).fill(0);
}

/** PNG signature + a minimal IHDR chunk. */
function pngBuffer(width: number, height: number): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    ascii("IHDR"),
    u32be(width),
    u32be(height),
    zeroes(5),
  );
}

/** SOI + APP0/JFIF + SOF0. */
function jpegBuffer(width: number, height: number): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    // APP0 segment: length 16 (2 length bytes + 14 payload bytes).
    [0xff, 0xe0],
    u16be(16),
    ascii("JFIF\0"),
    [0x01, 0x01, 0x00],
    u16be(1),
    u16be(1),
    [0x00, 0x00],
    // SOF0 segment: length 17 (2 length bytes + 15 payload bytes).
    [0xff, 0xc0],
    u16be(17),
    [0x08], // sample precision
    u16be(height),
    u16be(width),
    [0x03], // three components
    [0x01, 0x22, 0x00],
    [0x02, 0x11, 0x01],
    [0x03, 0x11, 0x01],
  );
}

/** RIFF/WEBP with a single VP8L chunk. */
function webpVp8lBuffer(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const data = bytes([0x2f], u32le(bits));
  return bytes(ascii("RIFF"), u32le(4 + 8 + data.length), ascii("WEBP"), ascii("VP8L"), u32le(data.length), data);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return bytes(u32be(8 + payload.length), ascii(type), payload);
}

/** `mvhd` version 0: version + flags + 4x uint32 + timescale + duration. */
function mvhdV0(timescale: number, duration: number): Uint8Array {
  return box("mvhd", bytes([0x00], zeroes(3), u32be(0), u32be(0), u32be(timescale), u32be(duration)));
}

/** `tkhd` version 0: 84 byte payload, width and height as 16.16 fixed point. */
function tkhdV0(width: number, height: number): Uint8Array {
  const payload = bytes(
    [0x00],
    zeroes(3), // flags
    u32be(0), // creation time
    u32be(0), // modification time
    u32be(1), // track id
    u32be(0), // reserved
    u32be(0), // duration placeholder
    zeroes(8), // reserved
    u16be(0), // layer
    u16be(0), // alternate group
    u16be(0), // volume
    u16be(0), // reserved
    zeroes(36), // unity matrix
    u32be(width * 65536),
    u32be(height * 65536),
  );
  assert.equal(payload.length, 84);
  return box("tkhd", payload);
}

function mp4Buffer(options: {
  brand: string;
  timescale: number;
  duration: number;
  width: number;
  height: number;
}): Uint8Array {
  const ftyp = box(
    "ftyp",
    bytes(ascii(options.brand), u32be(0), ascii("isom"), ascii("mp42")),
  );
  const moov = box("moov", bytes(mvhdV0(options.timescale, options.duration), box("trak", tkhdV0(options.width, options.height))));
  return bytes(ftyp, moov);
}

/* -------------------------------------------------------------------------- */

describe("sniffMimeType", () => {
  test("identifies the accepted types from the leading bytes", () => {
    assert.equal(sniffMimeType(pngBuffer(8, 8)), "image/png");
    assert.equal(sniffMimeType(jpegBuffer(8, 8)), "image/jpeg");
    assert.equal(sniffMimeType(webpVp8lBuffer(8, 8)), "image/webp");
    assert.equal(
      sniffMimeType(mp4Buffer({ brand: "isom", timescale: 1000, duration: 1000, width: 8, height: 8 })),
      "video/mp4",
    );
    assert.equal(
      sniffMimeType(mp4Buffer({ brand: "qt  ", timescale: 1000, duration: 1000, width: 8, height: 8 })),
      "video/quicktime",
    );
  });

  test("refuses anything it does not recognise", () => {
    assert.equal(sniffMimeType(new Uint8Array(0)), null);
    assert.equal(sniffMimeType(bytes(ascii("%PDF-1.7 not really a pdf but long enough"))), null);
    assert.equal(sniffMimeType(bytes(ascii("GIF89a plus some padding bytes here"))), null);
  });

  test("never throws on random or truncated input", () => {
    for (let length = 0; length < 40; length += 1) {
      const buffer = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) buffer[index] = (index * 37) % 256;
      assert.equal(sniffMimeType(buffer), null);
    }
  });
});

describe("probeImage", () => {
  test("reads PNG dimensions from IHDR", () => {
    assert.deepEqual(probeImage(pngBuffer(1920, 1080), "image/png"), {
      width: 1920,
      height: 1080,
    });
  });

  test("reads JPEG dimensions from the SOF0 marker", () => {
    assert.deepEqual(probeImage(jpegBuffer(1280, 720), "image/jpeg"), {
      width: 1280,
      height: 720,
    });
  });

  test("reads WebP VP8L dimensions", () => {
    assert.deepEqual(probeImage(webpVp8lBuffer(640, 480), "image/webp"), {
      width: 640,
      height: 480,
    });
  });

  test("falls back to sniffing when the declared mime type is wrong", () => {
    assert.deepEqual(probeImage(pngBuffer(800, 600), "image/jpeg"), {
      width: 800,
      height: 600,
    });
  });

  test("returns null for malformed or truncated input", () => {
    assert.equal(probeImage(new Uint8Array(0), "image/png"), null);
    assert.equal(probeImage(bytes([0x89, 0x50]), "image/png"), null);
    // Signature present, IHDR missing.
    assert.equal(probeImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), ascii("IDAT"), zeroes(20)), "image/png"), null);
    // JPEG that ends before the frame header.
    assert.equal(probeImage(bytes([0xff, 0xd8, 0xff, 0xe0], u16be(16), zeroes(6)), "image/jpeg"), null);
    // Zero dimensions are rejected.
    assert.equal(probeImage(pngBuffer(0, 0), "image/png"), null);
  });
});

describe("probeVideo", () => {
  test("reads duration from mvhd and dimensions from tkhd", () => {
    const buffer = mp4Buffer({
      brand: "isom",
      timescale: 1000,
      duration: 90_000,
      width: 1920,
      height: 1080,
    });

    assert.deepEqual(probeVideo(buffer, "video/mp4"), {
      duration: 90,
      width: 1920,
      height: 1080,
    });
  });

  test("duration is duration divided by timescale", () => {
    const buffer = mp4Buffer({
      brand: "isom",
      timescale: 600,
      duration: 7_500,
      width: 720,
      height: 1280,
    });
    assert.equal(probeVideo(buffer, "video/mp4")?.duration, 12.5);
  });

  test("MOV shares the box structure", () => {
    const buffer = mp4Buffer({
      brand: "qt  ",
      timescale: 30_000,
      duration: 300_000,
      width: 1080,
      height: 1920,
    });
    assert.equal(probeVideo(buffer, "video/quicktime")?.duration, 10);
    assert.equal(probeVideo(buffer, "video/quicktime")?.width, 1080);
  });

  test("image bytes are refused", () => {
    assert.equal(probeVideo(pngBuffer(8, 8), "video/mp4"), null);
    assert.equal(probeVideo(jpegBuffer(8, 8), "video/quicktime"), null);
    assert.equal(probeVideo(new Uint8Array(0), "image/png"), null);
  });

  test("the sniffer wins over a mislabelled mime type", () => {
    const buffer = mp4Buffer({ brand: "isom", timescale: 1000, duration: 1_000, width: 8, height: 8 });
    assert.deepEqual(probeVideo(buffer, "image/png"), {
      duration: 1,
      width: 8,
      height: 8,
    });
  });

  test("returns null for malformed or truncated input", () => {
    assert.equal(probeVideo(new Uint8Array(0), "video/mp4"), null);
    assert.equal(probeVideo(bytes(ascii("not a real mp4 container at all!")), "video/mp4"), null);
    // ftyp present but the moov box is truncated away.
    assert.equal(
      probeVideo(box("ftyp", bytes(ascii("isom"), zeroes(8))), "video/mp4"),
      null,
    );
  });
});

describe("probeMedia", () => {
  test("an image reports dimensions and no duration", () => {
    assert.deepEqual(probeMedia(pngBuffer(1080, 1080), "image/png"), {
      width: 1080,
      height: 1080,
      duration: null,
    });
  });

  test("a video reports dimensions and duration", () => {
    const buffer = mp4Buffer({
      brand: "isom",
      timescale: 1000,
      duration: 15_000,
      width: 1280,
      height: 720,
    });
    assert.deepEqual(probeMedia(buffer, "video/mp4"), {
      width: 1280,
      height: 720,
      duration: 15,
    });
  });

  test("garbage returns nulls instead of throwing", () => {
    for (const buffer of [
      new Uint8Array(0),
      new Uint8Array(1),
      bytes(ascii("hello world, definitely not media")),
      bytes([0xff, 0xd8, 0xff]),
    ]) {
      for (const mimeType of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "application/pdf"]) {
        const result = probeMedia(buffer, mimeType);
        assert.equal(result.width, null, `${mimeType}`);
        assert.equal(result.height, null, `${mimeType}`);
        assert.equal(result.duration, null, `${mimeType}`);
      }
    }
  });

  test("a video container with no mvhd still reports dimensions", () => {
    const moov = box("moov", box("trak", tkhdV0(640, 360)));
    const buffer = bytes(box("ftyp", bytes(ascii("isom"), zeroes(8))), moov);
    const result = probeMedia(buffer, "video/mp4");
    assert.equal(result.width, 640);
    assert.equal(result.height, 360);
    assert.equal(result.duration, 0);
  });
});

describe("extensionForMimeType", () => {
  test("maps the accepted types", () => {
    assert.equal(extensionForMimeType("image/jpeg"), "jpg");
    assert.equal(extensionForMimeType("image/png"), "png");
    assert.equal(extensionForMimeType("image/webp"), "webp");
    assert.equal(extensionForMimeType("video/mp4"), "mp4");
    assert.equal(extensionForMimeType("video/quicktime"), "mov");
  });

  test("unknown types fall back to bin", () => {
    assert.equal(extensionForMimeType("application/pdf"), "bin");
    assert.equal(extensionForMimeType(""), "bin");
  });
});
