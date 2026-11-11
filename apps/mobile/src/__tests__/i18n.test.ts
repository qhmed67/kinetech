import { i18n } from "../i18n";

const LOCALES = ["en", "ar"] as const;

/** Deeply compare key shape between locales: every string path in `en`
 *  must exist in `ar` and vice versa (PRODUCT-RULES rule 11 — always both). */
function paths(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      paths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

function nonEmptyStrings(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      nonEmptyStrings(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

describe("i18n completeness", () => {
  const en = paths(i18n.en);
  const ar = paths(i18n.ar);

  it("has identical key shape in both locales", () => {
    expect([...en].sort()).toEqual([...ar].sort());
  });

  it("never renders an empty string in either locale", () => {
    for (const locale of LOCALES) {
      for (const path of nonEmptyStrings(i18n[locale])) {
        // Guard: any path present must hold a non-empty string.
        expect(
          path.split(".").reduce<unknown>((acc: unknown, k: string) => {
            if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
            return undefined;
          }, i18n[locale]),
        ).toBeTruthy();
      }
    }
  });

  it("exposes keys used by restored screens", () => {
    for (const locale of LOCALES) {
      expect(i18n[locale].watch.retryBtn).toBeTruthy();
      // Web shape: overview, courses, exams, assignments, profile, settings.
      expect(i18n[locale].dashboard.tabs).toHaveLength(6);
      expect(i18n[locale].catalog.searchPh).toBeTruthy();
      expect(i18n[locale].offline.banner).toBeTruthy();
      expect(i18n[locale].bac.faq.length).toBeGreaterThan(0);
      expect(i18n[locale].auth.inSubmit).toBeTruthy();
      expect(i18n[locale].contactPage.send).toBeTruthy();
      expect(i18n[locale].legal.pending).toBeTruthy();
    }
  });
});
