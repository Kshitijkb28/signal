import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";

export interface LinkRowProps {
  href: string;
  label: string;
  value?: string;
  external?: boolean;
  className?: string;
}

/**
 * 56 px ruled row: mono label, value, ArrowUpRight; inverse-video wipe on hover / focus, `--paper-2` when pressed.
 * Rows stack inside a `.link-rows` wrapper, which supplies the top rule. Below 40rem the label sits above the
 * value so long values (the email) wrap inside the row instead of the viewport.
 */
export function LinkRow({ href, label, value, external, className }: LinkRowProps) {
  return (
    <a href={href} className={clsx("link-row wipe", className)} data-cursor {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className="link-row__label label wipe-muted">{label}</span>
      <span className="link-row__value">{value ?? href}</span>
      <ArrowUpRight className="link-row__icon" aria-hidden="true" focusable="false" strokeWidth={1.5} />
      {external ? <span className="sr-only"> (opens in new tab)</span> : null}
    </a>
  );
}
