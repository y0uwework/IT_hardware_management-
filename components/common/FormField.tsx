import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-md border-[1.5px] bg-white font-sans text-body text-neutral-900 placeholder:text-neutral-400 " +
  "transition-shadow focus:outline-none disabled:bg-neutral-100 disabled:opacity-50";
const okBorder = "border-neutral-300 focus:border-primary focus:shadow-focus";
const errBorder = "border-error focus:border-error focus:shadow-focus-error";

interface FieldShellProps {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  id: string;
  children: React.ReactNode;
  className?: string;
}

function FieldShell({ label, helper, error, required, id, children, className = "" }: FieldShellProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold text-neutral-900">
          {label}
          {required && <span className="ml-0.5 text-error" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-caption text-error" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-msg`} className="text-caption font-normal text-neutral-600">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label?: string; helper?: string; error?: string; wrapperClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(function Input(
  { label, helper, error, wrapperClassName, id, className = "", required, ...rest },
  ref
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} helper={helper} error={error} required={required} id={fid} className={wrapperClassName}>
      <input
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error || helper ? `${fid}-msg` : undefined}
        className={`${control} h-11 px-4 ${error ? errBorder : okBorder} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & Common & { options: { value: string | number; label: string }[]; placeholder?: string }
>(function Select({ label, helper, error, wrapperClassName, id, className = "", options, placeholder, required, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} helper={helper} error={error} required={required} id={fid} className={wrapperClassName}>
      <select
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error || helper ? `${fid}-msg` : undefined}
        className={`${control} h-11 px-4 pr-10 ${error ? errBorder : okBorder} ${className}`}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(function Textarea(
  { label, helper, error, wrapperClassName, id, className = "", rows = 3, required, ...rest },
  ref
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} helper={helper} error={error} required={required} id={fid} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error || helper ? `${fid}-msg` : undefined}
        className={`${control} px-4 py-2.5 ${error ? errBorder : okBorder} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
});

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors peer-focus-visible:shadow-focus ${
          checked ? "border-primary bg-primary" : "border-neutral-300 bg-white"
        }`}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-body-sm text-neutral-900">{label}</span>
        {description && <span className="text-caption font-normal text-neutral-500">{description}</span>}
      </span>
    </label>
  );
}
