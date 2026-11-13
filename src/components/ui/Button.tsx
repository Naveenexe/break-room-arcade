import React from 'react';
import { clsx } from 'clsx';
import { sound } from '@/lib/sound';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'surface' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  className,
  disabled,
  onClick,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;
    sound.playTick();
    onClick?.(e);
  };

  // SRS v2 Section 5.4: Radius 12px, border 2px, hard-shadow 3px 3px 0, no pill buttons
  const baseStyles =
    'inline-flex items-center justify-center font-heading font-bold rounded-[12px] border-2 select-none transition-transform duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

  const sizeStyles = {
    sm: 'text-xs px-3.5 py-1.5 min-h-[40px]',
    md: 'text-sm px-5 py-2.5 min-h-[48px]',
    lg: 'text-base px-7 py-3.5 min-h-[54px]',
  }[size];

  const variantStyles = {
    primary:
      'bg-primary text-ink border-ink hover:bg-primary-press btn-hard',
    secondary:
      'bg-surface-raised text-text border-line hover:border-text-muted/60 btn-hard',
    surface:
      'bg-surface text-text border-line hover:bg-surface-raised btn-hard',
    danger:
      'bg-danger text-text border-ink hover:brightness-110 btn-hard',
    ghost:
      'bg-transparent text-text border-transparent hover:bg-surface-raised active:bg-surface',
  }[variant];

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={clsx(
        baseStyles,
        sizeStyles,
        variantStyles,
        fullWidth && 'w-full',
        className
      )}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
