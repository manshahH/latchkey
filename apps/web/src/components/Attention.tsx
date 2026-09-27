"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, postJson } from "@/lib/client";

import { Icon } from "./Icon";

export interface AttentionItem {
  key: string;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
  driftId?: string;
}

function Resolve({
  sellerId,
  driftId,
  canChange
}: {
  sellerId: string;
  driftId: string;
  canChange: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canChange) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-quiet"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          postJson(`/sellers/${sellerId}/drift/${driftId}/resolved`)
            .then(() => {
              router.refresh();
            })
            .catch((cause: unknown) => {
              setBusy(false);
              setError(errorMessage(cause));
            });
        }}
      >
        <Icon name="check" />
        {busy ? "Saving" : "Mark as done"}
      </button>
      {error === null ? null : (
        <p className="form-error attention-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function Attention({
  sellerId,
  items,
  canChange
}: {
  sellerId: string;
  items: AttentionItem[];
  canChange: boolean;
}) {
  return (
    <ul className="attention panel">
      {items.map((item) => (
        <li key={item.key}>
          <Icon name="alert" className="attention-icon" />
          <div className="stack-xs">
            <h3>{item.title}</h3>
            <p className="muted">{item.body}</p>
          </div>
          <div className="attention-actions">
            {item.href === undefined ? null : (
              <Link className="btn btn-secondary" href={item.href}>
                {item.hrefLabel ?? "Open"}
              </Link>
            )}
            {item.driftId === undefined ? null : (
              <Resolve sellerId={sellerId} driftId={item.driftId} canChange={canChange} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
