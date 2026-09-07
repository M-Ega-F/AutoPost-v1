import "server-only";

import { getDashboardForUser } from "@/lib/services/posts";
import type { DashboardData } from "@/lib/domain/types";

export function getDashboardService(userId: string): Promise<DashboardData> {
  return getDashboardForUser(userId);
}
