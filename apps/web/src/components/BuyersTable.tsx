"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { licenseNote } from "@/lib/access";
import { filterCounts, filters, visibleBuyers, type BuyerFilter } from "@/lib/buyers";
import { formatDate, handle } from "@/lib/format";
import type { SellerLicense } from "@/lib/schemas";

import { Icon } from "./Icon";
import { StatePill } from "./StatePill";

export function BuyersTable({
  sellerId,
  licenses,
  initialFilter
}: {
  sellerId: string;
  licenses: SellerLicense[];
  initialFilter: BuyerFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<BuyerFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const counts = useMemo(() => filterCounts(licenses), [licenses]);
  const rows = useMemo(() => visibleBuyers(licenses, filter, query), [licenses, filter, query]);
  const showSeats = licenses.some((license) => license.seatsTotal > 1);

  const choose = (next: BuyerFilter) => {
    setFilter(next);
    router.replace(next === "all" ? pathname : `${pathname}?show=${next}`, { scroll: false });
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <label htmlFor="buyer-search" className="sr-only">
            Search buyers
          </label>
          <input
            id="buyer-search"
            className="input"
            type="search"
            placeholder="Search by handle, email, or product"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
        <div className="segments" role="group" aria-label="Show">
          {filters
            .filter((item) => item.id === "all" || counts[item.id] > 0 || item.id === filter)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="segment"
                aria-pressed={filter === item.id}
                onClick={() => {
                  choose(item.id);
                }}
              >
                {item.label}
                <span className="count">{counts[item.id]}</span>
              </button>
            ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        {rows.length} buyers shown
      </p>

      {rows.length === 0 ? (
        <div className="panel empty">
          <h3>
            {query.trim() === "" ? "Nobody here right now." : `No buyers match "${query.trim()}".`}
          </h3>
          <p className="muted">
            {query.trim() === ""
              ? "Try another filter."
              : "Check the spelling, or search by the email they paid with."}
          </p>
          {filter === "all" && query.trim() === "" ? null : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setQuery("");
                choose("all");
              }}
            >
              Show everyone
            </button>
          )}
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Buyer</th>
                <th scope="col">Product</th>
                <th scope="col">Access</th>
                {showSeats ? <th scope="col">Seats</th> : null}
                <th scope="col">Bought</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((license) => {
                const note = licenseNote(license.status);
                return (
                  <tr key={license.id}>
                    <td data-cell="primary">
                      <Link className="row-link" href={`/s/${sellerId}/buyers/${license.id}`}>
                        {license.githubLogin === null
                          ? (license.purchaseEmail ?? "Unknown buyer")
                          : handle(license.githubLogin)}
                      </Link>
                      {license.githubLogin === null || license.purchaseEmail === null ? null : (
                        <span className="cell-sub">{license.purchaseEmail}</span>
                      )}
                    </td>
                    <td data-cell="meta">
                      {license.productName}
                      {note === null ? null : <span className="cell-note"> {note}</span>}
                    </td>
                    <td data-cell="state">
                      <StatePill observed={license.observed} audience="seller" />
                    </td>
                    {showSeats ? (
                      <td data-cell="hide-sm" className="tabular">
                        {license.seatsTotal > 1
                          ? `${String(license.seatsClaimed)} of ${String(license.seatsTotal)}`
                          : ""}
                      </td>
                    ) : null}
                    <td data-cell="hide-sm" className="faint tabular">
                      {formatDate(license.purchasedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
