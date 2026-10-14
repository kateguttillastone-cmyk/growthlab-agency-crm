import { ROLE_LABELS, type Role } from "@gac/shared";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePreferencesSync } from "../lib/usePreferencesSync";
import { Icon, type IconName } from "./Icon";
import { ThemeRadio } from "./ThemeSwitch";

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

/** Barre inférieure (mobile) selon le rôle : les 3-4 destinations du quotidien, le reste passe par « Plus ». */
const BOTTOM_BAR: Record<Role, string[]> = {
  ADMIN: ["/emails", "/leads", "/sourcing", "/"],
  MANAGER: ["/emails", "/leads", "/sourcing", "/"],
  AGENT: ["/calls", "/leads", "/pipeline", "/"],
  VIEWER: ["/", "/leads", "/pipeline"],
};
/** Pages d'administration : densité aérée, largeur de lecture limitée. */
const ADMIN_PATHS = ["/users", "/settings", "/audit", "/import", "/suppressions", "/profile"];
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
        <div className="sheet-item justify-between">
          <span className="sidebar-label text-ds-muted">Thème</span>
          <ThemeRadio />
        </div>
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
  const bottom = BOTTOM_BAR[user.role]
    .map((to) => visible.find((d) => d.to === to))
    .filter((d): d is Destination => !!d);
  const adminPage = ADMIN_PATHS.some((p) => location.pathname.startsWith(p));
  const more = visible.filter((d) => !bottom.includes(d));
  const doLogout = async () => {
    await logout();
    navigate("/login", { replace: true, state: null });
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
          <div className="sidebar-foot">
            <div className="sidebar-tools">
              <ThemeRadio />
              <button
                type="button"
                className="bell"
                aria-label="Notifications : aucune"
                title="Notifications : aucune"
              >
                <Icon name="bell" />
              </button>
            </div>
            <NavLink to="/profile" className="user-chip" title="Mon profil">
              <span className="avatar">{initials(user.name)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-sm">{user.name}</b>
                <span className="text-xs text-sidebar-muted">{ROLE_LABELS[user.role]}</span>
              </span>
            </NavLink>
            <button type="button" className="nav-item border-0 bg-transparent" onClick={doLogout}>
              <Icon name="logout" />
              Se déconnecter
            </button>
          </div>
        </nav>
      </div>

      <main
        id="contenu"
        className={`min-w-0 flex-1 px-4 pb-28 pt-4 md:px-(--page-pad-x) md:py-(--page-pad-y) md:pb-(--page-pad-y) ${
          adminPage ? "density-admin" : "density-work"
        }`}
      >
        <div className="mx-auto w-full max-w-(--content-max)">
          <Outlet />
        </div>
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
