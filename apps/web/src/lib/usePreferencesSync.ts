import type { Preferences } from "@gac/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import { setPreference, setReducedMotion } from "./theme";

/** Au chargement, les préférences du compte l'emportent sur celles du navigateur : on les retrouve sur tout appareil. */
export function usePreferencesSync(enabled: boolean): void {
  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api<Preferences>("/auth/preferences"),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  useEffect(() => {
    const p = prefs.data;
    if (!p) return;
    if (p.theme) setPreference(p.theme);
    if (p.reducedMotion !== undefined) setReducedMotion(p.reducedMotion);
  }, [prefs.data]);
}
