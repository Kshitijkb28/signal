import clsx from "clsx";
import { StaticField } from "@/components/board/StaticField";
import { Button } from "@/components/ui/Button";
import { heroCtas } from "@/data/derived";
import { profile } from "@/data/resume";
import { heroCtaId } from "./ctas";
import { HeroCue } from "./HeroCue";
import { HeroHeading } from "./HeroHeading";
import { HeroRegion } from "./HeroRegion";
import { HeroShell } from "./HeroShell";
import styles from "./hero.module.css";

/**
 * "The Board" (docs/DESIGN.md §7.1, §5). Server-rendered: the h1 is the LCP element and never waits for JS.
 * Sub-copy (`.sub`) sits inside clipped line wrappers that are held only for JS users with motion on and slide in
 * once HeroShell sets `data-reveal` on the section (min(T + 1650, 1800 ms)); a 3 s CSS safety timer reveals them
 * regardless. Every text block is a board region: `hero-h1` (+ `excl-h1` in echo mode), `excl-eyebrow`,
 * `excl-hook`, `excl-cta`, and the `hero-echo` band.
 */
export function Hero() {
  return (
    <HeroShell>
      <StaticField className={styles.field} />
      <div className={clsx("container-x", styles.inner)}>
        <div className={styles.top}>
          <HeroRegion as="p" id="excl-eyebrow" kind="exclusion" className={clsx("label", styles.sub, styles.eyebrow)}>
            <span className={styles.clip}>
              <span className={styles.line}>{profile.eyebrow}</span>
            </span>
          </HeroRegion>
          <HeroHeading className={styles.h1}>
            <span className={styles.name}>{profile.firstName}</span>
            <span className={styles.name}>{profile.lastName}</span>
          </HeroHeading>
          <HeroRegion id="hero-echo" kind="echo" className={clsx("echo-band", styles.echo)} aria-hidden />
        </div>
        <div className={styles.bottom}>
          <HeroRegion as="p" id="excl-hook" kind="exclusion" className={clsx(styles.sub, styles.hook)}>
            <span className={styles.clip}>
              <span className={styles.line}>{profile.hook}</span>
            </span>
          </HeroRegion>
          <HeroRegion id="excl-cta" kind="exclusion" className={clsx(styles.sub, styles.ctas)}>
            <div className={styles.clip}>
              <div className={clsx(styles.line, styles.ctaGrid)}>
                {heroCtas.map((cta) => (
                  <Button
                    key={cta.key}
                    id={heroCtaId(cta.key)}
                    href={cta.href}
                    variant={cta.variant}
                    external={cta.external}
                    className={cta.variant === "text" ? styles.resume : undefined}
                  >
                    {cta.label}
                  </Button>
                ))}
              </div>
            </div>
          </HeroRegion>
          <HeroCue />
        </div>
      </div>
    </HeroShell>
  );
}
