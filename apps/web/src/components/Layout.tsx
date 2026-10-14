import { ROLE_LABELS, type Role } from "@gac/shared";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePreferencesSync } from "../lib/usePreferencesSync";
import { Icon, type IconName } from "./Icon";
import { ThemeMenu } from "./ThemeSwitch";

interface Destination {
  to: string;
  label: string;
  icon: IconName;
  minRole: Role;
  end?: boolean;
  /** Intitulé court de la barre inférieure (mobile). */
  short?: string;
  group: "Pilotage" | "Prospection" | "Administration" | "Compte";
}

const DESTINATIONS: Destination[] = [
  {
    to: "/",
    label: "Tableau de bord",
    short: "Bord",
    icon: "dashboard",
    minRole: "VIEWER",
    end: true,
    group: "Pilotage",
  },
  { to: "/pipeline", label: "Pipeline", icon: "pipeline", minRole: "VIEWER", group: "Pilotage" },
  { to: "/leads", label: "Leads", icon: "leads", minRole: "VIEWER", group: "Prospection" },
  { to: "/sourcing", label: "Sourcing", icon: "sourcing", minRole: "MANAGER", group: "Prospection" },
  { to: "/calls", label: "Appels", icon: "phone", minRole: "AGENT", group: "Prospection" },
  { to: "/emails", label: "E-mails", icon: "mail", minRole: "MANAGER", group: "Prospection" },
  { to: "/users", label: "Utilisateurs", icon: "users", minRole: "ADMIN", group: "Administration" },
  {
    to: "/suppressions",
    label: "Adresses exclues",
    short: "Exclues",
    icon: "ban",
    minRole: "MANAGER",
    group: "Administration",
  },
  { to: "/settings", label: "Réglages", icon: "settings", minRole: "MANAGER", group: "Administration" },
  { to: "/import", label: "Import", icon: "upload", minRole: "ADMIN", group: "Administration" },
  {
    to: "/audit",
    label: "Journal d'audit",
    short: "Audit",
    icon: "audit",
    minRole: "ADMIN",
    group: "Administration",
  },
  { to: "/profile", label: "Mon profil", icon: "user", minRole: "VIEWER", group: "Compte" },
];

/** Destinations de la barre inférieure (mobile) : les plus utiles du rôle, le reste passe par « Plus ». */
const BOTTOM_BAR = ["/calls", "/leads", "/emails", "/"];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function MoreSheet({
  items,
  onClose,
  onLogout,
}: {
  items: Destination[];
  onClose: () => void;
  onLogout: () => void;
}) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="anim-scrim-in fixed inset-0 z-40 flex flex-col justify-end bg-ds-overlay md:hidden">
      <button type="button" className="flex-1 cursor-default" aria-label="Fermer le menu" onClick={onClose} />
      <div className="sheet anim-sheet-in" role="dialog" aria-modal="true" aria-label="Plus">
        <div className="sheet-handle" />
        {items.map((d, i) => (
          <NavLink
            key={d.to}
            to={d.to}
            end={d.end}
            ref={i === 0 ? first : undefined}
            className="sheet-item"
            onClick={onClose}
          >
            <Icon name={d.icon} />
            {d.label}
          </NavLink>
        ))}
        <button type="button" className="sheet-item w-full text-ds-critical-ink" onClick={onLogout}>
          <Icon name="logout" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  usePreferencesSync(!!user);
  const [moreOpen, setMoreOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le menu « Plus » se referme à chaque changement de page
  useEffect(() => setMoreOpen(false), [location.pathname]);
  if (!user) return null;

  const visible = DESTINATIONS.filter((d) => can(d.minRole));
  const bottom = BOTTOM_BAR.map((to) => visible.find((d) => d.to === to)).filter(
    (d): d is Destination => !!d,
  );
  const more = visible.filter((d) => !bottom.includes(d));
  const doLogout = async () => {
    await logout();
    navigate("/login");
  };
  const groups = (["Pilotage", "Prospection", "Administration"] as const).map((g) => ({
    title: g,
    items: visible.filter((d) => d.group === g),
  }));

  return (
    <div className="min-h-screen md:flex">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <div className="hidden md:block md:w-(--gac-size-sidebar) md:shrink-0">
        <nav className="sidebar sticky top-0 h-screen overflow-y-auto" aria-label="Navigation principale">
          <div className="brand">
            <span className="brand-mark">GAC</span>
            <span className="flex flex-col">
              <span className="brand-name">GAC Pilot</span>
              <span className="brand-sub">GrowthLab Agency</span>
            </span>
          </div>
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.title} className="nav-group">
                <span className="nav-title">{g.title}</span>
                {g.items.map((d) => (
                  <NavLink key={d.to} to={d.to} end={d.end} className="nav-item">
                    <Icon name={d.icon} />
                    {d.label}
                  </NavLink>
                ))}
              </div>
            ))}
          <div className="mt-auto flex flex-col gap-3">
            <NavLink to="/profile" className="nav-item">
              <Icon name="user" />
              Mon profil
            </NavLink>
            <div className="user-chip">
              <span className="avatar">{initials(user.name)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-sm">{user.name}</b>
                <span className="text-xs text-sidebar-muted">{ROLE_LABELS[user.role]}</span>
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm text-inherit"
                onClick={doLogout}
              >
                <Icon name="logout" size={16} />
                <span className="sr-only">Se déconnecter</span>
              </button>
            </div>
          </div>
        </nav>
      </div>

      <main id="contenu" className="min-w-0 flex-1 px-4 pb-28 pt-4 md:p-8">
        <div className="mb-2 flex justify-end">
          <ThemeMenu />
        </div>
        <Outlet />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <nav
          className="bottombar"
          aria-label="Navigation principale"
          style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}
        >
          {bottom.map((d) => (
            <NavLink key={d.to} to={d.to} end={d.end} className="tabbar-item">
              <span className="tabbar-pill">
                <Icon name={d.icon} size={24} />
              </span>
              {d.short ?? d.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="tabbar-item border-0 bg-transparent"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <span className="tabbar-pill">
              <Icon name="menu" size={24} />
            </span>
            Plus
          </button>
        </nav>
      </div>
      {moreOpen && <MoreSheet items={more} onClose={() => setMoreOpen(false)} onLogout={doLogout} />}
    </div>
  );
}
