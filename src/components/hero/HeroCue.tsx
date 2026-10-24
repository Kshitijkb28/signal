import clsx from "clsx";
import styles from "./hero.module.css";

/**
 * Scroll cue: a single disc that flips every 1.2 s (pure CSS rotateX, two faces). Still in calm / reduced motion
 * through the global animation rules; hidden on viewports shorter than 600 px.
 */
export function HeroCue() {
  return (
    <div className={clsx(styles.sub, styles.cue)} aria-hidden="true">
      <span className={styles.clip}>
        <span className={styles.line}>
          <span className={styles.disc}>
            <span className={clsx(styles.face, styles.faceOn)} />
            <span className={clsx(styles.face, styles.faceOff)} />
          </span>
        </span>
      </span>
    </div>
  );
}
