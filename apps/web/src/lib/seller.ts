import { notFound } from "next/navigation";

import { apiGetOrSignedOut } from "./api";
import { viewerSchema, type Viewer } from "./schemas";

export interface SellerContext {
  viewer: Viewer;
  seller: Viewer["sellers"][number];
}

/**
 * Null when signed out. A seller the viewer does not belong to is a 404, the same answer the API
 * gives, so the UI never confirms another seller exists (invariant 6).
 */
export const loadSellerContext = async (sellerId: string): Promise<SellerContext | null> => {
  const viewer = await apiGetOrSignedOut("/me", viewerSchema);
  if (viewer === null) return null;
  const seller = viewer.sellers.find((item) => item.id === sellerId);
  if (seller === undefined) notFound();
  return { viewer, seller };
};

export const canChangeAccess = (role: string): boolean => role === "owner" || role === "admin";
