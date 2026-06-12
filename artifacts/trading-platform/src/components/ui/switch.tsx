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
      height: '22px',
      width: '40px',
      flexShrink: 0,
      cursor: 'pointer',
      alignItems: 'center',
      borderRadius: '9999px',
      border: '2px solid transparent',
      backgroundColor: props.checked ? '#10b981' : '#1e293b',
      outline: props.checked ? '2px solid rgba(16,185,129,0.25)' : 'none',
      transition: 'background-color 0.2s ease, outline 0.2s ease',
      position: 'relative',
      padding: 0,
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
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        transform: props.checked ? 'translateX(20px)' : 'translateX(2px)',
        transition: 'transform 0.2s ease',
        flexShrink: 0,
      }}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }

