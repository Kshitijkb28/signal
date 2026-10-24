import { Fragment } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { experience, sectionMeta } from "@/data/resume";
import { Entry } from "./experience/Entry";
import { TapeRule, TapeStrip } from "./experience/Tape";
import styles from "./experience/experience.module.css";
import shared from "./sections.module.css";

/** 02 EXPERIENCE (docs/DESIGN.md §7.3): a ledger on a sheet inset 56 px at lg so the board's tape shows beside it. */
export function Experience() {
  const meta = sectionMeta.experience;
  return (
    <Sheet id="experience" strip>
      <TapeStrip />
      <div className="container-x">
        <SheetHeader id="experience" index={meta.index} title={meta.label} annotation={meta.annotation} />
        <p className={shared.intro}>{meta.title.join(" ")}</p>
        <div className={styles.entries}>
          {experience.map((entry, i) => (
            <Fragment key={entry.id}>
              {i > 0 ? <TapeRule /> : null}
              <Entry entry={entry} />
            </Fragment>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
