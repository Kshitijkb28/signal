import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { SITE, links, profile } from "@/data/resume";
import { BackToTop } from "./footer/BackToTop";
import { BoardTail } from "./footer/BoardTail";
import styles from "./footer/footer.module.css";

const EXTERNAL = [links.linkedin, links.github] as const;

/** Footer (docs/DESIGN.md §7.8): name · role, location · © year, links and Back to top; then the bare board tail. */
export function Footer() {
  return (
    <>
      <Sheet id="footer" as="footer" labelledBy={null} className={styles.footer}>
        <div className={clsx("container-x", styles.grid)}>
          <p className={styles.col}>
            <span className={styles.name}>{profile.name}</span>
            <span aria-hidden="true">·</span>
            <span className="sr-only">, </span>
            <span>{profile.role}</span>
          </p>
          <p className={clsx("mono text-mono text-ink-2", styles.col)}>
            <span>{profile.location}</span>
            <span aria-hidden="true">·</span>
            <span className="sr-only">, </span>
            <span>© {SITE.year}</span>
          </p>
          <ul className={styles.links} role="list">
            {EXTERNAL.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={styles.link} data-cursor target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <ArrowUpRight className={styles.icon} aria-hidden="true" focusable="false" strokeWidth={1.5} />
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
            ))}
            <li>
              <a href={links.site.href} className={styles.link} data-cursor>
                {links.site.label}
              </a>
            </li>
            <li>
              <BackToTop className={styles.link} />
            </li>
          </ul>
        </div>
      </Sheet>
      <BoardTail />
    </>
  );
}
