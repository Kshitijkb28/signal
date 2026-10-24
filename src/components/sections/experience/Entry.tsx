import clsx from "clsx";
import { Stagger } from "@/components/ui/Stagger";
import type { Experience } from "@/data/resume";
import shared from "../sections.module.css";
import styles from "./experience.module.css";
import { Stamp } from "./Stamp";

/**
 * One ledger entry (docs/DESIGN.md §7.3): sticky left column at lg (index, company, role, location, period),
 * numbered bullets and tag cells on the right; stacked on phones with the period first. Motion: the company name is
 * stamped (Stamp), the bullets rise 40 ms apart and the tag cells fade (Stagger) — all once in view, instant in calm.
 */
export function Entry({ entry }: { entry: Experience }) {
  const id = `experience-${entry.id}`;
  return (
    <article id={id} className={clsx(styles.entry, "entry")} aria-labelledby={`${id}-title`}>
      <div className={styles.side}>
        <span className="label">{entry.index}</span>
        <h3 id={`${id}-title`} className={styles.company}>
          <a href={entry.href} className={styles.companyLink} data-cursor target="_blank" rel="noopener noreferrer">
            <Stamp>{entry.company}</Stamp>
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </h3>
        <p className={styles.roleLine}>
          <span>{entry.role}</span>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <span className="sr-only">, </span>
          <span>{entry.location}</span>
        </p>
        <p className={clsx("mono text-mono", styles.period)}>{entry.period}</p>
      </div>
      <div className={styles.body}>
        <Stagger as="ol" className={clsx("ol-mono", shared.bullets)} role="list">
          {entry.bullets.map((bullet) => (
            <li key={bullet} className="bullet">
              {bullet}
            </li>
          ))}
        </Stagger>
        <Stagger as="ul" motion="fade" className={clsx("cells", shared.tags)} role="list" aria-label="Tags">
          {entry.tags.map((tag) => (
            <li key={tag} className="cell tag-cell">
              {tag}
            </li>
          ))}
        </Stagger>
      </div>
    </article>
  );
}
