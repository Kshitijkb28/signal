"use client";

import { useRegion } from "@/hooks/useRegion";

export interface GapProps {
  id: string;
  /** interlude word the board spells while this gap crosses the viewport */
  word: string;
}

/** Transparent band between sheets. Registers its rect + word with the board. */
export function Gap({ id, word }: GapProps) {
  const ref = useRegion<HTMLDivElement>(id, "gap", word);
  return <div ref={ref} className="gap" aria-hidden="true" data-word={word} />;
}
