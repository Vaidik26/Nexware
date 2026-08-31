import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordType = type === 'password';
    const inputType = isPasswordType ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="flex flex-col gap-1.5 w-full relative">
        {label && (
          <label className="text-sm font-medium text-on-surface">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <div className="relative w-full">
          <input
            ref={ref}
            type={inputType}
            className={cn(
              'flex h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-on-surface-variant/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-50',
              isPasswordType && 'pr-10',
              error && 'border-error focus-visible:ring-error',
              className
            )}
            {...props}
          />
          {isPasswordType && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-500 transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-error">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
