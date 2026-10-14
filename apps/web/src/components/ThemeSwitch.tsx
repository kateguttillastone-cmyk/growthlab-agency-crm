import { useEffect, useState } from "react";
import { savePreferences } from "../lib/preferences";
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
          onClick={() => {
            setPreference(o.value);
            savePreferences({ theme: o.value });
          }}
        >
          <Icon name={o.icon} size={16} />
          {THEME_LABELS[o.value]}
        </button>
      ))}
    </fieldset>
  );
}

/** Sélecteur à trois positions du pied de barre latérale et de la feuille « Plus » (icône + nom accessible + infobulle). */
export function ThemeRadio() {
  const pref = useThemePreference();
  return (
    <fieldset className="theme-switch m-0 min-w-0">
      <legend className="sr-only">Thème</legend>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={pref === o.value}
          aria-label={THEME_LABELS[o.value]}
          title={THEME_LABELS[o.value]}
          onClick={() => {
            setPreference(o.value);
            savePreferences({ theme: o.value });
          }}
        >
          <Icon name={o.icon} size={16} />
        </button>
      ))}
    </fieldset>
  );
}
