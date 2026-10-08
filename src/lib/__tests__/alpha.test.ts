import { describe, expect, it } from "vitest";
import { groupCoursesAlpha } from "../alpha";

const named = (name: string) => ({ name });

describe("groupCoursesAlpha", () => {
  it("groups latin names under ordered letter headers", () => {
    const groups = groupCoursesAlpha(
      [named("Banana"), named("apple"), named("Avocado"), named("cherry")].map((o) => o.name).map(named),
      (c) => c.name,
      "en",
    );
    expect(groups.map((g) => g.letter)).toEqual(["A", "B", "C"]);
    expect(groups[0].items.map((c) => c.name)).toEqual(["apple", "Avocado"]);
  });

  it("skips empty letters and reorders when a new first-letter course appears", () => {
    const before = groupCoursesAlpha([named("Banana"), named("cherry")], (c) => c.name, "en");
    expect(before.map((g) => g.letter)).toEqual(["B", "C"]);
    const after = groupCoursesAlpha([named("Banana"), named("cherry"), named("apple")], (c) => c.name, "en");
    expect(after.map((g) => g.letter)).toEqual(["A", "B", "C"]);
  });

  it("groups arabic names and merges alef variants", () => {
    const groups = groupCoursesAlpha(
      [named("بايثون"), named("أحمد"), named("احمد"), named("تاج")],
      (c) => c.name,
      "ar",
    );
    expect(groups.map((g) => g.letter)).toEqual(["ا", "ب", "ت"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("buckets digits and blanks separately", () => {
    const groups = groupCoursesAlpha([named("3D Design"), named("Zebra")], (c) => c.name, "en");
    expect(groups.map((g) => g.letter)).toEqual(["#", "Z"]);
  });
});
