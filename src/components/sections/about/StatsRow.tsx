import { Odometer } from "@/components/ui/Odometer";
import { stats } from "@/data/resume";
import styles from "./about.module.css";

/** Three ruled cells: odometer numeral + suffix, label, caption (docs/DESIGN.md §7.2). */
export function StatsRow() {
  return (
    <ul className={styles.stats} role="list">
      {stats.map((stat) => (
        <li key={stat.label} className={styles.stat}>
          <span className={styles.value}>
            <Odometer value={stat.value} digits={1} />
            {stat.suffix ? <span className={styles.suffix}>{stat.suffix.trim()}</span> : null}
          </span>
          <span className={styles.statLabel}>{stat.label}</span>
          {"caption" in stat ? <span className={styles.caption}>{stat.caption}</span> : null}
        </li>
      ))}
    </ul>
  );
}
