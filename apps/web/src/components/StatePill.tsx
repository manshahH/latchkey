import { accessCopy } from "@/lib/access";

export function StatePill({
  observed,
  audience
}: {
  observed: string;
  audience: "seller" | "buyer";
}) {
  const copy = accessCopy(observed);
  return (
    <span className={`pill pill-${copy.tone}`}>
      {audience === "seller" ? copy.seller : copy.buyer}
    </span>
  );
}

export function TonePill({
  tone,
  children
}: {
  tone: "ok" | "wait" | "danger" | "ended" | "neutral";
  children: string;
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
