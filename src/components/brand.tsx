import { cn } from 'cn'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-[5px] gradient-gold',
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-mono-medium text-[11px] font-semibold leading-none text-paper">
        R
      </span>
    </span>
  )
}

export function RelayBrand({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className="text-[15px] font-medium tracking-tight text-ink">
        Relay
      </span>
    </span>
  )
}
