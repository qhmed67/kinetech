/* Alphabetical grouping for dropdowns (both scripts).
   - Groups by first letter in the active locale (Latin A–Z / Arabic ا–ي).
   - Only letters that own ≥1 course render — empty letters never appear,
     and a newly added "A" course automatically becomes the first group.
   - Alef variants (أ إ آ) merge into ا; digits/symbols fall into "#". */

export type AlphaGroup<T> = { letter: string; items: T[] };

function bucketOf(name: string): string {
  const chars = [...name.trim()];
  const first = chars[0];
  if (!first) return "#";
  if (/[0-9]/.test(first)) return "#";
  // Merge alef forms so أحمد and احمد land together.
  const norm = first.replace(/[أإآ]/g, "ا");
  // Strip diacritics/tatweel for grouping (display keeps originals).
  const clean = norm.normalize("NFD").replace(/[\u064B-\u0652\u0640]/g, "");
  const upper = clean.toLocaleUpperCase("ar-EG");
  if (!upper.trim() || /[^ء-غف-يA-Z]/i.test(upper)) return "#";
  return upper;
}

export function groupCoursesAlpha<T>(
  items: T[],
  nameOf: (item: T) => string,
  lang: "en" | "ar",
): AlphaGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = (nameOf(item) ?? "").trim();
    if (!name) continue;
    const letter = bucketOf(name);
    const list = groups.get(letter) ?? [];
    list.push(item);
    groups.set(letter, list);
  }
  const collator = new Intl.Collator(lang === "ar" ? "ar-EG" : "en-US");
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? -1 : b === "#" ? 1 : collator.compare(a, b)))
    .map(([letter, group]) => ({
      letter,
      items: [...group].sort((x, y) => collator.compare(nameOf(x), nameOf(y))),
    }));
}
