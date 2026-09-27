"use client";

import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";
import { z } from "zod";

import { errorMessage, postJson } from "@/lib/client";
import { toSlug } from "@/lib/slug";

export function CreateStore({ suggestion }: { suggestion: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(toSlug(suggestion));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = slug.replace(/-/g, "").length < 3;

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tooShort) {
      setError("Use at least 3 letters or numbers.");
      return;
    }
    setBusy(true);
    setError(null);
    postJson("/sellers", { slug })
      .then((data) => {
        const { id } = z.object({ id: z.string() }).parse(data);
        router.push(`/s/${id}`);
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(errorMessage(cause));
      });
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="store-slug">Store name</label>
        <input
          id="store-slug"
          className="input"
          value={slug}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="store-slug-hint"
          aria-invalid={error !== null}
          onChange={(event) => {
            setSlug(toSlug(event.target.value));
          }}
        />
        <span id="store-slug-hint" className="hint">
          Buyers will see <b className="mono">{slug === "" ? "your-store" : slug}</b>
        </span>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-lg buyer-cta" disabled={busy}>
        {busy ? "Creating your store" : "Create my store"}
      </button>
    </form>
  );
}
