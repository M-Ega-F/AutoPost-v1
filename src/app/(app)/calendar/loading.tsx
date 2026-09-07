import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72" /></div>
      <Skeleton className="h-[620px] w-full rounded-lg" />
    </div>
  );
}
