export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const SEND_TIMEZONE = "Europe/Paris";

export interface Slot {
  day: number; // 0 = dimanche
  minutes: number; // minutes depuis minuit, heure de Paris
}

/** « mon@14:00,tue@09:00 » → créneaux ; lève une erreur lisible si une entrée est mal écrite. */
export function parseSlots(spec: string): Slot[] {
  const slots = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = /^(sun|mon|tue|wed|thu|fri|sat)@([01]\d|2[0-3]):([0-5]\d)$/.exec(entry.toLowerCase());
      if (!m)
        throw new Error(`Configuration invalide : créneau « ${entry} » (attendu jour@HH:MM, ex. mon@14:00)`);
      return { day: DAYS.indexOf(m[1] as (typeof DAYS)[number]), minutes: Number(m[2]) * 60 + Number(m[3]) };
    });
  if (!slots.length) throw new Error("Configuration invalide : SEND_SLOTS est vide");
  return slots;
}

/** Jour de la semaine et minutes écoulées depuis minuit, à Paris (gère l'heure d'été). */
export function parisClock(at: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEND_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Un créneau est-il ouvert à cet instant ? (du début du créneau jusqu'à `windowMinutes` après) */
export function inSlot(at: Date, slots: Slot[], windowMinutes: number): boolean {
  const now = parisClock(at);
  return slots.some(
    (s) => s.day === now.day && now.minutes >= s.minutes && now.minutes < s.minutes + windowMinutes,
  );
}

/** Prochain début de créneau (à la minute près), pour l'affichage ; null si aucun dans les 8 jours. */
export function nextSlotStart(at: Date, slots: Slot[]): Date | null {
  for (let i = 0; i <= 8 * 24 * 60; i++) {
    const t = new Date(Math.floor(at.getTime() / 60_000) * 60_000 + i * 60_000);
    const c = parisClock(t);
    if (slots.some((s) => s.day === c.day && s.minutes === c.minutes) && t.getTime() > at.getTime()) return t;
  }
  return null;
}
