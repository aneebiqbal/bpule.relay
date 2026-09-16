/**
 * "Relay Signal" — the hero's generated-artwork backdrop. Dozens of faint
 * lines drift through the field; one orange path resolves into a straight,
 * structured line running toward the console. Pure SVG geometry — no raster
 * assets — so it stays crisp at any density and themes with the page.
 */
export function HeroSignalArtwork() {
  const noise = Array.from({ length: 26 }).map((_, i) => {
    const seed = (i * 137.5) % 360;
    const x1 = (seed % 100);
    const y1 = ((seed * 2.7) % 100);
    const x2 = ((seed * 1.6 + 40) % 100);
    const y2 = ((seed * 3.3 + 20) % 100);
    return { id: i, x1, y1, x2, y2, opacity: 0.05 + ((i % 5) * 0.015) };
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Clears a legibility zone over the copy column so noise lines
            never compete with the headline. */}
        <mask id="hero-signal-copy-mask">
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <rect x="0" y="10" width="44" height="60" fill="black" />
        </mask>
      </defs>
      <g mask="url(#hero-signal-copy-mask)">
        {noise.map((n) => (
          <line
            key={n.id}
            x1={n.x1}
            y1={n.y1}
            x2={n.x2}
            y2={n.y2}
            stroke="var(--ink-700)"
            strokeWidth="0.12"
            opacity={n.opacity}
          />
        ))}
      </g>

      {/* The one signal that resolves — arcs above the headline copy, never
          crossing text, and converges on the console's left edge. */}
      <path
        d="M 2 8 C 20 4, 38 4, 52 20"
        fill="none"
        stroke="var(--orange-signal)"
        strokeWidth="0.35"
        opacity="0.5"
        strokeDasharray="0.6 1.2"
      />
      <circle cx="2" cy="8" r="0.9" fill="var(--orange-signal)" opacity="0.7" />
      <circle cx="52" cy="20" r="0.6" fill="var(--orange-signal)" opacity="0.9" />
    </svg>
  );
}
