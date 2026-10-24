import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { profile } from "@/data/resume";
import styles from "./about.module.css";

/** NOW cell: mono label, 2 px signal rule, the current line and the company link (docs/DESIGN.md §7.2). */
export function NowCell() {
  return (
    <div className={clsx("now-cell", styles.now)}>
      <span className="label">{profile.now.label}</span>
      <p className={styles.nowLine}>{profile.nowLine}</p>
      <a href={profile.now.href} className={styles.nowLink} data-cursor target="_blank" rel="noopener noreferrer">
        {profile.now.company}
        <ArrowUpRight className={styles.icon} aria-hidden="true" focusable="false" strokeWidth={1.5} />
        <span className="sr-only"> (opens in new tab)</span>
      </a>
    </div>
  );
}
