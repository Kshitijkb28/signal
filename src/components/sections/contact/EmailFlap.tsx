"use client";

import { useEffect, useRef, useState } from "react";
import { FlapText } from "@/components/flap/FlapText";
import { profile } from "@/data/resume";
import { useClipboard } from "@/hooks/useClipboard";
import { useUI } from "@/store/ui";
import styles from "./contact.module.css";

const COPIED_TEXT = "COPIED — TAP TO MAIL";
/** how long the copied state (and the second-click mailto window) lasts */
const COPIED_MS = 1600;
const MAILTO = `mailto:${profile.email}`;

/**
 * The email as a giant split-flap button: the first click copies the address and flips the cells to
 * "COPIED — TAP TO MAIL" for 1.6 s; a second click inside that window opens the mail app. If the clipboard is
 * unavailable the click falls through to mailto: so the button never does nothing.
 */
export function EmailFlap() {
  const { copy } = useClipboard();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    if (copied) {
      window.location.href = MAILTO;
      return;
    }
    const ok = await copy(profile.email);
    if (!ok) {
      window.location.href = MAILTO;
      return;
    }
    setCopied(true);
    useUI.getState().say("COPIED");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <>
      <button
        type="button"
        className={styles.emailButton}
        onClick={onClick}
        data-cursor
        aria-label={copied ? "Email copied. Press again to open your mail app." : `Copy email address ${profile.email}`}
      >
        <FlapText
          text={copied ? COPIED_TEXT : profile.email}
          size="email"
          animate="change"
          label={copied ? "Copied — tap to mail" : profile.email}
          className={styles.emailFlap}
        />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Email copied" : ""}
      </span>
    </>
  );
}
