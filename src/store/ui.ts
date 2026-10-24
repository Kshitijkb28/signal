import { create } from "zustand";
import type { BoardTelemetry, HeroMode, SectionId, Theme, Tier } from "@/lib/board/types";

export interface ReadoutMessage {
  id: number;
  text: string;
  /** performance.now() timestamp after which the readout returns to the section label */
  until: number;
}

interface UIState {
  /** render capability tier; null until detected in Providers */
  tier: Tier | null;
  setTier: (tier: Tier) => void;
  /** effective motion mode: prefers-reduced-motion OR the calm toggle OR saveData */
  calm: boolean;
  /** the user's own toggle (persisted) */
  calmPref: boolean;
  setCalm: (calm: boolean, pref?: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  activeSection: SectionId;
  setActiveSection: (id: SectionId) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  /** the board module has rendered its first frame */
  boardReady: boolean;
  setBoardReady: (ready: boolean) => void;
  heroMode: HeroMode;
  setHeroMode: (mode: HeroMode) => void;
  telemetry: BoardTelemetry;
  setTelemetry: (t: Partial<BoardTelemetry>) => void;
  /** transient readout message (COPIED, GOTO 03, NIGHT, CALM …) */
  message: ReadoutMessage | null;
  say: (text: string, ttl?: number) => void;
}

let messageId = 0;

export const useUI = create<UIState>((set, get) => ({
  tier: null,
  setTier: (tier) => set({ tier }),
  calm: false,
  calmPref: false,
  setCalm: (calm, pref) => set((s) => ({ calm, calmPref: pref ?? s.calmPref })),
  theme: "day",
  setTheme: (theme) => set({ theme }),
  activeSection: "top",
  setActiveSection: (activeSection) => set({ activeSection }),
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  boardReady: false,
  setBoardReady: (boardReady) => set({ boardReady }),
  heroMode: "echo",
  setHeroMode: (heroMode) => set({ heroMode }),
  telemetry: { cols: 0, rows: 0, fps: 0, renderer: "none", tier: null },
  setTelemetry: (t) => set((s) => ({ telemetry: { ...s.telemetry, ...t } })),
  message: null,
  say: (text, ttl = 1600) => {
    const id = ++messageId;
    set({ message: { id, text, until: performance.now() + ttl } });
    window.setTimeout(() => {
      if (get().message?.id === id) set({ message: null });
    }, ttl);
  },
}));
