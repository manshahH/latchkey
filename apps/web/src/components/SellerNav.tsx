"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOut } from "./BuyerActions";
import { Logo } from "./Logo";

export interface SellerNavProps {
  sellerId: string;
  slug: string;
  login: string | null;
  otherSellers: { id: string; slug: string }[];
  attention: number;
}

export function SellerNav({ sellerId, slug, login, otherSellers, attention }: SellerNavProps) {
  const pathname = usePathname();
  const base = `/s/${sellerId}`;
  const items = [
    { href: base, label: "Home", exact: true, badge: attention },
    { href: `${base}/buyers`, label: "Buyers", exact: false, badge: 0 },
    { href: `${base}/products`, label: "Products", exact: false, badge: 0 },
    { href: `${base}/team`, label: "Team", exact: false, badge: 0 }
  ];
  const isCurrent = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo href={base} />
        {otherSellers.length === 0 ? (
          <span className="store">{slug}</span>
        ) : (
          <details className="store-switch">
            <summary className="store">{slug}</summary>
            <ul>
              {otherSellers.map((other) => (
                <li key={other.id}>
                  <Link href={`/s/${other.id}`}>{other.slug}</Link>
                </li>
              ))}
            </ul>
          </details>
        )}
        <span className="mobile-only">
          <SignOut />
        </span>
      </div>
      <nav aria-label="Store">
        <ul className="nav">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent(item.href, item.exact) ? "page" : undefined}
              >
                {item.label}
                {item.badge > 0 ? (
                  <span className="nav-badge" aria-label={`${String(item.badge)} need you`}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-foot">
        <span className="faint small">{login === null ? "Signed in" : `@${login}`}</span>
        <SignOut />
      </div>
    </aside>
  );
}
