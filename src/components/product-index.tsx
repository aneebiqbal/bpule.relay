const RELAY_ITEMS = [
  { label: "Prospect Check", desc: "See fit before you write." },
  { label: "Leads", desc: "Every opportunity, scored." },
  { label: "Outreach", desc: "Drafted in your voice." },
  { label: "Replies", desc: "Know what to say back." },
  { label: "Follow-ups", desc: "Nothing goes quiet." },
  { label: "Jobs", desc: "Fresh listings, ranked by fit." },
  { label: "Proposals", desc: "Grounded in real proof." },
  { label: "Conversations", desc: "Full context, every stage." },
  { label: "Action Queue", desc: "Always your next move." },
  { label: "Accountability", desc: "What was sent, and why." },
];

const STUDIO_ITEMS = [
  { label: "Today", desc: "One idea worth writing." },
  { label: "Content Identity", desc: "What you can credibly say." },
  { label: "Ideas", desc: "A running list, always fresh." },
  { label: "Quick Capture", desc: "Save a thought before it's gone." },
  { label: "Journey", desc: "What you've built and learned." },
  { label: "Writing", desc: "Drafts in your voice." },
  { label: "Visual Concepts", desc: "A visual for every post." },
  { label: "Content Memory", desc: "What you've already said." },
  { label: "Taste", desc: "Calibrated to what you'd actually post." },
];

/** A dense, editorial index of both products — typography as the primary tool, not a 20-card grid. */
export function ProductIndex() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
      <IndexColumn title="Relay" accent="orange" items={RELAY_ITEMS} />
      <IndexColumn title="Studio" accent="cobalt" items={STUDIO_ITEMS} />
    </div>
  );
}

function IndexColumn({
  title,
  accent,
  items,
}: {
  title: string;
  accent: "orange" | "cobalt";
  items: { label: string; desc: string }[];
}) {
  const color = accent === "orange" ? "var(--orange)" : "var(--cobalt)";
  return (
    <div>
      <p className="text-label" style={{ color }}>
        {title}
      </p>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {items.map((item) => (
          <li key={item.label} className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-[14px] font-medium text-ink">{item.label}</span>
            <span className="text-right text-[12px] text-graphite">{item.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
