import { cn } from 'cn'
import { RelayLogo, RelayMark } from '@/components/relay-logo'

export function BrandMark({ className }: { className?: string }) {
  return <RelayMark className={cn('size-[22px]', className)} />
}

export function RelayBrand({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <BrandMark />
      <span
        className={cn(
          'text-[14px] font-semibold tracking-[-0.01em]',
          light ? 'text-bone' : 'text-ink',
        )}
      >
        Relay
      </span>
    </span>
  )
}

export { RelayLogo, RelayMark }
