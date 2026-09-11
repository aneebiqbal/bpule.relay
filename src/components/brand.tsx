import { cn } from 'cn'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-sm bg-gold',
        className,
      )}
      aria-hidden="true"
    >
      <span className="font-mono text-[11px] font-medium leading-none text-paper">
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