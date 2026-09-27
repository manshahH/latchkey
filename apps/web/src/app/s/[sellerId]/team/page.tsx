import type { Metadata } from "next";

import { apiGet } from "@/lib/api";
import { handle } from "@/lib/format";
import { membersSchema } from "@/lib/schemas";
import { loadSellerContext } from "@/lib/seller";

export const metadata: Metadata = { title: "Team" };

const roles: Record<string, string> = {
  owner: "Owner. Can do everything an admin can, and decides who is on the team.",
  admin: "Admin. Can change buyers' access and settings.",
  viewer: "Viewer. Can see buyers and history, cannot change anything."
};

export default async function TeamPage({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  const context = await loadSellerContext(sellerId);
  if (context === null) return null;
  const members = await apiGet(`/sellers/${sellerId}/members`, membersSchema);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 className="headline">Team</h1>
        <p className="muted page-lede">People who can see or manage {context.seller.slug}.</p>
      </header>
      <ul className="members panel">
        {members.map((member) => (
          <li key={member.userId}>
            <span className="member-name">
              {member.login === null ? "Unknown account" : handle(member.login)}
            </span>
            <span className="muted small">{roles[member.role] ?? member.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
