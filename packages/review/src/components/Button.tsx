import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

const button = cva(
  'inline-flex items-center justify-center border-none cursor-pointer transition-[transform,background-color,box-shadow] active:scale-[0.96]',
  {
    variants: {
      variant: {
        elevated: [
          'bg-surface',
          'shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]',
          'hover:shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)]',
          'hover:bg-elevated',
        ].join(' '),
        primary: [
          'bg-accent-dim',
          'shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent)_25%,transparent),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]',
          'hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent)_50%,transparent),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)]',
          'hover:brightness-110',
        ].join(' '),
        ghost: 'bg-transparent hover:bg-hover/40',
      },
      size: {
        sm: 'h-[28px] px-2.5 gap-1.5 text-[11px] rounded-lg',
        md: 'h-[34px] px-3.5 gap-2.5 text-[12px] rounded-2xl',
        lg: 'h-[40px] px-4 gap-3 text-[13px] rounded-2xl',
        icon: 'w-10 h-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'elevated',
      size: 'md',
    },
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={button({ variant, size, className })}
        {...props}
      >
        {children}
      </button>
    )
  }
)
