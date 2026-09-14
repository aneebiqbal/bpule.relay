import { cn } from 'cn'

export function StudioMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-[22px] items-center justify-center rounded-[5px] bg-cobalt',
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-mono-medium text-[11px] font-bold leading-none text-bone">
        S
      </span>
    </span>
  )
}

export function StudioBrand({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <StudioMark />
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
        Studio
      </span>
    </span>
  )
}
