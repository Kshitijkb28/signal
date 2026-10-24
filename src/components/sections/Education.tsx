import clsx from "clsx";
import { DotMeter } from "@/components/ui/DotMeter";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { Stagger } from "@/components/ui/Stagger";
import { meters } from "@/data/derived";
import { education, sectionMeta } from "@/data/resume";
import styles from "./education.module.css";
import shared from "./sections.module.css";

/** 05 EDUCATION (docs/DESIGN.md §7.6): table rows with school, degree · field, period, score + 25-disc meter; the rows rise in one after another (Stagger), the meters flip in (DotMeter). */
export function Education() {
  const meta = sectionMeta.education;
  return (
    <Sheet id="education">
      <div className="container-x">
        <SheetHeader id="education" index={meta.index} title={meta.label} annotation={meta.annotation} />
        <p className={shared.intro}>{meta.title.join(" ")}</p>
        <table className={styles.table} role="table">
          <caption className="sr-only">Education</caption>
          <thead role="rowgroup">
            <tr className={styles.head} role="row">
              <th scope="col" role="columnheader" className="label">
                School
              </th>
              <th scope="col" role="columnheader" className="label">
                Degree
              </th>
              <th scope="col" role="columnheader" className="label">
                Period
              </th>
              <th scope="col" role="columnheader" className="label">
                Score
              </th>
            </tr>
          </thead>
          <Stagger as="tbody" role="rowgroup">
            {education.map((entry, i) => {
              const meter = meters[i];
              return (
                <tr key={entry.id} className={styles.row} role="row">
                  <th scope="row" role="rowheader" className={styles.school}>
                    {entry.school}
                  </th>
                  <td role="cell" className={clsx(styles.cell, styles.degree)}>
                    {entry.degree}
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, </span>
                    {entry.field}
                  </td>
                  <td role="cell" className={clsx(styles.cell, styles.period)}>
                    {entry.period}
                  </td>
                  <td role="cell" className={clsx(styles.cell, styles.score)}>
                    <span className={styles.scoreValue}>{entry.score}</span>
                    <DotMeter
                      full={meter.full}
                      partial={meter.partial}
                      total={meter.total}
                      label={`${entry.scoreValue} percent`}
                      className={styles.meter}
                    />
                  </td>
                </tr>
              );
            })}
          </Stagger>
        </table>
      </div>
    </Sheet>
  );
}
