"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type SyntheticEvent } from "react";

import { errorMessage, postJson } from "@/lib/client";

type Mode = "revoke" | "restore";

const copy: Record<
  Mode,
  { button: string; title: string; body: string; confirm: string; placeholder: string }
> = {
  revoke: {
    button: "Remove access",
    title: "Remove this buyer's access?",
    body: "They will be taken off the team on GitHub within a minute. Their payment is not refunded. You can give access back later.",
    confirm: "Remove access",
    placeholder: "For example: shared the code publicly"
  },
  restore: {
    button: "Give access back",
    title: "Give this buyer access again?",
    body: "We will invite them again on GitHub. They will get an email and need to accept it.",
    confirm: "Give access back",
    placeholder: "For example: removed by mistake"
  }
};

export function AccessControls({
  sellerId,
  licenseId,
  mode
}: {
  sellerId: string;
  licenseId: string;
  mode: Mode;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = copy[mode];

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason.trim() === "") {
      setError("Add a short reason. It is saved in this buyer's history so everyone knows why.");
      return;
    }
    setBusy(true);
    setError(null);
    postJson(`/sellers/${sellerId}/licenses/${licenseId}/${mode}`, {
      reason: reason.trim()
    })
      .then(() => {
        dialog.current?.close();
        setBusy(false);
        setReason("");
        router.refresh();
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(errorMessage(cause));
      });
  };

  return (
    <>
      <button
        type="button"
        className={mode === "revoke" ? "btn btn-danger" : "btn btn-primary"}
        onClick={() => {
          dialog.current?.showModal();
        }}
      >
        {text.button}
      </button>
      <dialog ref={dialog} className="sheet" aria-labelledby={`${reasonId}-title`}>
        <form className="sheet-body" onSubmit={submit} noValidate>
          <h2 id={`${reasonId}-title`} className="sheet-title">
            {text.title}
          </h2>
          <p className="muted">{text.body}</p>
          <div className="field">
            <label htmlFor={reasonId}>Reason</label>
            <textarea
              id={reasonId}
              className="textarea"
              maxLength={500}
              value={reason}
              placeholder={text.placeholder}
              aria-invalid={error !== null}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <span className="hint">
              Saved in this buyer&apos;s history. The buyer does not see it.
            </span>
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                dialog.current?.close();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={mode === "revoke" ? "btn btn-danger" : "btn btn-primary"}
              disabled={busy}
            >
              {busy ? "Saving" : text.confirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
