import { createContext, useContext } from "react";
import type { Lang, Strings } from "../i18n";

export type LangCtx = {
  lang: Lang;
  t: Strings;
  toggle: () => void;
};

export const LangContext = createContext<LangCtx | null>(null);

export function useLang(): LangCtx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang outside provider");
  return ctx;
}
