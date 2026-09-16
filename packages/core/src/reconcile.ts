import { type DesiredGrant } from "./types.js";

export type ObservedGrantState =
  | "none"
  | "inviting"
  | "invited"
  | "active"
  | "invite_expired"
  | "invite_failed"
  | "needs_attention"
  | "removing"
  | "removed"
  | "removed_externally"
  | "error_retrying";

export interface ReconcileContext {
  hasOtherPresentGrants: boolean;
  hasUnmanagedTeams: boolean;
  invitationCreatedByUs: boolean;
  inviteNearExpiry: boolean;
  isOrgMember: boolean;
  provenance: "added_by_us" | "pre_existing";
  removeFromOrgWhenNoGrants: boolean;
}

export type ReconcileActionType =
  | "invite"
  | "reinvite"
  | "add_team_only"
  | "remove_team"
  | "remove_org"
  | "cancel_invite"
  | "noop"
  | "needs_attention";

export interface ReconcileAction {
  type: ReconcileActionType;
}

const action = (type: ReconcileActionType): ReconcileAction => ({ type });

const canRemoveOrg = (context: ReconcileContext): boolean =>
  context.provenance === "added_by_us" &&
  context.removeFromOrgWhenNoGrants &&
  !context.hasOtherPresentGrants &&
  !context.hasUnmanagedTeams;

export const planReconcile = (
  desired: Pick<DesiredGrant, "desired">,
  observed: ObservedGrantState,
  context: ReconcileContext
): ReconcileAction[] => {
  if (desired.desired === "present") {
    switch (observed) {
      case "active":
        return [action("noop")];
      case "inviting":
      case "invited":
        return context.inviteNearExpiry
          ? [action("cancel_invite"), action("reinvite")]
          : [action("noop")];
      case "none":
      case "removed":
        return [action(context.isOrgMember ? "add_team_only" : "invite")];
      case "invite_expired":
        return [action("reinvite")];
      case "removed_externally":
      case "invite_failed":
      case "needs_attention":
      case "removing":
      case "error_retrying":
        return [action("needs_attention")];
    }
  }

  switch (observed) {
    case "active":
      return canRemoveOrg(context)
        ? [action("remove_team"), action("remove_org")]
        : [action("remove_team")];
    case "inviting":
    case "invited":
      return context.invitationCreatedByUs ? [action("cancel_invite")] : [action("noop")];
    case "none":
    case "removed":
    case "removed_externally":
      return [action("noop")];
    case "invite_expired":
    case "invite_failed":
    case "needs_attention":
    case "removing":
    case "error_retrying":
      return [action("needs_attention")];
  }
};
