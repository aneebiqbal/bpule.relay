import { cn } from 'cn'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-[22px] items-center justify-center rounded-[5px] bg-orange',
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-mono-medium text-[11px] font-bold leading-none text-bone">
        R
      </span>
    </span>
  )
}

export function RelayBrand({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <BrandMark />
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
        Relay
      </span>
    </span>
  )
}
