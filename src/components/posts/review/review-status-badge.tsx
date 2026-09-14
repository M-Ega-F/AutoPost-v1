import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/lib/domain/post-approvals";

const labels: Record<ApprovalStatus, string> = {
  not_required: "Approval not required",
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export function ReviewStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge variant={status === "approved" ? "success" : status === "in_review" ? "info" : status === "changes_requested" ? "warning" : "neutral"}>{labels[status]}</Badge>;
}
