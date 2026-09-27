"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon, type IconName } from "./Icon";

const installCommand =
  "npx shadcn@latest add https://latchkey.example/r/aisha-studio/data-table.json";

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: "repo", label: "GitHub repo", icon: "github" },
  { id: "install", label: "One command install", icon: "terminal" },
  { id: "zip", label: "Zip download", icon: "box" }
];

export function DeliveryTabs() {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="delivery panel">
      <div className="delivery-tabs" role="tablist" aria-label="Delivery options" onKeyDown={onKey}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={active === index}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => {
              setActive(index);
            }}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="delivery-panel"
        role="tabpanel"
        id={`${base}-panel-${tabs[active]?.id ?? "repo"}`}
        aria-labelledby={`${base}-tab-${tabs[active]?.id ?? "repo"}`}
      >
        {active === 0 && (
          <div className="stack">
            <p>
              Buyers join a team in your GitHub organization with read access to the repos you pick.
            </p>
            <div className="demo-line">
              <span className="pill pill-ok">Has access</span>
              <span>
                <b>@bilal-k</b> joined <span className="mono">aisha-studio/buyers</span>, read only
              </span>
            </div>
            <p className="faint small">Works with private repos. Your own team is never touched.</p>
          </div>
        )}
        {active === 1 && (
          <div className="stack">
            <p>
              Sell shadcn components. Each buyer gets their own token and installs with one command.
            </p>
            <pre className="code">
              <code>{installCommand}</code>
            </pre>
            <p className="faint small">
              Revoke a token and that command stops working. Nothing else changes.
            </p>
          </div>
        )}
        {active === 2 && (
          <div className="stack">
            <p>
              Publish a GitHub release and we build the zip. Buyers download the version they paid
              for.
            </p>
            <div className="demo-line">
              <Icon name="download" />
              <span>
                <b className="mono">starter-kit-pro-v2.1.0.zip</b>
                <span className="faint"> built from release v2.1.0</span>
              </span>
            </div>
            <p className="faint small">Download links are private and last five minutes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
