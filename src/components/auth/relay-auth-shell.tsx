import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";

type AuthTone = "orange" | "cobalt";

type ContextPoint = {
  title: string;
  detail: string;
};

type AuthShellProps = {
  tone?: AuthTone;
  stateLabel: string;
  heading: string;
  subheading: string;
  contextLabel: string;
  contextPoints: ContextPoint[];
  children: ReactNode;
};

export function RelayAuthShell({
  tone = "orange",
  stateLabel,
  heading,
  subheading,
  contextLabel,
  contextPoints,
  children,
}: AuthShellProps) {
  const toneColor = tone === "orange" ? "var(--orange-signal)" : "var(--cobalt-signal)";

  return (
    <main className="auth-experience gradient-mesh public-canvas">
      <div className="auth-experience__grain" aria-hidden="true" />
      <div className="auth-experience__signal" style={{ "--signal-color": toneColor } as CSSProperties} aria-hidden="true" />

      <div className="auth-experience__grid">
        <section className="auth-experience__context" aria-label="Relay context">
          <p className="auth-state-label" style={{ "--signal-color": toneColor } as CSSProperties}>
            <span className="auth-state-dot" aria-hidden="true" />
            {stateLabel}
          </p>

          <h1 className="auth-experience__heading">{heading}</h1>
          <p className="auth-experience__subheading">{subheading}</p>

          <div className="auth-context-panel">
            <p className="auth-context-panel__label">{contextLabel}</p>
            <ul className="auth-context-list" role="list">
              {contextPoints.map((point) => (
                <li key={point.title} className="auth-context-list__item">
                  <p className="auth-context-list__title">{point.title}</p>
                  <p className="auth-context-list__detail">{point.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-experience__surface" aria-label="Authentication form">
          {children}
        </section>
      </div>
    </main>
  );
}

type SurfaceProps = {
  chapter: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  tone?: AuthTone;
};

export function RelayAuthSurface({ chapter, title, subtitle, children, footer, tone = "orange" }: SurfaceProps) {
  const toneColor = tone === "orange" ? "var(--orange-signal)" : "var(--cobalt-signal)";
  return (
    <div className="auth-surface mark-corners" style={{ "--signal-color": toneColor } as CSSProperties}>
      <header className="auth-surface__header">
        <p className="auth-surface__chapter">{chapter}</p>
        <h2 className="auth-surface__title">{title}</h2>
        <p className="auth-surface__subtitle">{subtitle}</p>
      </header>

      <div className="auth-surface__body">{children}</div>

      {footer ? <footer className="auth-surface__footer">{footer}</footer> : null}
    </div>
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  success?: string | null;
  children: ReactNode;
};

export function RelayField({ label, htmlFor, hint, error, success, children }: FieldProps) {
  return (
    <div className={cn("auth-field", error ? "is-error" : success ? "is-success" : "") }>
      <div className="auth-field__label-row">
        <label htmlFor={htmlFor} className="auth-field__label">
          {label}
        </label>
        <span className="auth-field__live">active</span>
      </div>

      <div className="auth-field__control">{children}</div>

      {error ? <p className="auth-field__message is-error">{error}</p> : null}
      {!error && success ? <p className="auth-field__message is-success">{success}</p> : null}
      {!error && !success && hint ? <p className="auth-field__message">{hint}</p> : null}
    </div>
  );
}

type SubmitButtonProps = {
  idleLabel: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
};

export function RelaySubmitButton({ idleLabel, busyLabel, busy, disabled = false }: SubmitButtonProps) {
  return (
    <button type="submit" className="relay-cta auth-submit" disabled={disabled || busy}>
      <span className="relay-cta-pulse" aria-hidden="true" />
      <span>{busy ? busyLabel : idleLabel}</span>
      <span className="relay-cta-arrow" aria-hidden="true">
        {busy ? "..." : "->"}
      </span>
    </button>
  );
}

export function maskEmailAddress(value: string): string {
  const [name = "", domain = ""] = value.split("@");
  if (!name || !domain) return value;
  if (name.length <= 2) return `${name[0] ?? ""}*@${domain}`;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
