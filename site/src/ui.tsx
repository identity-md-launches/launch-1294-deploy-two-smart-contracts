import { useEffect, useState, type ReactNode } from "react";
import { EXPLORER } from "./config";
import { short } from "./model";
import { projectPath } from "./routes";
import type { TxState } from "./wallet";

export function Copy({
  value,
  label = "Copy",
  small = true,
}: {
  value: string;
  label?: string;
  small?: boolean;
}) {
  const [status, setStatus] = useState("");
  useEffect(() => setStatus(""), [value]);
  const buttonText =
    status === "Copied" ? "Copied" : status ? "Copy failed" : label;
  return (
    <span className="copy-control">
      <button
        type="button"
        className={small ? "small" : ""}
        aria-label={`${buttonText}${label === "Copy" ? " full address" : ""}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Copied");
          } catch {
            setStatus(
              label === "Copy"
                ? "Copy unavailable. Open the address link to copy it."
                : "Copy unavailable. Select the text to copy it.",
            );
          }
        }}
      >
        {buttonText}
      </button>
      <span className="sr-only" role="status">
        {status}
      </span>
    </span>
  );
}
export function Address({
  value,
  copy = false,
  label,
}: {
  value: string;
  copy?: boolean;
  label?: string;
}) {
  return (
    <span className="address">
      <a
        href={`${EXPLORER}/address/${value}`}
        target="_blank"
        rel="noreferrer"
        title={value}
        aria-label={
          label
            ? `${label}: ${value} on Sepolia Etherscan`
            : `${value} on Sepolia Etherscan`
        }
      >
        {label ?? short(value)}
      </a>
      {copy && <Copy value={value} />}
    </span>
  );
}
export function ProjectLink({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  return (
    <a
      className="project-link"
      href={projectPath(value)}
      title={value}
      aria-label={`${label ?? short(value)}: open project ${value}`}
    >
      {label ?? short(value)}
    </a>
  );
}
export function TxStatus({ state }: { state?: TxState }) {
  return (
    <p
      className={`tx-status secondary ${state?.phase === "error" ? "alarm" : state?.phase === "success" ? "ok" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {state?.message}
      {state?.hash && (
        <>
          {" "}
          <a
            href={`${EXPLORER}/tx/${state.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction ↗
          </a>
        </>
      )}
    </p>
  );
}
export function CodeBlock({
  code,
  label = "Copy code",
}: {
  code: string;
  label?: string;
}) {
  return (
    <div className="code-block">
      <div className="code-actions">
        <Copy value={code} label={label} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
export function Frame({
  title,
  id,
  children,
  className = "",
  action,
}: {
  title: string;
  id: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`frame ${className}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="section-heading">
        <h2 id={`${id}-title`} tabIndex={-1}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Table({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className={className}>{children}</table>
    </div>
  );
}
export function DataMessage({
  error,
  loading,
  onRetry,
}: {
  error?: string;
  loading?: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="empty">
      <p className={error ? "alarm" : "dim"}>
        {error || (loading ? "Loading Sepolia data…" : "No data loaded.")}
      </p>
      {error && (
        <button className="small" onClick={onRetry}>
          Retry data
        </button>
      )}
    </div>
  );
}
