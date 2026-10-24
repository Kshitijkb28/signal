import clsx from "clsx";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { projects, sectionMeta } from "@/data/resume";
import { PrintProgress } from "./projects/PrintProgress";
import { Printout } from "./projects/Printout";
import styles from "./projects/projects.module.css";
import shared from "./sections.module.css";

/**
 * 03 PROJECTS (docs/DESIGN.md §7.4): three vertical printouts with sticky automaton windows. The sheet is clear so the
 * board shows through the windows; the header block and each text panel carry the paper themselves (`.panel`).
 */
export function Projects() {
  const meta = sectionMeta.projects;
  return (
    <Sheet id="projects" className="sheet--clear">
      <div className="container-x">
        <div className={clsx("panel", styles.lead)}>
          <SheetHeader id="projects" index={meta.index} title={meta.label} annotation={meta.annotation} />
          <p className={shared.intro}>{meta.title.join(" ")}</p>
        </div>
        <div className={styles.printouts}>
          {projects.map((project) => (
            <Printout key={project.id} project={project} />
          ))}
        </div>
      </div>
      <PrintProgress ids={projects.map((p) => p.id)} />
    </Sheet>
  );
}
