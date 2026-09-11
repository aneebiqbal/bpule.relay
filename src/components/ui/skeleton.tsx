import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-paper-tint text-transparent select-none",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
