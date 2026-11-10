import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

export type SeekProps = {
  /* corner — 0 to 32px (maps onto the stadium; radius stays fully round) */
  corner?: number;
  /* how far it leans toward the cursor — 0 to 100 */
  give?: number;
  /* how the width settles — 0 to 100 */
  spring?: number;
  /* the field at rest — 240 to 400px */
  width?: number;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  ariaLabel?: string;
};

const SHUT = 44;
const HEIGHT = 44;
/* (44 - 18) / 2 = 13 — centred in the circle AND aligned in the field */
const INSET = 13;
const MAGNET_R = 170;

export function Seek({
  corner = 32,
  give = 50,
  spring = 50,
  width = 320,
  placeholder = "Search",
  dir,
  ariaLabel = "Search",
}: SeekProps) {
  const OPEN = Math.min(400, Math.max(240, width));
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shutCenter = useRef({ x: 0, y: 0 });

  /* ONE NUMBER DRIVES EVERYTHING — the width is sprung, the rest
     (placeholder opacity/slide) is read off its progress. */
  const w = useMotionValue(SHUT);
  const ws = useSpring(w, { stiffness: 60 + spring * 6, damping: 22 });
  const p = useTransform(ws, [SHUT, OPEN], [0, 1]);
  const say = useTransform(p, [0.55, 1], [0, 1]);
  const sayX = useTransform(p, [0.55, 1], [10, 0]);

  /* magnet — small, capped, measured, off once open */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const magX = useSpring(mx, { stiffness: 300, damping: 18 });
  const magY = useSpring(my, { stiffness: 300, damping: 18 });

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    w.set(open ? OPEN : SHUT);
    if (!open) {
      mx.set(0);
      my.set(0);
    }
  }, [open, OPEN]); // eslint-disable-line react-hooks/exhaustive-deps

  /* record where the shut circle sits — the FRAME, which never moves */
  useEffect(() => {
    if (open || reduced) return;
    const measure = () => {
      const el = document.querySelector("[data-seek-box]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      shutCenter.current = { x: r.left + SHUT / 2, y: r.top + SHUT / 2 };
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, reduced ]);

  useEffect(() => {
    if (open || reduced || give <= 0) return;
    const onMove = (e: MouseEvent) => {
      const c = shutCenter.current;
      const dx = e.clientX - c.x;
      const dy = e.clientY - c.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist > MAGNET_R) {
        mx.set(0);
        my.set(0);
        return;
      }
      const pull =
        Math.pow(1 - dist / MAGNET_R, 1.4) * (2 + (give / 100) * 5);
      mx.set((dx / dist) * pull);
      my.set((dy / dist) * pull);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [open, reduced, give]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ONE SHAPE RULE — 0–32 all resolve at/above half-height, so the
     ends are fully round at every width: circle at 44, pill at 320. */
  const radius = Math.max(HEIGHT / 2, corner);

  return (
    <motion.div
      data-seek-box
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={() => {
        if (open) {
          inputRef.current?.focus();
          return;
        }
        /* THE PRESS IS A REAL BEAT — yields 90ms before it moves */
        setOpen(true);
        inputRef.current?.focus();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !open) {
          e.preventDefault();
          setOpen(true);
          inputRef.current?.focus();
        }
      }}
      whileTap={open ? undefined : { scale: 0.9, transition: { duration: 0.09 } }}
      style={{ width: ws, height: HEIGHT, borderRadius: radius, x: magX, y: magY }}
      className="relative flex-none cursor-pointer overflow-hidden bg-white text-neutral-500 ring-1 ring-neutral-200"
    >
      {/* THE LENS NEVER MOVES relative to the box */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -translate-y-1/2"
        style={{ insetInlineStart: INSET }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5L21 21" strokeLinecap="round" />
        </svg>
      </span>
      {/* the field was inside the whole time */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-sm text-neutral-400"
        style={{
          insetInlineStart: SHUT,
          opacity: val ? 0 : say,
          x: sayX,
        }}
      >
        {placeholder}
      </motion.span>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        dir={dir}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        tabIndex={open ? 0 : -1}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.value) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
            setOpen(false);
          }
        }}
        style={{ paddingInlineStart: SHUT }}
        className="absolute inset-0 h-full w-full bg-transparent pe-4 text-sm text-neutral-700 outline-none"
      />
    </motion.div>
  );
}
