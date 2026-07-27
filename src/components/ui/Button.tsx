import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { useMagnetic } from '@/hooks/useMagnetic'

const buttonVariants = cva(
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-[#05130a] shadow-[0_0_0_0_rgba(34,197,94,0.45)] hover:bg-accent-hover hover:shadow-[0_0_32px_4px_rgba(34,197,94,0.35)]',
        secondary:
          'border border-border bg-transparent text-text hover:border-accent/50 hover:bg-surface-3',
        ghost: 'bg-transparent text-text-secondary hover:text-text',
      },
      size: {
        default: 'h-13 px-7 text-[15px] h-[52px]',
        sm: 'h-11 px-5 text-sm',
        lg: 'h-15 px-9 text-base h-[60px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  magnetic?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, magnetic = true, children, ...props }, forwardedRef) => {
    const magneticRef = useMagnetic<HTMLButtonElement>(0.25)

    return (
      <button
        ref={magnetic ? magneticRef : forwardedRef}
        data-cursor="hover"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
