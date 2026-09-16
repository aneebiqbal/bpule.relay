export function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-current opacity-60">
      {children}
    </span>
  );
}

export function SignalChip({
  kind,
  name,
  when,
  tone = "orange",
}: {
  kind: string;
  name: string;
  when: string;
  tone?: "orange" | "cobalt";
}) {
  return (
    <div className="srf-chip" style={{ borderColor: tone === "orange" ? "color-mix(in srgb, var(--orange) 40%, var(--bone-200))" : "color-mix(in srgb, var(--cobalt) 40%, var(--bone-200))" }}>
      <span style={{ color: tone === "orange" ? "var(--orange)" : "var(--cobalt)" }}>{kind}</span>
      <span className="text-ink">{name}</span>
      <span className="text-stone">{when}</span>
    </div>
  );
}

export function ProofSlip({
  index,
  title,
  tags,
  verified = true,
}: {
  index: string;
  title: string;
  tags: string[];
  verified?: boolean;
}) {
  return (
    <div className="srf-proof px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Tick>Project {index}</Tick>
        {verified && <Tick>Verified</Tick>}
      </div>
      <p className="mt-1.5 text-[13px] font-medium leading-snug text-ink">{title}</p>
      <p className="mt-1 text-mono-regular text-[10px] tracking-[0.06em] text-stone uppercase">
        {tags.join("  ·  ")}
      </p>
    </div>
  );
}

export function ConversationObject({
  from,
  time,
  body,
  intent,
  next,
}: {
  from: string;
  time: string;
  body: string;
  intent: string;
  next: string;
}) {
  return (
    <div className="border border-bone-200 bg-bone-000 px-4 py-4" style={{ borderRadius: 2, borderColor: "var(--bone-200)", background: "var(--bone-000)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <Tick>{from}</Tick>
        <Tick>{time}</Tick>
      </div>
      <p className="mt-3 text-[16px] leading-snug text-ink">{body}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-3" style={{ borderColor: "var(--bone-200)" }}>
        <div>
          <Tick>Intent</Tick>
          <p className="mt-1 text-[12px] text-ink">{intent}</p>
        </div>
        <div>
          <Tick>Next</Tick>
          <p className="mt-1 text-[12px] text-ink">{next}</p>
        </div>
      </div>
    </div>
  );
}
