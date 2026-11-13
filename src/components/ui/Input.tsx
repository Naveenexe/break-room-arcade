import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-text-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full px-4 py-3 rounded-[12px] bg-surface text-text border-2 border-line placeholder:text-text-muted/50 transition-colors focus:outline-none focus:border-primary',
            error && 'border-danger focus:border-danger',
            className
          )}
          {...props}
        />
        {error && <span className="text-xs font-semibold text-danger">{error}</span>}
        {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
