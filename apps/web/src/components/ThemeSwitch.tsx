import { useState } from "react";
import { readPreference, setPreference, THEME_LABELS, type ThemePreference } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

const OPTIONS: Array<{ value: ThemePreference; icon: IconName }> = [
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
  { value: "system", icon: "monitor" },
];

/** Choix du thème : clair, sombre ou celui du système. Un contrôle à trois positions, texte toujours visible. */
export function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePreference>(readPreference);
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
            setPref(o.value);
            setPreference(o.value);
          }}
        >
          <Icon name={o.icon} size={16} />
          {THEME_LABELS[o.value]}
        </button>
      ))}
    </fieldset>
  );
}
