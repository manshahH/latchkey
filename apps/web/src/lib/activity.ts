import type { Tone } from "./access";

export interface ActivityCopy {
  title: string;
  detail: string | null;
  tone: Tone;
}

// The reconciler records its outcome in `action` and a generic internal reason. Those rows get
// plain-words titles here; every other row already carries a reason written for people.
const reconcilerReason = "reconciled desired state";

const titles: Record<string, [string, Tone]> = {
  paid: ["Paid", "ok"],
  claimed: ["Signed in and connected the purchase", "ok"],
  invited: ["GitHub invite sent", "wait"],
  queued: ["Waiting for GitHub to accept more invites", "wait"],
  active: ["Invite accepted, has access", "ok"],
  reconciled_active: ["Invite accepted, has access", "ok"],
  removed: ["Access removed", "ended"],
  reconciled_removed: ["Access removed", "ended"],
  none: ["No access on GitHub", "neutral"],
  needs_attention: ["Needs you", "danger"],
  error_retrying: ["GitHub was slow, retrying", "wait"],
  revoked: ["You removed access", "ended"],
  restored: ["You gave access back", "ok"],
  released: ["Seat freed up", "neutral"],
  license_refolded: ["License updated", "neutral"]
};

export const activityCopy = (action: string, reason: string): ActivityCopy => {
  const [title, tone]: [string, Tone] = titles[action] ?? ["Update", "neutral"];
  const detail = reason.trim() === "" || reason === reconcilerReason ? null : reason;
  return { title, detail, tone };
};
