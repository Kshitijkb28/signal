import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { sectionMeta } from "@/data/resume";
import { DepartureBoard } from "./stack/DepartureBoard";
import shared from "./sections.module.css";

/** 04 STACK (docs/DESIGN.md §7.5): the departure board of split-flap rows with SEEN IN cross-references. */
export function Stack() {
  const meta = sectionMeta.stack;
  return (
    <Sheet id="stack">
      <div className="container-x">
        <SheetHeader id="stack" index={meta.index} title={meta.label} annotation={meta.annotation} />
        <p className={shared.intro}>{meta.title.join(" ")}</p>
        <DepartureBoard />
      </div>
    </Sheet>
  );
}
