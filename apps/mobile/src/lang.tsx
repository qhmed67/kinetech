import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import { i18n } from "./i18n";

type Language = "en" | "ar";

interface LangContextType {
  t: typeof i18n.en;
  lang: Language;
  toggle: () => void;
}

const LangContext = createContext<LangContextType | null>(null);

const KEY = "kt-lang";
/** Last layout direction we asked the native side for (restart-safe marker). */
const DIR_KEY = "kt-dir";

/** Restart the app so a layout-direction change takes effect (RN needs it). */
function reloadApp() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require("expo-updates");
    if (Updates && typeof Updates.reloadAsync === "function") {
      void Updates.reloadAsync();
      return;
    }
  } catch {
    /* expo-updates not installed */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevSettings } = require("react-native");
    if (DevSettings && typeof DevSettings.reload === "function") DevSettings.reload();
  } catch {
    /* release build without a reload channel */
  }
}

/**
 * Mirror the web's document direction: the web sets `dir="rtl"` on <html> for
 * Arabic, which flips EVERY flex row (cards, nav, grids). React Native has no
 * document, so the app direction is set natively (I18nManager) and applied on
 * the next start. The marker keeps us from reloading forever when the native
 * preference did not survive a restart.
 */
export async function applyDirection(lang: Language) {
  const wantRTL = lang === "ar";
  const want = wantRTL ? "rtl" : "ltr";
  if (I18nManager.isRTL === wantRTL) return;
  I18nManager.allowRTL(true);
  let applied = "";
  try {
    applied = (await SecureStore.getItemAsync(DIR_KEY)) ?? "";
  } catch {
    /* no marker */
  }
  I18nManager.forceRTL(wantRTL);
  if (applied === want) {
    // We already asked for this direction and the native side did not keep
    // it: re-arm it for the next start, but never reload in a loop.
    return;
  }
  try {
    await SecureStore.setItemAsync(DIR_KEY, want);
  } catch {
    /* persisted best-effort */
  }
  reloadApp();
}

export function LangProvider({ children }: { children: ReactNode }) {
  // Web default: "ar" (getInitialLang falls back to ar unless saved en).
  const [lang, setLang] = useState<Language>("ar");

  useEffect(() => {
    let mounted = true;
    (async () => {
      let saved: Language | null = null;
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw === "en" || raw === "ar") saved = raw;
      } catch {
        /* first run */
      }
      // Web default is "ar" (getInitialLang falls back to ar unless saved en).
      const next: Language = saved ?? "ar";
      if (mounted) setLang(next);
      await applyDirection(next);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = () => {
    const next: Language = lang === "en" ? "ar" : "en";
    setLang(next);
    void SecureStore.setItemAsync(KEY, next).catch(() => {
      /* persisted best-effort */
    });
    void applyDirection(next);
  };

  const t = i18n[lang];

  return (
    <LangContext.Provider value={{ t, lang, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
