import { useEffect, useRef, useState } from "react";
import {
  CHANGE_EVENT,
  readPreference,
  setPreference,
  THEME_LABELS,
  type ThemePreference,
} from "../lib/theme";
import { Icon, type IconName } from "./Icon";

const OPTIONS: Array<{ value: ThemePreference; icon: IconName }> = [
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
  { value: "system", icon: "monitor" },
];

/** Préférence de thème, tenue à jour quand un autre contrôle la change. */
function useThemePreference(): ThemePreference {
  const [pref, setPref] = useState<ThemePreference>(readPreference);
  useEffect(() => {
    const sync = () => setPref(readPreference());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return pref;
}

/** Choix du thème (Mon profil) : clair, sombre ou celui du système. Un contrôle à trois positions, texte toujours visible. */
export function ThemeSwitch() {
  const pref = useThemePreference();
  return (
    <fieldset className="segmented grid grid-cols-3">
      <legend className="sr-only">Thème</legend>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={pref === o.value}
          className="segment justify-center"
          onClick={() => setPreference(o.value)}
        >
          <Icon name={o.icon} size={16} />
          {THEME_LABELS[o.value]}
        </button>
      ))}
    </fieldset>
  );
}

/** Bouton d'en-tête : un clic ouvre le choix du thème, sans quitter la page. Échap ou un clic ailleurs le referme. */
export function ThemeMenu() {
  const pref = useThemePreference();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[2];
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        className="btn btn--secondary btn--icon"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={current?.icon ?? "monitor"} />
        <span className="sr-only">Thème : {THEME_LABELS[pref]}. Changer</span>
      </button>
      {open && (
        <fieldset className="menu anim-rise absolute right-0 top-full z-30 m-0 mt-2 w-48 p-1.5">
          <legend className="sr-only">Thème</legend>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={pref === o.value}
              className="menu-item w-full border-0 bg-transparent text-left"
              onClick={() => {
                setPreference(o.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <Icon name={o.icon} size={16} />
              {THEME_LABELS[o.value]}
              {pref === o.value && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
