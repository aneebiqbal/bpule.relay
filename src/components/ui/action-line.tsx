import { cn } from 'cn'

interface ActionLineProps {
  children: React.ReactNode
  className?: string
}

export function ActionLine({ children, className }: ActionLineProps) {
  return (
    <div className={cn('action-line', className)}>
      {children}
    </div>
  )
}
