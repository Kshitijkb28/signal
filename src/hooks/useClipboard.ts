"use client";

import { useCallback, useState } from "react";

/** Copies text with a fallback for browsers without navigator.clipboard (older Safari / insecure contexts). */
export function useClipboard(resetAfterMs = 1800) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      let ok = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          ok = false;
        }
      }
      setCopied(ok);
      if (ok) window.setTimeout(() => setCopied(false), resetAfterMs);
      return ok;
    },
    [resetAfterMs],
  );
  return { copied, copy };
}
