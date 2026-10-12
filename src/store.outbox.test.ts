import { beforeEach, describe, expect, it } from "vitest";
import {
  clearQueuedPush,
  getQueuedPush,
  queueCourseDelete,
  queueCoursePush,
  type StoreCourse,
} from "./store";

const lt = { en: "", ar: "" };
const course = (slug: string): StoreCourse => ({
  slug,
  cat: "tech",
  bac: false,
  cta: { ...lt },
  name: { ...lt },
  designation: { ...lt },
  quote: { ...lt },
  duration: { ...lt },
  lessons: { ...lt },
  schedule: { ...lt },
  level: { ...lt },
  seats: { ...lt },
  seatsN: 6,
  price: null,
  photoCard: "",
  photoDetail: "",
  instructor: { name: { ...lt }, spec: { ...lt }, bio: { ...lt } },
  outcomes: { en: [], ar: [] },
  modules: { en: [{ t: "A", d: "" }], ar: [{ t: "", d: "" }] },
  sections: { en: [""], ar: [""] },
  videos: [{ src: "", mins: 10, assign: "", exam: "" }],
});

describe("push outbox", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", () => {
    expect(getQueuedPush("nope")).toBeNull();
  });

  it("round-trips a queued course snapshot", () => {
    queueCoursePush(course("s1"));
    const q = getQueuedPush("s1");
    expect(q?.course?.slug).toBe("s1");
    expect(q?.deleted).toBeUndefined();
    expect(typeof q?.at).toBe("number");
  });

  it("a delete tombstone overwrites a course queue and clears", () => {
    queueCoursePush(course("s2"));
    queueCourseDelete("s2");
    expect(getQueuedPush("s2")?.deleted).toBe(true);
    clearQueuedPush("s2");
    expect(getQueuedPush("s2")).toBeNull();
  });

  it("queues are per-slug", () => {
    queueCoursePush(course("a"));
    expect(getQueuedPush("b")).toBeNull();
  });
});
