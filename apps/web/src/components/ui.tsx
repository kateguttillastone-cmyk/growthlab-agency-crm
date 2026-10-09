import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";

const buttonBase =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "border border-brand-100 bg-white text-ink hover:bg-brand-50",
    danger: "bg-red-700 text-white hover:bg-red-800",
  }[variant];
  return <button type="button" className={`${buttonBase} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink/70">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

/** Message d'erreur annoncé aux lecteurs d'écran. */
export function ErrorAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
      {title && <h2 className="mb-4 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-center text-sm text-ink/70">
      {label}
    </p>
  );
}
