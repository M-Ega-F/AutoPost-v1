export const YOUTUBE_PRIVACY_VALUES = ["private", "unlisted", "public"] as const;

export type YouTubePrivacy = (typeof YOUTUBE_PRIVACY_VALUES)[number];

export type YouTubePostSettings = {
  title: string;
  privacy: YouTubePrivacy;
};
