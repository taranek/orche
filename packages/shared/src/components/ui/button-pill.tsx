import { type ReactNode } from 'react';

type ButtonPillVariant = 'default' | 'accent' | 'success' | 'danger' | 'muted';

interface ButtonPillProps {
  children: ReactNode;
  secondary?: ReactNode;
  variant?: ButtonPillVariant;
  onClick?: () => void;
  onSecondaryClick?: () => void;
  disabled?: boolean;
  className?: string;
}

// All variants share the same elevated outline base —
// color is expressed through subtle text tint + faint border tint, not solid fills
const variantStyles: Record<ButtonPillVariant, { border: string; text: string; secondaryText: string; hoverText: string }> = {
  default: {
    border: 'border-edge-active',
    text: 'text-fg',
    secondaryText: 'text-fg-tertiary',
    hoverText: 'hover:text-fg',
  },
  accent: {
    border: 'border-accent/25',
    text: 'text-accent',
    secondaryText: 'text-accent/50',
    hoverText: 'hover:text-accent',
  },
  success: {
    border: 'border-status-green/25',
    text: 'text-status-green',
    secondaryText: 'text-status-green/50',
    hoverText: 'hover:text-status-green',
  },
  danger: {
    border: 'border-status-red/25',
    text: 'text-status-red',
    secondaryText: 'text-status-red/50',
    hoverText: 'hover:text-status-red',
  },
  muted: {
    border: 'border-edge',
    text: 'text-fg-secondary',
    secondaryText: 'text-fg-tertiary',
    hoverText: 'hover:text-fg-secondary',
  },
};

export function ButtonPill({
  children,
  secondary,
  variant = 'default',
  onClick,
  onSecondaryClick,
  disabled = false,
  className = '',
}: ButtonPillProps) {
  const s = variantStyles[variant];

  return (
    <div
      className={`inline-flex items-stretch h-[34px] rounded-2xl border bg-elevated overflow-hidden transition-shadow shadow-[0_1px_3px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:shadow-[0_2px_6px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)_inset] ${s.border} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-1 flex items-center justify-center gap-2 h-full px-3 text-[12px] font-semibold tracking-tight cursor-pointer transition-colors hover:bg-hover/50 ${s.text}`}
      >
        {children}
      </button>
      {secondary && (
        <>
          <div className="flex items-center">
            <div className="w-px h-4 bg-edge" />
          </div>
          <button
            onClick={onSecondaryClick}
            disabled={disabled}
            className={`flex items-center justify-center h-full w-8 cursor-pointer transition-colors hover:bg-hover/50 ${s.secondaryText} ${s.hoverText}`}
          >
            {secondary}
          </button>
        </>
      )}
    </div>
  );
}
