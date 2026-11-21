import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="block font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#E8ECF4]"
        >
          {label}
          {required && <span className="ml-1 text-[#F5B921]">*</span>}
        </label>
        {hint && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
            {hint}
          </span>
        )}
      </div>

      {children}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export const INPUT_BASE_CLASS =
  'w-full rounded-[4px] border border-white/15 bg-[#070B14] px-3.5 py-2.5 text-sm text-[#E8ECF4] placeholder:text-[#8B95AA]/60 transition-colors duration-150 focus:border-[#22D3EE] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#22D3EE] disabled:cursor-not-allowed disabled:opacity-60';
