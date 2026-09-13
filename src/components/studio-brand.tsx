import { cn } from 'cn'

export function StudioMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-[5px] gradient-studio',
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-mono-medium text-[11px] font-semibold leading-none text-paper">
        S
      </span>
    </span>
  )
}

export function StudioBrand({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <StudioMark />
      <span className="text-[15px] font-medium tracking-tight text-ink">
        Studio
      </span>
    </span>
  )
}
