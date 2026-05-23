import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse", className)}
      style={{ backgroundColor: 'var(--bs-secondary-bg-subtle)' }}
      {...props}
    />
  )
}

export { Skeleton }
