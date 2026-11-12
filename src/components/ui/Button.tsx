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

  const baseStyles = 'inline-flex items-center justify-center font-heading font-semibold rounded-full transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

  const sizeStyles = {
    sm: 'text-sm px-4 py-2 min-h-[38px] min-w-[38px]',
    md: 'text-base px-6 py-3 min-h-[48px]',
    lg: 'text-lg px-8 py-4 min-h-[56px]',
  }[size];

  const variantStyles = {
    primary: 'bg-primary text-bg font-bold btn-chunky btn-chunky-primary hover:brightness-105 active:brightness-95',
    secondary: 'bg-surface-raised text-text border-2 border-line btn-chunky hover:bg-opacity-80',
    surface: 'bg-surface text-text border-2 border-line btn-chunky hover:bg-surface-raised',
    danger: 'bg-danger text-bg font-bold btn-chunky btn-chunky-primary hover:brightness-105',
    ghost: 'bg-transparent text-text hover:bg-surface active:bg-surface-raised',
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

