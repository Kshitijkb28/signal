"use client";

import clsx from "clsx";
import { useEnter } from "@/components/ui/useEnter";
import { useRegion } from "@/hooks/useRegion";
import type { SectionId } from "@/lib/board/types";

export interface SheetProps {
  id: SectionId | "footer";
  children: React.ReactNode;
  className?: string;
  /** expose the 56 px tape strip on the left at ≥ lg (Experience) */
  strip?: boolean;
  as?: "section" | "footer";
  /** defaults to `${id}-title` (the SheetHeader h2) */
  labelledBy?: string | null;
}

/**
 * An opaque ruled sheet scrolling over the machine. Registers itself so the board never draws underneath.
 * `strip` insets the sheet by `--strip-w` from lg so the tape strip shows (render a `.strip` child for the
 * `strip-experience` region). Pass `sheet--clear` through className for a sheet whose `.panel` children carry
 * the paper and whose windows stay transparent (Projects). The top rule draws once when the sheet crosses the
 * 85 % line (`data-in`: pending → armed → done, see useEnter.ts).
 */
export function Sheet({ id, children, className, strip, as = "section", labelledBy }: SheetProps) {
  const ref = useRegion<HTMLElement>(id, "sheet");
  const state = useEnter(ref);
  const Tag = as;
  const labelled = labelledBy === null ? undefined : (labelledBy ?? `${id}-title`);
  return (
    <Tag ref={ref} id={id} aria-labelledby={labelled} className={clsx("sheet", strip && "sheet--strip", className)} data-in={state}>
      {children}
    </Tag>
  );
}
