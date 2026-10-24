import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Window } from "@/components/ui/Window";
import { caConfig } from "@/data/derived";
import type { Project } from "@/data/resume";
import { caPath, runCA } from "@/lib/board/ca";
import shared from "../sections.module.css";
import { PrintoutFrame } from "./PrintoutFrame";
import styles from "./projects.module.css";

/** Static automaton pattern: 64 cells wide, 40 generations (server-rendered, deterministic per project). */
const CA_WIDTH = 64;
const CA_ROWS = 40;

/**
 * One printout (docs/DESIGN.md §7.4): text panel in cols 1–5 and the sticky window in cols 6–12 at lg; on phones the
 * window comes first and the text panel scrolls up over it. The window holds the SSR SVG automaton that stays in
 * place for calm / reduced motion / 2d / no-JS visitors and sits under the live print otherwise. The Window is a
 * direct child of the frame so its sticky range is the whole printout. Motion: the frame rises and its top rule draws
 * on enter (PrintoutFrame), the name reveals by clipped lines (Reveal); the window border draws itself (Window).
 */
export function Printout({ project }: { project: Project }) {
  const ca = caConfig[project.id];
  const path = caPath(runCA(CA_WIDTH, ca.seed, ca.rule, CA_ROWS));
  const id = `project-${project.id}`;
  return (
    <PrintoutFrame id={id} className={clsx(styles.printout, "printout")} labelledBy={`${id}-title`}>
      <span className={clsx(styles.rule, "rule")} aria-hidden="true" />
      <Window id={project.id} className={styles.window}>
        <svg
          className={styles.ca}
          viewBox={`0 0 ${CA_WIDTH} ${CA_ROWS}`}
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          aria-hidden="true"
          focusable="false"
        >
          <path d={path} fill="currentColor" />
        </svg>
      </Window>
      <div className={clsx("panel", styles.text)}>
        <span className="label">{project.index}</span>
        <h3 id={`${id}-title`} className={styles.name}>
          <Reveal as="span" lines className={styles.nameLines}>
            {project.name}
          </Reveal>
        </h3>
        <p className={clsx("mono text-mono", styles.meta)}>
          {project.period}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {project.domain}
        </p>
        <p className={styles.blurb}>{project.blurb}</p>
        <ul className={shared.dashes} role="list">
          {project.bullets.map((bullet) => (
            <li key={bullet} className="bullet">
              {bullet}
            </li>
          ))}
        </ul>
        <ul className={clsx("cells", shared.tags)} role="list" aria-label="Tags">
          {project.tags.map((tag) => (
            <li key={tag} className="cell tag-cell">
              {tag}
            </li>
          ))}
        </ul>
        <Button href={project.href} external className={styles.cta}>
          Visit {project.domain}
        </Button>
        <p className={styles.caption}>{ca.caption}</p>
      </div>
    </PrintoutFrame>
  );
}
