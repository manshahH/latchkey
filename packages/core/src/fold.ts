import {
  type LicenseEvent,
  type LicenseState,
  type LicenseStatus,
  type RevokePolicy
} from "./types.js";

interface FoldAccumulator {
  cancellationEndsAt: Date | null;
  disputeKeepsAccess: boolean;
  graceStartedAt: Date | null;
  kind: "one_time" | "subscription" | null;
  status: LicenseStatus;
  updatesUntil: Date | null;
}

const orderedEvents = (events: readonly LicenseEvent[]): LicenseEvent[] =>
  [...events].sort(
    (left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() ||
      left.receivedAt.getTime() - right.receivedAt.getTime() ||
      left.id.localeCompare(right.id)
  );

const accessForStatus = (
  status: LicenseStatus,
  disputeKeepsAccess: boolean
): "present" | "absent" =>
  status === "active" ||
  status === "grace" ||
  status === "canceling" ||
  (status === "disputed" && disputeKeepsAccess)
    ? "present"
    : "absent";

export const foldLicense = (
  events: readonly LicenseEvent[],
  policy: RevokePolicy,
  now: Date
): LicenseState => {
  const state: FoldAccumulator = {
    cancellationEndsAt: null,
    disputeKeepsAccess: false,
    graceStartedAt: null,
    kind: null,
    status: "ended",
    updatesUntil: null
  };

  for (const event of orderedEvents(events)) {
    switch (event.type) {
      case "PaymentSucceeded":
        state.kind = event.data.kind;
        state.status = "active";
        state.updatesUntil = event.data.updatesUntil;
        state.graceStartedAt = null;
        state.cancellationEndsAt = null;
        state.disputeKeepsAccess = false;
        break;
      case "RefundIssued":
        if (
          (event.data.scope === "partial" && policy.partial_refund === "revoke") ||
          (event.data.scope === "full" && policy.full_refund === "revoke")
        ) {
          state.status = "refunded";
        }
        break;
      case "DisputeOpened":
        state.status = "disputed";
        state.disputeKeepsAccess = policy.dispute_opened === "keep";
        break;
      case "DisputeResolved":
        if (event.data.outcome === "lost") {
          state.status = "charged_back";
          state.disputeKeepsAccess = false;
        } else if (policy.dispute_won === "restore") {
          state.status = "active";
          state.disputeKeepsAccess = false;
        }
        break;
      case "SubscriptionActivated":
      case "SubscriptionRenewed":
        state.kind = "subscription";
        state.status = "active";
        state.graceStartedAt = null;
        state.cancellationEndsAt = null;
        state.disputeKeepsAccess = false;
        break;
      case "SubscriptionPastDue":
        state.status = "grace";
        state.graceStartedAt = event.occurredAt;
        break;
      case "SubscriptionCanceled":
        if (event.data.effective === "immediately") {
          state.status = "ended";
          state.cancellationEndsAt = null;
          state.disputeKeepsAccess = false;
        } else {
          state.status = "canceling";
          state.cancellationEndsAt = event.data.periodEnd;
        }
        break;
      case "SubscriptionEnded":
        state.status = "ended";
        state.cancellationEndsAt = null;
        state.disputeKeepsAccess = false;
        break;
      case "SeatsChanged":
        break;
      case "ManualRevoke":
        state.status = "revoked";
        state.disputeKeepsAccess = false;
        break;
      case "ManualRestore":
        state.status = "active";
        state.disputeKeepsAccess = false;
        break;
    }
  }

  if (
    state.status === "grace" &&
    state.graceStartedAt !== null &&
    now.getTime() >=
      state.graceStartedAt.getTime() + policy.past_due_grace_days * 24 * 60 * 60 * 1000
  ) {
    state.status = "ended";
  }

  if (
    state.status === "canceling" &&
    state.cancellationEndsAt !== null &&
    now.getTime() >= state.cancellationEndsAt.getTime()
  ) {
    state.status = "ended";
  }

  if (
    state.status === "active" &&
    state.kind === "one_time" &&
    state.updatesUntil !== null &&
    now.getTime() >= state.updatesUntil.getTime()
  ) {
    state.status = "updates_ended";
  }

  return {
    access: accessForStatus(state.status, state.disputeKeepsAccess),
    status: state.status
  };
};
