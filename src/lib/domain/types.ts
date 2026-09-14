import type {
  Platform,
  PostPlatformStatus,
  PostStatus,
  SocialAccountStatus,
} from "@/lib/status";

export type AccountHealthStatus =
  | "healthy"
  | "expiring_soon"
  | "expired"
  | "needs_reconnect"
  | "disconnected"
  | "error"
  | "unknown";

export type UserSettings = {
  displayName: string | null;
  timezone: string;
  defaultScheduleTime: string;
};

export type MediaAssetSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video";
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  previewUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaginatedMediaAssets = {
  items: MediaAssetSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformCapabilities = {
  image: boolean;
  video: boolean;
  carousel: boolean;
  textOnly: boolean;
  scheduling: boolean;
  multipleAccounts: boolean;
  analytics: boolean;
};

export type AnalyticsMetricKey =
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "reach"
  | "impressions";

export type AnalyticsMetrics = Record<AnalyticsMetricKey, number | null>;

export type AnalyticsSnapshotStatus = "available" | "unavailable" | "failed";

export type AnalyticsSnapshot = AnalyticsMetrics & {
  id: string;
  postId: string;
  postPlatformId: string;
  platform: Platform;
  externalPostId: string | null;
  status: AnalyticsSnapshotStatus;
  errorMessage: string | null;
  collectedAt: Date;
};

export type AnalyticsPlatformSummary = {
  platform: Platform;
  status: AnalyticsSnapshotStatus | "no_data";
  metrics: AnalyticsMetrics & { engagement: number | null };
  collectedAt: Date | null;
};

export type AnalyticsOverview = {
  range: "7d" | "30d" | "all";
  platform: Platform | null;
  totalPublishedPosts: number;
  successRate: number | null;
  metrics: AnalyticsMetrics & { engagement: number | null };
  platforms: AnalyticsPlatformSummary[];
  topPosts: Array<{
    postId: string;
    caption: string;
    platform: Platform;
    metrics: AnalyticsMetrics & { engagement: number | null };
    collectedAt: Date;
  }>;
};

export type PostAnalyticsDetail = {
  postId: string;
  targets: Array<{
    postPlatformId: string;
    platform: Platform;
    status: AnalyticsSnapshotStatus | "no_data";
    latest: AnalyticsSnapshot | null;
    history: AnalyticsSnapshot[];
  }>;
};

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

/** Safe account-management data. Credential columns are intentionally absent. */
export type AccountManagementSummary = {
  id: string;
  platform: Platform;
  status: SocialAccountStatus;
  healthStatus: AccountHealthStatus;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accountLabel: string | null;
  configured: boolean;
  connectedAt: Date;
  lastValidatedAt: Date | null;
  tokenExpiresAt: Date | null;
  lastSuccessfulPublishAt: Date | null;
  lastFailedPublishAt: Date | null;
  scheduledPostCount: number;
  processingPostCount: number;
  pendingTargetCount: number;
  healthMessage: string | null;
  capabilities: PlatformCapabilities;
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
  analytics: PostAnalyticsDetail | null;
};

export type HistorySort = "newest" | "oldest" | "scheduled" | "published";

export type HistoryQuery = {
  page: number;
  pageSize: number;
  status?: PostStatus;
  platform?: Platform;
  accountId?: string;
  from?: string;
  to?: string;
  search?: string;
  sort: HistorySort;
};

export type PaginatedPosts = {
  items: PostSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DraftSummary = PostSummary & {
  hasMedia: boolean;
};

export type DraftDetail = PostDetail;

export type TemplateMediaSummary = Pick<
  MediaSummary,
  "id" | "mediaType" | "mimeType" | "fileSize" | "width" | "height" | "duration" | "previewUrl"
>;

export type ContentTemplateSummary = {
  id: string;
  name: string;
  contentText: string;
  platforms: Platform[];
  media: TemplateMediaSummary | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContentTemplateDetail = ContentTemplateSummary;

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

export type DashboardPerformance = {
  metrics: AnalyticsMetrics & { engagement: number | null };
  available: boolean;
  topPlatform: Platform | null;
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
  performance: DashboardPerformance;
};

export type ActionResult =
  | { ok: true; postId?: string }
  | { ok: false; message: string; code?: string };
