import type {
  Platform,
  PostPlatformStatus,
  PostStatus,
  SocialAccountStatus,
} from "@/lib/status";

export type AccountSummary = {
  id: string | null;
  platform: Platform;
  status: SocialAccountStatus;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** `@username` for Instagram/TikTok, the page name for Facebook. */
  accountLabel: string | null;
  /** False when this platform's app credentials are missing from the server. */
  configured: boolean;
};

export type PlatformTarget = {
  id: string;
  platform: Platform;
  status: PostPlatformStatus;
  attemptCount: number;
  maxAttempts: number;
  externalPostId: string | null;
  /** Human sentence, already mapped through `humanErrorMessage`. */
  errorMessage: string | null;
  errorCode: string | null;
  canRetry: boolean;
  needsReconnect: boolean;
  accountLabel: string | null;
  publishedAt: Date | null;
};

export type MediaSummary = {
  id: string;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  previewUrl: string | null;
  storageKey: string | null;
  sourceUrl: string | null;
};

export type PostSummary = {
  id: string;
  contentText: string;
  status: PostStatus;
  timezone: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  platforms: PlatformTarget[];
};

export type ExecutionSummary = {
  id: string;
  platform: Platform;
  status: "accepted" | "processing" | "published" | "failed";
  attemptNumber: number;
  externalPostId: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  executedAt: Date | null;
};

export type PostDetail = PostSummary & {
  media: MediaSummary | null;
  executions: ExecutionSummary[];
};

export type DraftSummary = PostSummary & {
  hasMedia: boolean;
};

export type DraftDetail = PostDetail;

export type CalendarPlatform = Pick<
  PlatformTarget,
  "id" | "platform" | "status" | "accountLabel" | "errorMessage" | "canRetry"
>;

export type CalendarPost = {
  id: string;
  status: Extract<PostStatus, "scheduled" | "processing" | "failed" | "partial_failure">;
  scheduledAt: Date;
  timezone: string;
  captionPreview: string;
  platforms: CalendarPlatform[];
  canCancel: boolean;
  retryTargetIds: string[];
};

export type DashboardStats = {
  scheduled: number;
  publishing: number;
  published: number;
  failed: number;
};

export type DashboardData = {
  upcoming: PostSummary[];
  recent: PostSummary[];
  stats: DashboardStats;
  connectedAccounts: AccountSummary[];
  failedTargets: Array<{
    postId: string;
    caption: string;
    /** Number of platforms the post targets, used to choose "Retry" vs "Retry TikTok". */
    platformCount: number;
    target: PlatformTarget;
  }>;
};

export type ActionResult =
  | { ok: true; postId?: string }
  | { ok: false; message: string; code?: string };
