import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "risk" | "confirm";

/** « ghost » reste le bouton à contour de l'application d'origine (secondaire du système de design). */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn--primary",
  secondary: "btn--secondary",
  ghost: "btn--secondary",
  danger: "btn--danger",
  risk: "btn--risk",
  confirm: "btn--confirm",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type="button" className={`btn ${VARIANT[variant]} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field mb-4">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="input" {...props} />
      {hint && (
        <p id={`${id}-hint`} className="hint">
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
    <div className="field mb-4">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="select" {...props}>
        {children}
      </select>
    </div>
  );
}

/** Message d'erreur annoncé aux lecteurs d'écran. */
export function ErrorAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="alert alert--critical mb-4">
      <Icon name="error" />
      <div>{message}</div>
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card mb-6">
      {title && <h2 className="t-card mb-4">{title}</h2>}
      {children}
    </section>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-center text-sm text-ds-muted">
      {label}
    </p>
  );
}
