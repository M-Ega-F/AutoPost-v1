import { z } from "zod";

import { humanErrorMessage } from "@/lib/errors";
import { PLATFORMS, type Platform } from "@/lib/status";
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  PLATFORM_LIMITS,
  captionLimitConstrainers,
  captionLimitFor,
} from "@/lib/validation/limits";

/**
 * Shared validation. The client mirrors these schemas so feedback is instant;
 * the server runs the same rules and is authoritative.
 */

const MAX_CAPTION_LENGTH = Math.max(
  ...Object.values(PLATFORM_LIMITS).map((limits) => limits.captionLength),
);

const MIME_MESSAGE = "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const CAPTION_REQUIRED = "Write a caption before publishing.";

export const platformSchema = z.custom<Platform>(
  (value) => typeof value === "string" && (PLATFORMS as readonly string[]).includes(value),
  { message: "Unsupported platform." },
);

const acceptedMimeSchema = z.string().refine(
  (value) => (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(value),
  { message: MIME_MESSAGE },
);

const nullableInt = z.number().int().nonnegative().nullable();

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Enter your email and password." })
    .email({ message: "Enter a valid email address." }),
  password: z
    .string()
    .min(1, { message: "Enter your email and password." })
    .max(200, { message: "Enter your email and password." }),
});

export const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, { message: "Enter your email and password." })
      .email({ message: "Enter a valid email address." }),
    password: z
      .string()
      .min(1, { message: "Enter your email and password." })
      .min(8, { message: "Password must be at least 8 characters." })
      .max(200, { message: "Enter your email and password." }),
    confirmPassword: z.string().min(1, "Password is required."),
  })
.refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don&apos;t match.",
      path: ["confirmPassword"],
    });

export const captionSchema = z.object({
  caption: z
    .string()
    .trim()
    .min(1, { message: CAPTION_REQUIRED })
    .max(MAX_CAPTION_LENGTH, { message: "This caption is too long." }),
});

export const mediaUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, { message: "Invalid media URL." })
    .max(2048, { message: "Invalid media URL." })
    .url({ message: "Invalid media URL." })
    .refine((value) => value.toLowerCase().startsWith("https://"), {
      message: "Only HTTPS URLs are supported.",
    }),
});

export const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Choose a valid date." }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { message: "Choose a valid time." }),
  timezone: z.string().trim().min(1, { message: "Choose a timezone." }),
});

/** The media reference the client got back from `/api/media/upload` or `/api/media/url`. */
export const postMediaSchema = z
  .object({
    kind: z.enum(["upload", "url"]),
    storageKey: z.string().trim().min(1).max(512),
    sourceUrl: z.string().trim().url().max(2048).nullish(),
    mediaType: z.enum(["image", "video"]),
    mimeType: acceptedMimeSchema,
    fileSize: nullableInt,
    width: nullableInt,
    height: nullableInt,
    duration: z.number().nonnegative().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "url" && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceUrl"],
        message: "Invalid media URL.",
      });
    }
  });

export const createPostSchema = z
  .object({
    caption: z
      .string()
      .trim()
      .min(1, { message: CAPTION_REQUIRED })
      .max(MAX_CAPTION_LENGTH, { message: "This caption is too long." }),
    media: postMediaSchema,
    platforms: z
      .array(platformSchema)
      .min(1, { message: "Select at least one platform." })
      .max(PLATFORMS.length, { message: "Select at least one platform." }),
    schedule: scheduleSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.platforms);
    if (unique.size !== value.platforms.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Choose one account per platform.",
      });
      return;
    }

    // The effective limit is the minimum across the selected platforms.
    const limit = captionLimitFor(value.platforms);
    if (value.caption.length > limit) {
      const [first] = captionLimitConstrainers(value.platforms, limit);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caption"],
        message: humanErrorMessage(first ?? value.platforms[0], "caption_too_long"),
      });
    }
  });

export const saveDraftSchema = z
  .object({
    caption: z
      .string()
      .trim()
      .max(MAX_CAPTION_LENGTH, { message: "This caption is too long." }),
    media: postMediaSchema.nullable(),
    platforms: z
      .array(platformSchema)
      .max(PLATFORMS.length, { message: "Too many platforms selected." }),
    timezone: z.string().trim().min(1, { message: "Choose a timezone." }),
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.platforms);
    if (unique.size !== value.platforms.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Choose one account per platform.",
      });
      return;
    }

    if (value.platforms.length === 0) return;
    const limit = captionLimitFor(value.platforms);
    if (value.caption.length > limit) {
      const [first] = captionLimitConstrainers(value.platforms, limit);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caption"],
        message: humanErrorMessage(first ?? value.platforms[0], "caption_too_long"),
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CaptionInput = z.infer<typeof captionSchema>;
export type MediaUrlInput = z.infer<typeof mediaUrlSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type PostMediaInput = z.infer<typeof postMediaSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
