import { PageHeader } from "@/components/shared/page-header";
import { MediaLibrary } from "@/components/media/media-library";
import { requireUser } from "@/lib/auth/server";
import { listMediaForUser } from "@/lib/services/media";

export default async function MediaPage() {
  const user = await requireUser();
  const initial = await listMediaForUser(user.id, { page: 1, pageSize: 24 });

  return (
    <>
      <PageHeader title="Media Library" subtitle="Keep your images and videos ready to reuse in future posts." />
      <MediaLibrary initial={initial} />
    </>
  );
}
