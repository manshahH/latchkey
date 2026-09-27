"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { errorMessage, getJson, postJson } from "@/lib/client";

import { Icon } from "./Icon";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

function ErrorLine({ status }: { status: Status }) {
  return status.kind === "error" ? (
    <p className="form-error" role="alert">
      {status.message}
    </p>
  ) : null;
}

export function ConfirmClaim({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-primary btn-lg buyer-cta"
        disabled={status.kind === "busy"}
        onClick={() => {
          setStatus({ kind: "busy" });
          postJson(`/buyer/claims/${token}`)
            .then((data) => {
              const { licenseId } = z.object({ licenseId: z.string() }).parse(data);
              router.push(`/access/${licenseId}`);
            })
            .catch((error: unknown) => {
              setStatus({ kind: "error", message: errorMessage(error) });
            });
        }}
      >
        {status.kind === "busy" ? "Connecting your purchase" : "Connect and get my code"}
      </button>
      <ErrorLine status={status} />
    </div>
  );
}

export function ResendClaim({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | { kind: "sent" }>({ kind: "idle" });
  if (status.kind === "sent")
    return (
      <div className="alert alert-ok" role="status">
        <Icon name="check" className="icon" />
        <p>
          <b>Check your email.</b> We sent a new link to the address used at checkout. It can take a
          minute to arrive.
        </p>
      </div>
    );
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-primary btn-lg buyer-cta"
        disabled={status.kind === "busy"}
        onClick={() => {
          setStatus({ kind: "busy" });
          postJson(`/buyer/claims/${token}/resend`)
            .then(() => {
              setStatus({ kind: "sent" });
            })
            .catch((error: unknown) => {
              setStatus({ kind: "error", message: errorMessage(error) });
            });
        }}
      >
        {status.kind === "busy" ? "Sending" : "Email me a new link"}
      </button>
      <ErrorLine status={status.kind === "error" ? status : { kind: "idle" }} />
    </div>
  );
}

export function SignOut({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        postJson("/logout")
          .catch(() => undefined)
          .finally(() => {
            router.refresh();
          });
      }}
    >
      {label}
    </button>
  );
}

export function DownloadButton({ licenseId }: { licenseId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={status.kind === "busy"}
        onClick={() => {
          setStatus({ kind: "busy" });
          getJson(`/buyer/access/${licenseId}/download`)
            .then((data) => {
              const { url } = z.object({ url: z.string().url() }).parse(data);
              setStatus({ kind: "idle" });
              window.location.assign(url);
            })
            .catch((error: unknown) => {
              setStatus({ kind: "error", message: errorMessage(error) });
            });
        }}
      >
        <Icon name="download" />
        {status.kind === "busy" ? "Preparing your download" : "Download the latest zip"}
      </button>
      <ErrorLine status={status} />
    </div>
  );
}

export function TokenCreator({ licenseId }: { licenseId: string }) {
  const [status, setStatus] = useState<Status | { kind: "made"; token: string; copied: boolean }>({
    kind: "idle"
  });
  if (status.kind === "made")
    return (
      <div className="stack-sm">
        <p>
          <b>Copy this token now.</b> For your safety we only show it once.
        </p>
        <div className="token-row">
          <code className="token">{status.token}</code>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(status.token)
                .then(() => {
                  setStatus({ ...status, copied: true });
                })
                .catch(() => undefined);
            }}
          >
            <Icon name={status.copied ? "check" : "copy"} />
            {status.copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={status.kind === "busy"}
        onClick={() => {
          setStatus({ kind: "busy" });
          postJson(`/buyer/access/${licenseId}/tokens`)
            .then((data) => {
              const { token } = z.object({ token: z.string() }).parse(data);
              setStatus({ kind: "made", token, copied: false });
            })
            .catch((error: unknown) => {
              setStatus({ kind: "error", message: errorMessage(error) });
            });
        }}
      >
        <Icon name="terminal" />
        {status.kind === "busy" ? "Making your token" : "Make an install token"}
      </button>
      <ErrorLine status={status.kind === "error" ? status : { kind: "idle" }} />
    </div>
  );
}
