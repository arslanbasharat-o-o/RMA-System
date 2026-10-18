import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { StatusText, type StatusTone } from "@/components/ui/status-text";

export type RecognitionStatus =
  | "queued"
  | "pending"
  | "processing"
  | "analyzing"
  | "suggested_match"
  | "candidate_found"
  | "verified"
  | "exact_match"
  | "review_required"
  | "needs_review"
  | "failed"
  | "unknown";

interface StatusTransitionProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

export function StatusTransition({ status, className = "", showIcon = true }: StatusTransitionProps) {
  const normalized = (status || "queued").toLowerCase().replace(/ /g, "_");
  let label = "Queued";
  let variant: StatusTone = "neutral";
  let icon = Clock3;
  let loading = false;

  switch (normalized) {
    case "completed":
      label = "Completed";
      variant = "success";
      icon = CheckCircle2;
      break;
    case "verified":
    case "exact_match":
    case "manually_verified":
      label = "Verified";
      variant = "success";
      icon = CheckCircle2;
      break;
    case "receiving":
      label = "Receiving";
      variant = "info";
      break;
    case "pending_upload":
      label = "Pending upload";
      variant = "warning";
      break;
    case "uploaded":
      label = "Uploaded";
      variant = "neutral";
      icon = CheckCircle2;
      break;
    case "draft":
      label = "Draft";
      break;
    case "archived":
      label = "Archived";
      break;
    case "processing":
    case "analyzing":
    case "reading_markings":
      label = "Processing";
      variant = "info";
      loading = true;
      break;
    case "suggested_match":
    case "candidate_found":
      label = "Candidate found";
      variant = "info";
      icon = HelpCircle;
      break;
    case "review_required":
    case "needs_review":
      label = "Needs Review";
      variant = "warning";
      icon = AlertTriangle;
      break;
    case "failed":
      label = "Failed";
      variant = "danger";
      icon = XCircle;
      break;
    case "unknown":
      label = "Unknown";
      icon = HelpCircle;
      break;
    case "pending":
    case "queued":
      label = "Queued";
      break;
  }

  return (
    <StatusText
      variant={variant}
      icon={icon}
      loading={loading}
      showIcon={showIcon}
      className={className}
      data-status={status}
    >
      {label}
    </StatusText>
  );
}
