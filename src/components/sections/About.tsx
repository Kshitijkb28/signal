import clsx from "clsx";
import { Reveal } from "@/components/ui/Reveal";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { profile, sectionMeta } from "@/data/resume";
import { FactsTable } from "./about/FactsTable";
import { NowCell } from "./about/NowCell";
import { StatsRow } from "./about/StatsRow";
import styles from "./about/about.module.css";
import shared from "./sections.module.css";

/** 01 ABOUT (docs/DESIGN.md §7.2): intro + NOW cell left, paragraphs / facts / stats right at lg; one column on phones. */
export function About() {
  const meta = sectionMeta.about;
  return (
    <Sheet id="about">
      <div className={clsx("container-x", styles.grid)}>
        <SheetHeader id="about" index={meta.index} title={meta.label} annotation={meta.annotation} className={styles.header} />
        <div className={styles.lead}>
          <p className={shared.intro}>{meta.title.join(" ")}</p>
          <NowCell />
        </div>
        <div className={styles.body}>
          <Reveal as="p" lines className={styles.summary}>
            {profile.summary[0]}
          </Reveal>
          <Reveal as="p" lines delay={120} className={styles.summary2}>
            {profile.summary[1]}
          </Reveal>
          <FactsTable />
          <StatsRow />
        </div>
      </div>
    </Sheet>
  );
}
