import { z } from "zod";

import { humanErrorMessage } from "@/lib/errors";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { PLATFORMS, type Platform } from "@/lib/status";
import { isValidTimeZone } from "@/lib/time";
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
const DISPLAY_NAME_MAX_LENGTH = 80;

const settingsDisplayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX_LENGTH, { message: "Display name is too long." })
  .transform((value) => value || null);

const settingsTimezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimeZone, { message: "Choose a valid timezone." });

const settingsTimeSchema = z.string().refine(
  (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour < 24 && [0, 15, 30, 45].includes(minute);
  },
  { message: "Choose a valid default time." },
);

export const settingsUpdateSchema = z
  .object({
    displayName: settingsDisplayNameSchema.nullable().optional(),
    timezone: settingsTimezoneSchema.optional(),
    defaultScheduleTime: settingsTimeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose a setting to update.",
  });

export const platformSchema = z.custom<Platform>(
  (value) => typeof value === "string" && (PLATFORMS as readonly string[]).includes(value),
  { message: "Unsupported platform." },
);

const postTargetSchema = z.object({
  platform: platformSchema,
  socialAccountId: z.string().uuid(),
});

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

const passwordInputSchema = z
  .string()
  .min(1, { message: "Password is required." })
  .min(8, { message: "Password must be at least 8 characters." })
  .max(200, { message: "Password must be 200 characters or fewer." });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Enter your email address." })
    .email({ message: "Enter a valid email address." }),
});

export const resetPasswordSchema = z
  .object({
    password: passwordInputSchema,
    confirmPassword: z.string().min(1, { message: "Confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don’t match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: "Enter your current password." })
      .max(200, { message: "Enter your current password." }),
    newPassword: passwordInputSchema,
    confirmNewPassword: z
      .string()
      .min(1, { message: "Confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don’t match.",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Choose a new password different from your current password.",
    path: ["newPassword"],
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

export const invitationCreateSchema = z
  .object({
    email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."),
    role: z.enum(INVITABLE_ROLES, { message: "Choose a valid workspace role." }),
  })
  .strict();

export const memberRoleUpdateSchema = z
  .object({
    role: z.enum(INVITABLE_ROLES, { message: "Choose a valid workspace role." }),
  })
  .strict();

const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, { message: "Workspace name must be at least 2 characters." })
  .max(80, { message: "Workspace name is too long." });

const workspaceDescriptionSchema = z
  .string()
  .trim()
  .max(500, { message: "Workspace description is too long." })
  .nullable()
  .optional();

const workspaceTimezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimeZone, { message: "Choose a valid workspace timezone." });

const workspaceSlugSchema = z
  .string()
  .trim()
  .min(1, { message: "Workspace slug is required." })
  .max(80, { message: "Workspace slug is too long." })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Use lowercase letters, numbers, and hyphens only." });

const workspaceAvatarSchema = z
  .string()
  .trim()
  .max(2048, { message: "Avatar URL is too long." })
  .url({ message: "Enter a valid avatar URL." })
  .refine((value) => value.startsWith("https://"), { message: "Avatar URL must use HTTPS." })
  .nullable()
  .optional();

export const workspaceCreateSchema = z
  .object({
    name: workspaceNameSchema,
    description: workspaceDescriptionSchema,
    timezone: workspaceTimezoneSchema.optional(),
  })
  .strict();

export const workspaceUpdateSchema = z
  .object({
    name: workspaceNameSchema.optional(),
    slug: workspaceSlugSchema.optional(),
    description: workspaceDescriptionSchema,
    avatarUrl: workspaceAvatarSchema,
    timezone: workspaceTimezoneSchema.optional(),
    approvalRequired: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Choose a workspace setting to update." });

export const workspaceDeleteSchema = z.object({ confirmation: z.string().trim().min(1, "Type the workspace name to confirm.") }).strict();
export const workspaceTransferSchema = z.object({ memberId: z.string().uuid("Choose a valid member.") }).strict();

export const campaignStatusSchema = z.enum(["draft", "active", "completed", "archived"]);
export const campaignObjectiveSchema = z.enum([
  "brand_awareness",
  "engagement",
  "traffic",
  "promotion",
  "education",
  "community",
  "other",
]);
export const campaignTargetMetricSchema = z.enum(["views", "likes", "comments", "shares", "saves", "reach", "impressions"]);
const campaignTargetValueSchema = z.coerce.number().int().positive("Target value must be greater than zero.").max(Number.MAX_SAFE_INTEGER, "Target value is too large.").nullable().optional();
const campaignDateSchema = z.string().datetime({ offset: true }).nullable().optional();
const campaignNameSchema = z.string().trim().min(1, "Campaign name is required.").max(160, "Campaign name is too long.");
const campaignDescriptionSchema = z.string().trim().max(2000, "Campaign description is too long.").nullable().optional();
const campaignCustomObjectiveSchema = z.string().trim().max(160, "Custom objective is too long.").nullable().optional();

export const campaignCreateSchema = z.object({
  name: campaignNameSchema,
  description: campaignDescriptionSchema,
  objective: campaignObjectiveSchema.nullable().optional(),
  customObjective: campaignCustomObjectiveSchema,
  targetMetric: campaignTargetMetricSchema.nullable().optional(),
  targetValue: campaignTargetValueSchema,
  startAt: campaignDateSchema,
  endAt: campaignDateSchema,
}).strict().superRefine((value, ctx) => {
  if (value.startAt && value.endAt && new Date(value.startAt) > new Date(value.endAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start date must be before end date.", path: ["endAt"] });
  if (value.objective === "other" && !value.customObjective?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Describe the custom objective.", path: ["customObjective"] });
  if (value.objective !== "other" && value.customObjective?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Custom objective is only available for Other.", path: ["customObjective"] });
  if ((value.targetMetric == null) !== (value.targetValue == null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose both a target metric and target value.", path: ["targetValue"] });
});

export const campaignUpdateSchema = z.object({
  name: campaignNameSchema.optional(),
  description: campaignDescriptionSchema,
  objective: campaignObjectiveSchema.nullable().optional(),
  customObjective: campaignCustomObjectiveSchema,
  targetMetric: campaignTargetMetricSchema.nullable().optional(),
  targetValue: campaignTargetValueSchema,
  startAt: campaignDateSchema,
  endAt: campaignDateSchema,
}).strict().refine((value) => Object.keys(value).length > 0, { message: "Choose a campaign detail to update." });

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  status: campaignStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["updated", "created", "name"]).default("updated"),
  order: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export const campaignPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["draft", "scheduled", "processing", "published", "partial_failure", "failed", "cancelled"]).optional(),
  approvalStatus: z.enum(["not_required", "draft", "in_review", "changes_requested", "approved"]).optional(),
  platform: platformSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(120).optional(),
}).strict().refine((value) => !value.from || !value.to || value.from < value.to, { message: "Choose a valid date range." });

export const campaignPostAttachSchema = z.object({ postId: z.string().uuid("Choose a valid post.") }).strict();

export const reviewInboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["in_review", "changes_requested", "approved"]).optional(),
  reviewer: z.union([z.literal("me"), z.string().uuid()]).optional(),
  author: z.string().uuid().optional(),
  platform: platformSchema.optional(),
  campaignId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["priority", "oldest", "newest", "scheduled", "deadline", "updated"]).default("priority"),
}).strict().refine((value) => !value.from || !value.to || value.from < value.to, { message: "Choose a valid date range." });

export const reviewerUpdateSchema = z.object({ reviewerId: z.string().uuid().nullable() }).strict();
export const reviewDeadlineSchema = z.object({ reviewDueAt: z.string().datetime({ offset: true }).nullable() }).strict();
export const reviewCommentSchema = z.object({ body: z.string().trim().min(1, "Write a comment before sending it.").max(2000, "The review comment is too long."), parentCommentId: z.string().uuid().nullable().optional() }).strict();
export const reviewCommentEditSchema = z.object({ body: z.string().trim().min(1, "Write a comment before sending it.").max(2000, "The review comment is too long.") }).strict();
export const reviewCommentResolveSchema = z.object({ resolved: z.boolean() }).strict();

export const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Choose a valid date." }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { message: "Choose a valid time." }),
  timezone: z.string().trim().min(1, { message: "Choose a timezone." }),
});

/** The media reference the client got back from `/api/media/upload` or `/api/media/url`. */
export const postMediaSchema = z
  .object({
    kind: z.enum(["upload", "url", "library"]),
    storageKey: z.string().trim().min(1).max(512).nullable(),
    assetId: z.string().uuid().nullable().optional(),
    sourceUrl: z.string().trim().url().max(2048).nullish(),
    mediaType: z.enum(["image", "video"]),
    mimeType: acceptedMimeSchema,
    fileSize: nullableInt,
    width: nullableInt,
    height: nullableInt,
    duration: z.number().nonnegative().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "library" && !value.storageKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storageKey"],
        message: "Media upload is incomplete.",
      });
    }
    if (value.kind === "library" && !value.assetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetId"],
        message: "Choose a media library asset.",
      });
    }
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
    targets: z
      .array(postTargetSchema)
      .min(1, { message: "Select at least one account." }),
    schedule: scheduleSchema.nullable(),
    campaignId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const uniqueAccounts = new Set(value.targets.map((target) => target.socialAccountId));
    if (uniqueAccounts.size !== value.targets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: "Choose each account only once.",
      });
      return;
    }

    // The effective limit is the minimum across the selected platforms.
    const selectedPlatforms = [...new Set(value.targets.map((target) => target.platform))];
    const limit = captionLimitFor(selectedPlatforms);
    if (value.caption.length > limit) {
      const [first] = captionLimitConstrainers(selectedPlatforms, limit);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caption"],
        message: humanErrorMessage(first ?? selectedPlatforms[0], "caption_too_long"),
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
    targets: z.array(postTargetSchema),
    timezone: z.string().trim().min(1, { message: "Choose a timezone." }),
    campaignId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const uniqueAccounts = new Set(value.targets.map((target) => target.socialAccountId));
    if (uniqueAccounts.size !== value.targets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: "Choose each account only once.",
      });
      return;
    }

    if (value.targets.length === 0) return;
    const selectedPlatforms = [...new Set(value.targets.map((target) => target.platform))];
    const limit = captionLimitFor(selectedPlatforms);
    if (value.caption.length > limit) {
      const [first] = captionLimitConstrainers(selectedPlatforms, limit);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caption"],
        message: humanErrorMessage(first ?? selectedPlatforms[0], "caption_too_long"),
      });
    }
  });

const TEMPLATE_NAME_MAX_LENGTH = 80;

export const templateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Enter a template name." })
      .max(TEMPLATE_NAME_MAX_LENGTH, { message: "Template name is too long." }),
    caption: z
      .string()
      .trim()
      .max(MAX_CAPTION_LENGTH, { message: "This caption is too long." })
      .default(""),
    platforms: z
      .array(platformSchema)
      .max(PLATFORMS.length, { message: "Too many platforms selected." })
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.platforms).size !== value.platforms.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Choose each platform only once.",
      });
      return;
    }

    if (value.platforms.length > 0) {
      const limit = captionLimitFor(value.platforms);
      if (value.caption.length > limit) {
        const [first] = captionLimitConstrainers(value.platforms, limit);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["caption"],
          message: humanErrorMessage(first ?? value.platforms[0], "caption_too_long"),
        });
      }
    }
  });

export const saveAsTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Enter a template name." })
    .max(TEMPLATE_NAME_MAX_LENGTH, { message: "Template name is too long." }),
});

export const templateUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Enter a template name." })
      .max(TEMPLATE_NAME_MAX_LENGTH, { message: "Template name is too long." })
      .optional(),
    caption: z
      .string()
      .trim()
      .max(MAX_CAPTION_LENGTH, { message: "This caption is too long." })
      .optional(),
    platforms: z
      .array(platformSchema)
      .max(PLATFORMS.length, { message: "Too many platforms selected." })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.platforms && new Set(value.platforms).size !== value.platforms.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Choose each platform only once.",
      });
    }
    if (value.platforms && value.caption !== undefined && value.platforms.length > 0) {
      const limit = captionLimitFor(value.platforms);
      if (value.caption.length > limit) {
        const [first] = captionLimitConstrainers(value.platforms, limit);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["caption"],
          message: humanErrorMessage(first ?? value.platforms[0], "caption_too_long"),
        });
      }
    }
  });

const historyStatuses = [
  "draft",
  "scheduled",
  "processing",
  "published",
  "partial_failure",
  "failed",
  "cancelled",
] as const;

const historyPlatforms = [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "linkedin",
  "x",
] as const;

export const historyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(historyStatuses).optional(),
    platform: z.enum(historyPlatforms).optional(),
    accountId: z.string().uuid().optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Choose a valid start date." })
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Choose a valid end date." })
      .optional(),
    search: z.string().trim().max(200, { message: "Search is too long." }).optional(),
    sort: z.enum(["newest", "oldest", "scheduled", "published"]).default("newest"),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Choose an end date after the start date.",
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
export type TemplateInput = z.infer<typeof templateSchema>;
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
