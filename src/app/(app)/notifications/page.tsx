import { NotificationCenter } from "@/components/notifications/notification-center";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { getNotifications } from "@/lib/domain/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const data = await getNotifications(user.id, { page: 1, limit: 20 });
  return (
    <>
      <PageHeader title="Notifications" subtitle="Workspace activity and account alerts for you." />
      <NotificationCenter
        initialNotifications={data.notifications}
        initialPagination={data.pagination}
        initialUnreadCount={data.unreadCount}
      />
    </>
  );
}
