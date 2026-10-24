import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";

export interface ButtonProps {
  href?: string;
  onClick?: () => void;
  /** ink = 1 px ink rectangle; primary = signal fill, paper text; text = underlined text link */
  variant?: "ink" | "primary" | "text";
  external?: boolean;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
  id?: string;
}

/**
 * Ink rectangle / primary signal fill / underlined text link. Every variant carries the inverse-video wipe,
 * `data-cursor` brackets and a 48 px minimum height. `external` renders ArrowUpRight plus the visually hidden
 * "(opens in new tab)" hint, so callers pass the bare label ("Résumé (PDF)", never a literal arrow).
 */
export function Button({ href, onClick, variant = "ink", external, children, className, type = "button", ariaLabel, id }: ButtonProps) {
  const cls = clsx("btn wipe", `btn--${variant}`, className);
  const label = ariaLabel && external ? `${ariaLabel} (opens in new tab)` : ariaLabel;
  const content = (
    <>
      {children}
      {external ? <ArrowUpRight aria-hidden="true" focusable="false" strokeWidth={1.75} /> : null}
      {external ? <span className="sr-only"> (opens in new tab)</span> : null}
    </>
  );
  if (href) {
    return (
      <a id={id} href={href} className={cls} data-cursor aria-label={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {content}
      </a>
    );
  }
  return (
    <button id={id} type={type} onClick={onClick} className={cls} data-cursor aria-label={label}>
      {content}
    </button>
  );
}
