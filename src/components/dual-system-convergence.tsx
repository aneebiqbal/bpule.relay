export function DualSystemConvergence({ dark = true }: { dark?: boolean }) {
  const ink = dark ? "var(--bone-000, #faf7f0)" : "var(--ink)";

  return (
    <div className="relative min-h-[92svh] overflow-hidden px-[var(--gutter)] py-20">
      <div className="mx-auto grid min-h-[72svh] max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-mono-regular text-[11px] tracking-[0.18em] uppercase text-cobalt">Studio</p>
          <p
            className="mt-4 text-[clamp(3.2rem,8vw,6.4rem)] leading-[0.86] font-light tracking-[-0.05em]"
            style={{ color: ink }}
          >
            Create
            <br />
            demand.
          </p>
          <p className="mt-8 max-w-[12rem] text-[13px] text-[var(--stone-light)]">
            expertise → idea → authority → audience
          </p>
        </div>

        <div className="lg:text-right">
          <p className="text-mono-regular text-[11px] tracking-[0.18em] uppercase text-orange">Relay</p>
          <p
            className="mt-4 text-[clamp(3.2rem,8vw,6.4rem)] leading-[0.86] font-light tracking-[-0.05em]"
            style={{ color: ink }}
          >
            Capture
            <br />
            demand.
          </p>
          <p className="mt-8 ml-auto max-w-[12rem] text-[13px] text-[var(--stone-light)] lg:ml-auto">
            opportunity ← qualification ← action
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-[var(--gutter)] top-1/2 mx-auto hidden max-w-6xl -translate-y-1/2 lg:block">
        <div className="flex items-center justify-center gap-6">
          <span className="h-px flex-1 bg-cobalt" />
          <span className="text-[clamp(2.5rem,5vw,4rem)] font-light text-[var(--bone-000,#faf7f0)]">×</span>
          <span className="h-px flex-1 bg-orange" />
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-6xl text-mono-regular text-[12px] tracking-[0.28em] uppercase text-[var(--bone-000,#faf7f0)]">
        One growth loop
      </p>
    </div>
  );
}
