export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function DotGrid() {
  return (
    <div className="dotgrid" aria-hidden="true">
      {Array.from({ length: 16 }).map((_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
