import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "shimmer rounded-xl bg-paper-tint/60 text-transparent select-none",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
