import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetScrollLockForTests,
  acquireScrollLock,
  getScrollLockCount,
  releaseScrollLock,
} from "./useScrollLock";

describe("useScrollLock", () => {
  const scrollTo = vi.fn();
  let originalScrollTo: typeof window.scrollTo;
  let originalScrollY: PropertyDescriptor | undefined;

  beforeEach(() => {
    _resetScrollLockForTests();
    document.body.style.cssText = "";
    document.documentElement.style.cssText = "";
    originalScrollTo = window.scrollTo;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollY", { value: 240, configurable: true, writable: true });
    scrollTo.mockClear();
  });

  afterEach(() => {
    _resetScrollLockForTests();
    document.body.style.cssText = "";
    document.documentElement.style.cssText = "";
    window.scrollTo = originalScrollTo;
    if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
  });

  it("locks body/html and restores exact scrollY on release", () => {
    acquireScrollLock();
    expect(getScrollLockCount()).toBe(1);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it("ref-counts two consumers and unlocks only on last release", () => {
    acquireScrollLock();
    acquireScrollLock();
    expect(getScrollLockCount()).toBe(2);
    expect(document.body.style.top).toBe("-240px");

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(1);
    expect(document.body.style.position).toBe("fixed");
    expect(scrollTo).not.toHaveBeenCalled();

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it("is safe on extra release and repeated toggles", () => {
    acquireScrollLock();
    releaseScrollLock();
    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);

    Object.defineProperty(window, "scrollY", { value: 10, configurable: true, writable: true });
    acquireScrollLock();
    expect(document.body.style.top).toBe("-10px");
    releaseScrollLock();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 10);

    Object.defineProperty(window, "scrollY", { value: 55, configurable: true, writable: true });
    acquireScrollLock();
    releaseScrollLock();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 55);
    expect(document.body.style.position).toBe("");
  });
});
