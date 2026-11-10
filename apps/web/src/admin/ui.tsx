import { useState } from "react";
import { useLang } from "../components/lang";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border bg-white px-4 py-2.5 text-[15px] outline-none focus:border-[var(--accent)]";

export function Text(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} style={{ borderColor: "var(--border)" }} />;
}

export function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={3} className={inputCls} style={{ borderColor: "var(--border)" }} />;
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[#6E4E9C]"
      />
      <span className="text-[15px] font-bold">{label}</span>
    </label>
  );
}

export function LangTabs({ value, onChange }: { value: "en" | "ar"; onChange: (v: "en" | "ar") => void }) {
  return (
    <div className="flex gap-2" role="group" aria-label="language">
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={value === l}
          className="rounded-full px-5 py-1.5 text-sm font-bold"
          style={
            value === l
              ? { background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)" }
              : { background: "var(--surface)", color: "var(--muted)", fontFamily: "var(--font-display)" }
          }
        >
          {l === "en" ? "EN" : "AR"}
        </button>
      ))}
    </div>
  );
}

export function StringList({
  items,
  onChange,
  addLabel,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
}) {
  const { lang } = useLang();
  return (
    <div className="grid gap-2">
      {items.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={s}
            dir={lang === "ar" ? "rtl" : "ltr"}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={inputCls}
            style={{ borderColor: "var(--border)" }}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
            aria-label="remove"
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border"
            style={{ borderColor: "var(--border)", color: "#B3261E" }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="btn btn-secondary self-start"
        style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}
      >
        + {addLabel}
      </button>
    </div>
  );
}

/** Chip input: type a phrase, Enter to add it as a chip, × to remove. */
export function ChipInput({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const { lang } = useLang();
  const [val, setVal] = useState("");
  const commit = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...items, ...parts]);
    setVal("");
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2"
      style={{ borderColor: "var(--border)" }}
      onClick={(e) => {
        const input = e.currentTarget.querySelector("input");
        input?.focus();
      }}
    >
      {items.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"
          style={{ background: "var(--teal-soft)", color: "var(--kt-deep)" }}
        >
          {s}
          <button
            type="button"
            aria-label="remove"
            onClick={(e) => {
              e.stopPropagation();
              onChange(items.filter((_, k) => k !== i));
            }}
            className="grid h-5 w-5 place-items-center rounded-full"
            style={{ background: "rgba(0,0,0,0.08)" }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={val}
        dir={lang === "ar" ? "rtl" : "ltr"}
        placeholder={placeholder ?? (lang === "ar" ? "اكتب واضغط Enter" : "Type and press Enter")}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(val);
          } else if (e.key === "Backspace" && !val && items.length) {
            onChange(items.slice(0, -1));
          } else if (e.key === "," ) {
            e.preventDefault();
            commit(val);
          }
        }}
        className="min-w-[140px] flex-1 bg-transparent py-1.5 text-[15px] outline-none"
      />
    </div>
  );
}

export function RowActions({
  onUp,
  onDown,
  onDel,
  upFirst,
  downLast,
}: {
  onUp: () => void;
  onDown: () => void;
  onDel: () => void;
  upFirst?: boolean;
  downLast?: boolean;
}) {
  const btn =
    "grid h-9 w-9 place-items-center rounded-lg border text-sm font-bold disabled:opacity-30";
  return (
    <span className="flex flex-none gap-1.5">
      <button type="button" disabled={upFirst} onClick={onUp} aria-label="up" className={btn} style={{ borderColor: "var(--border)" }}>↑</button>
      <button type="button" disabled={downLast} onClick={onDown} aria-label="down" className={btn} style={{ borderColor: "var(--border)" }}>↓</button>
      <button type="button" onClick={onDel} aria-label="delete" className={btn} style={{ borderColor: "var(--border)", color: "#B3261E" }}>×</button>
    </span>
  );
}
