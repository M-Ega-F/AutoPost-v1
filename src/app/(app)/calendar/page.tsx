import { cookies } from "next/headers";

import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/shared/page-header";
import { currentCalendarMonth, toCalendarDraftDto, toCalendarPostDto, calendarMonthRange } from "@/lib/calendar";
import { listDraftsForUser } from "@/lib/services/posts";
import { getCalendarForUser } from "@/lib/services/calendar";
import { requireUser } from "@/lib/auth/server";
import { getSettingsForUser } from "@/lib/services/settings";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function CalendarPage() {
  const user = await requireUser();
  const cookieStore = await cookies();
  const settings = await getSettingsForUser(
    user.id,
    normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
  );
  const timeZone = settings.timezone;
  const month = currentCalendarMonth(timeZone);
  const range = calendarMonthRange(month, timeZone);
  const [posts, drafts] = await Promise.all([
    getCalendarForUser(user.id, range),
    listDraftsForUser(user.id),
  ]);

  return (
    <>
      <PageHeader title="Calendar" subtitle={`Scheduled posts in ${timeZone}.`} />
      <CalendarView
        timeZone={timeZone}
        initialMonth={month}
        initialPosts={posts.map(toCalendarPostDto)}
        drafts={drafts.map(toCalendarDraftDto)}
      />
    </>
  );
}
