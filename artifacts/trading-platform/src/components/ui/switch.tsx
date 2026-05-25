import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, style, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={className}
    style={{
      display: 'inline-flex',
      height: '24px',
      width: '48px',
      flexShrink: 0,
      cursor: 'pointer',
      alignItems: 'center',
      borderRadius: 0,
      border: '2px solid #1a2332',
      backgroundColor: props.checked ? '#10b981' : '#0f1318',
      borderColor: props.checked ? '#10b981' : '#1a2332',
      transition: 'all 0.2s',
      ...style
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      style={{
        pointerEvents: 'none',
        display: 'block',
        height: '16px',
        width: '16px',
        borderRadius: 0,
        border: '1px solid',
        backgroundColor: props.checked ? '#0a0d11' : '#475569',
        borderColor: props.checked ? '#0a0d11' : '#475569',
        transform: props.checked ? 'translateX(24px)' : 'translateX(0)',
        transition: 'all 0.2s'
      }}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
