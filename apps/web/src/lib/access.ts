export type Observed =
  "active" | "error_retrying" | "invited" | "needs_attention" | "none" | "queued" | "removed";

export type Tone = "ok" | "wait" | "danger" | "ended" | "neutral";

export interface AccessCopy {
  tone: Tone;
  /** What a seller scanning a list of buyers needs to know. */
  seller: string;
  /** What the buyer needs to know, written so it never blames them. */
  buyer: string;
  buyerDetail: string;
}

const copy: Record<Observed, AccessCopy> = {
  none: {
    tone: "neutral",
    seller: "Not claimed",
    buyer: "Sign in to get your code",
    buyerDetail: "Sign in with GitHub so we know which account to let in."
  },
  queued: {
    tone: "wait",
    seller: "Queued",
    buyer: "Access is on its way",
    buyerDetail:
      "GitHub is busy with invites right now. You do not need to do anything. We will keep trying and email you when it is ready."
  },
  error_retrying: {
    tone: "wait",
    seller: "Retrying",
    buyer: "Access is on its way",
    buyerDetail:
      "GitHub is slow right now. You do not need to do anything. We will keep trying and email you when it is ready."
  },
  invited: {
    tone: "wait",
    seller: "Invite sent",
    buyer: "Accept your invite on GitHub",
    buyerDetail:
      "We sent an invite to your GitHub account. Accept it and the code is yours. If it runs out, we send a fresh one."
  },
  active: {
    tone: "ok",
    seller: "Has access",
    buyer: "You have access",
    buyerDetail: "The code is in your GitHub account now."
  },
  needs_attention: {
    tone: "danger",
    seller: "Needs you",
    buyer: "We are sorting out your access",
    buyerDetail:
      "Something on GitHub needs a person to look at it. The seller has been told. You do not need to do anything yet."
  },
  removed: {
    tone: "ended",
    seller: "Access ended",
    buyer: "Your access has ended",
    buyerDetail:
      "If you think this is wrong, contact the seller and include the email you paid with."
  }
};

export const isObserved = (value: string): value is Observed => value in copy;

export const accessCopy = (observed: string): AccessCopy =>
  isObserved(observed) ? copy[observed] : copy.none;

/** Filter groups on the seller's buyer list, in the order a seller cares about them. */
export type AccessGroup = "needs" | "waiting" | "ok" | "ended" | "unclaimed";

export const accessGroup = (observed: string): AccessGroup => {
  switch (accessCopy(observed).tone) {
    case "danger":
      return "needs";
    case "wait":
      return "waiting";
    case "ok":
      return "ok";
    case "ended":
      return "ended";
    default:
      return "unclaimed";
  }
};

/** License statuses that end access regardless of what GitHub currently shows. */
const endedStatuses: Record<string, string> = {
  refunded: "Refunded",
  charged_back: "Charged back",
  revoked: "Removed by you",
  ended: "Ended"
};

export const licenseNote = (status: string): string | null => {
  if (status in endedStatuses) return endedStatuses[status] ?? null;
  if (status === "disputed") return "Dispute open";
  if (status === "canceling") return "Cancels at period end";
  if (status === "grace") return "Payment overdue";
  if (status === "updates_ended") return "Updates ended";
  return null;
};
