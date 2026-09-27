import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessControls } from "@/components/AccessControls";
import { Icon } from "@/components/Icon";
import { StatePill } from "@/components/StatePill";
import { apiGet, pageNow } from "@/lib/api";
import { accessCopy, licenseNote } from "@/lib/access";
import { activityCopy } from "@/lib/activity";
import { ApiError } from "@/lib/errors";
import { formatDate, formatRelative, formatTime, handle } from "@/lib/format";
import { sellerLicensesSchema, timelineSchema, type Timeline } from "@/lib/schemas";
import { canChangeAccess, loadSellerContext } from "@/lib/seller";

export const metadata: Metadata = { title: "Buyer" };

const loadTimeline = async (sellerId: string, licenseId: string): Promise<Timeline> => {
  try {
    return await apiGet(`/sellers/${sellerId}/licenses/${licenseId}`, timelineSchema);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) notFound();
    throw error;
  }
};

export default async function BuyerPage({
  params
}: {
  params: Promise<{ sellerId: string; licenseId: string }>;
}) {
  const { sellerId, licenseId } = await params;
  const context = await loadSellerContext(sellerId);
  if (context === null) return null;
  const now = pageNow();
  const [timeline, licenses] = await Promise.all([
    loadTimeline(sellerId, licenseId),
    apiGet(`/sellers/${sellerId}/licenses`, sellerLicensesSchema)
  ]);
  const license = licenses.find((item) => item.id === licenseId);
  if (license === undefined) notFound();

  const name =
    license.githubLogin === null
      ? (license.purchaseEmail ?? "Unknown buyer")
      : handle(license.githubLogin);
  const note = licenseNote(license.status);
  const tone = accessCopy(license.observed).tone;
  const mayChange = canChangeAccess(context.seller.role);
  const accessIsOff = tone === "ended" || license.status === "revoked";

  return (
    <div className="stack-xl">
      <div className="stack">
        <Link className="back" href={`/s/${sellerId}/buyers`}>
          <Icon name="back" size={16} />
          Buyers
        </Link>
        <header className="buyer-head">
          <div className="stack-sm">
            <h1 className="headline">{name}</h1>
            <div className="row">
              <StatePill observed={license.observed} audience="seller" />
              {note === null ? null : <span className="muted small">{note}</span>}
            </div>
          </div>
          {mayChange ? (
            <div className="row">
              <AccessControls
                sellerId={sellerId}
                licenseId={licenseId}
                mode={accessIsOff ? "restore" : "revoke"}
              />
            </div>
          ) : null}
        </header>
      </div>

      {tone === "danger" ? (
        <div className="alert alert-danger" role="note">
          <Icon name="alert" className="icon" />
          <b>{name} cannot get in yet.</b>
          <p>
            The latest entry in the history below says why. Most often their invite ran out three
            times, or someone removed them in GitHub. Contact them at{" "}
            {license.purchaseEmail ?? "the email they paid with"} to sort it out.
          </p>
        </div>
      ) : null}

      <dl className="facts panel panel-pad">
        <div>
          <dt>Product</dt>
          <dd>{license.productName}</dd>
        </div>
        <div>
          <dt>Paid with</dt>
          <dd>{license.purchaseEmail ?? "Not shared"}</dd>
        </div>
        <div>
          <dt>GitHub</dt>
          <dd>{license.githubLogin === null ? "Not claimed yet" : handle(license.githubLogin)}</dd>
        </div>
        <div>
          <dt>Bought</dt>
          <dd className="tabular">{formatDate(license.purchasedAt)}</dd>
        </div>
        {license.seatsTotal > 1 ? (
          <div>
            <dt>Seats</dt>
            <dd className="tabular">
              {license.seatsClaimed} of {license.seatsTotal} in use
            </dd>
          </div>
        ) : null}
      </dl>

      {mayChange ? null : (
        <p className="faint small">
          You can view this buyer. Only owners and admins can change their access.
        </p>
      )}

      <section className="stack" aria-labelledby="history-title">
        <h2 id="history-title" className="section-title">
          History
        </h2>
        {timeline.activity.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing recorded yet.</h3>
            <p className="muted">
              Every change to this buyer&apos;s access will show up here with the reason.
            </p>
          </div>
        ) : (
          <div className="panel panel-pad">
            <ol className="timeline">
              {timeline.activity.map((row) => {
                const item = activityCopy(row.action, row.reason);
                return (
                  <li key={`${row.createdAt}-${row.action}-${row.reason}`} data-tone={item.tone}>
                    <div className="stack-xs">
                      <span className="timeline-title">{item.title}</span>
                      {item.detail === null ? null : <span className="muted">{item.detail}</span>}
                      <time
                        className="when tabular"
                        dateTime={row.createdAt}
                        title={`${formatDate(row.createdAt)}, ${formatTime(row.createdAt)} UTC`}
                      >
                        {formatRelative(row.createdAt, now)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
