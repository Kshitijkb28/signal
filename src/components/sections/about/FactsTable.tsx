import { Stagger } from "@/components/ui/Stagger";
import { facts, profile } from "@/data/resume";
import styles from "./about.module.css";

/** Splits a fact value around the current company so only that part becomes the link. */
function withCompanyLink(value: string) {
  const company = profile.now.company;
  const at = value.indexOf(company);
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <a href={profile.now.href} className={styles.factLink} data-cursor target="_blank" rel="noopener noreferrer">
        {company}
        <span className="sr-only"> (opens in new tab)</span>
      </a>
      {value.slice(at + company.length)}
    </>
  );
}

/**
 * Facts as a real table (label over value per cell): 1 × 4 below 360 px, 2 × 2 from 360 px. The display changes are
 * paired with explicit ARIA roles so every browser keeps exposing it as a table. The rows enter 40 ms apart (Stagger).
 */
export function FactsTable() {
  return (
    <table className={styles.facts} role="table">
      <caption className="sr-only">Facts</caption>
      <Stagger as="tbody" role="rowgroup">
        {facts.map((fact) => (
          <tr key={fact.label} role="row">
            <th scope="row" role="rowheader" className="label">
              {fact.label}
            </th>
            <td role="cell">{fact.label === profile.now.label ? withCompanyLink(fact.value) : fact.value}</td>
          </tr>
        ))}
      </Stagger>
    </table>
  );
}
