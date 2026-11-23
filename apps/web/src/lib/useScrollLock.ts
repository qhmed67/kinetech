import { useEffect } from "react";

type ScrollLockSnapshot = {
  scrollY: number;
  body: {
    overflow: string;
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overscrollBehavior: string;
  };
  html: {
    overflow: string;
    overscrollBehavior: string;
  };
};

let lockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function capture(): ScrollLockSnapshot {
  const body = document.body;
  const html = document.documentElement;
  return {
    scrollY: window.scrollY || window.pageYOffset || 0,
    body: {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overscrollBehavior: body.style.overscrollBehavior,
    },
    html: {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior,
    },
  };
}

function apply(s: ScrollLockSnapshot) {
  const body = document.body;
  const html = document.documentElement;
  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${s.scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function restore(s: ScrollLockSnapshot) {
  const body = document.body;
  const html = document.documentElement;
  html.style.overflow = s.html.overflow;
  html.style.overscrollBehavior = s.html.overscrollBehavior;
  body.style.overflow = s.body.overflow;
  body.style.overscrollBehavior = s.body.overscrollBehavior;
  body.style.position = s.body.position;
  body.style.top = s.body.top;
  body.style.left = s.body.left;
  body.style.right = s.body.right;
  body.style.width = s.body.width;
  const y = s.scrollY;
  // Restore after styles are back so the scroll position is valid.
  window.scrollTo(0, y);
}

/** Ref-counted scroll lock for native expanded overlays. */
export function acquireScrollLock(): void {
  if (!isBrowser()) return;
  if (lockCount === 0) {
    snapshot = capture();
    apply(snapshot);
  }
  lockCount += 1;
}

export function releaseScrollLock(): void {
  if (!isBrowser()) return;
  if (lockCount <= 0) {
    lockCount = 0;
    return;
  }
  lockCount -= 1;
  if (lockCount === 0 && snapshot) {
    const s = snapshot;
    snapshot = null;
    restore(s);
  }
}

export function getScrollLockCount(): number {
  return lockCount;
}

/** Test-only: reset module state. */
export function _resetScrollLockForTests(): void {
  lockCount = 0;
  snapshot = null;
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
    };
  }, [active]);
}
