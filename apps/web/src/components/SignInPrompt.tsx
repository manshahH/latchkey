import { Icon } from "./Icon";

export function SignInPrompt({
  returnTo,
  title,
  body
}: {
  returnTo: string;
  title: string;
  body: string;
}) {
  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1 className="buyer-title">{title}</h1>
        <p className="muted buyer-lede">{body}</p>
      </div>
      <a
        className="btn btn-primary btn-lg buyer-cta"
        href={`/auth/github?returnTo=${encodeURIComponent(returnTo)}`}
      >
        <Icon name="github" />
        Sign in with GitHub
      </a>
      <p className="faint small">
        We only read your GitHub username and account number. We never ask for access to your code.
      </p>
    </div>
  );
}
