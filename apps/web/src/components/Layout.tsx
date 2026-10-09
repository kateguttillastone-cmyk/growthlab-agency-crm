import { ROLE_LABELS } from "@gac/shared";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"}`;

export function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="min-h-screen md:flex">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <aside className="bg-ink p-4 text-white md:w-60 md:shrink-0">
        <div className="mb-6">
          <p className="text-lg font-extrabold">GAC Pilot</p>
          <p className="text-xs text-white/70">GrowthLab Agency</p>
        </div>
        <nav aria-label="Navigation principale" className="space-y-1">
          <NavLink to="/" end className={linkClass}>
            Tableau de bord
          </NavLink>
          <NavLink to="/leads" className={linkClass}>
            Leads
          </NavLink>
          {can("MANAGER") && (
            <NavLink to="/emails" className={linkClass}>
              E-mails
            </NavLink>
          )}
          {can("ADMIN") && (
            <>
              <NavLink to="/users" className={linkClass}>
                Utilisateurs
              </NavLink>
              <NavLink to="/import" className={linkClass}>
                Import
              </NavLink>
              <NavLink to="/audit" className={linkClass}>
                Journal d'audit
              </NavLink>
            </>
          )}
          <NavLink to="/profile" className={linkClass}>
            Mon profil
          </NavLink>
        </nav>
        <div className="mt-8 border-t border-white/15 pt-4 text-sm">
          <p className="font-semibold">{user.name}</p>
          <p className="mb-3 text-xs text-white/70">{ROLE_LABELS[user.role]}</p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </aside>
      <main id="contenu" className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
