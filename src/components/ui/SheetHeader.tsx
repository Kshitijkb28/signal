import clsx from "clsx";
import { FlapText } from "@/components/flap/FlapText";
import { Odometer } from "@/components/ui/Odometer";
import type { SectionId } from "@/lib/board/types";

export interface SheetHeaderProps {
  id: SectionId;
  /** "01" … "06" */
  index: string;
  /** section label, e.g. "About" (rendered as flap cells, upper-cased) */
  title: string;
  annotation?: string;
  className?: string;
}

/**
 * The 56 px header band: odometer index | flap h2 | mono annotation (hidden below 400 px). The h2 is the
 * section's `aria-labelledby` target and takes programmatic focus (tabindex -1) after menu navigation.
 * Sections render the intro line themselves, under the band.
 */
export function SheetHeader({ id, index, title, annotation, className }: SheetHeaderProps) {
  return (
    <header className={clsx("sheet-header", className)}>
      <Odometer value={Number(index)} digits={2} className="sheet-header__index" />
      <h2 id={`${id}-title`} className="sheet-header__title" tabIndex={-1}>
        <FlapText text={title.toUpperCase()} size="title" animate="enter" label={title} />
      </h2>
      {annotation ? <p className="sheet-header__note label">{annotation}</p> : null}
    </header>
  );
}
