const STEPS = [
  { label: "Studio", note: "An idea leaves the identity", accent: "cobalt" as const },
  { label: "Authority", note: "A post earns the right to be heard", accent: "cobalt" as const },
  { label: "Inbound", note: "Someone replies", accent: "cobalt" as const },
  { label: "Relay", note: "The reply becomes a next move", accent: "orange" as const },
  { label: "Conversation", note: "The right person, with proof", accent: "orange" as const },
  { label: "Outcome", note: "Work happens in the world", accent: "orange" as const },
  { label: "Learning", note: "What worked returns to both systems", accent: "ink" as const },
];

export function GrowthLoop() {
  return (
    <ol className="mx-auto w-full max-w-2xl">
      {STEPS.map((step, i) => {
        const color =
          step.accent === "cobalt" ? "var(--cobalt)" : step.accent === "orange" ? "var(--orange)" : "var(--ink)";
        return (
          <li key={step.label} className="grid grid-cols-[3rem_1fr] gap-6 border-t border-line py-6 last:border-b">
            <span className="text-mono-regular pt-1 text-[12px]" style={{ color }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-[16px] font-medium text-ink">{step.label}</p>
              <p className="mt-1 text-[13px] text-graphite">{step.note}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
