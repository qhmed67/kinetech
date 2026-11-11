import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

export function LangProvider({ children }: { children: ReactNode }) {
  // Web default: "ar" (getInitialLang falls back to ar unless saved en).
  const [lang, setLang] = useState<Language>("ar");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEY);
        if (mounted && (saved === "en" || saved === "ar")) {
          setLang(saved);
        }
      } catch {
        /* first run */
      }
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
