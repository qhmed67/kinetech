import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { i18n } from "./i18n";

type Language = "en" | "ar";

interface LangContextType {
  t: typeof i18n.en;
  lang: Language;
  toggle: () => void;
}

const LangContext = createContext<LangContextType | null>(null);

interface LangProviderProps {
  children: ReactNode;
}

export function LangProvider({ children }: LangProviderProps) {
  const [lang, setLang] = useState<Language>("en");

  useEffect(() => {
    // Load language preference from storage
    const savedLang = localStorage.getItem("kt-lang") as Language;
    if (savedLang && (savedLang === "en" || savedLang === "ar")) {
      setLang(savedLang);
    }
  }, []);

  const toggle = () => {
    const newLang = lang === "en" ? "ar" : "en";
    setLang(newLang);
    localStorage.setItem("kt-lang", newLang);
  };

  const t = i18n[lang];

  return (
    <LangContext.Provider value={{ t, lang, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) {
    throw new Error("useLang must be used within a LangProvider");
  }
  return context;
}