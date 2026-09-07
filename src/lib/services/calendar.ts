import "server-only";

import { listCalendarPosts } from "@/lib/domain/posts";
import type { CalendarPost } from "@/lib/domain/types";

export function getCalendarForUser(
  userId: string,
  range: { start: Date; end: Date },
): Promise<CalendarPost[]> {
  return listCalendarPosts(userId, range);
}
