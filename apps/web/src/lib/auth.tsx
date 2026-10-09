import type { Role, SessionUser } from "@gac/shared";
import { hasRole } from "@gac/shared";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { ApiError, api, onUnauthorized } from "./api";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (minimum: Role) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** Vide le cache sauf la requête « me » : `clear()` la détacherait et l'interface ne se mettrait plus à jour. */
function resetCacheExceptMe(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api<{ user: SessionUser }>("/auth/me")).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  // Session expirée pendant l'utilisation : on repasse à « déconnecté » sans recharger la page.
  useEffect(
    () =>
      onUnauthorized(() => {
        qc.setQueryData(["me"], null);
      }),
    [qc],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      resetCacheExceptMe(qc);
      qc.setQueryData(["me"], res.user);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      resetCacheExceptMe(qc);
      qc.setQueryData(["me"], null);
    }
  }, [qc]);

  const user = me.data ?? null;
  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: me.isPending,
      login,
      logout,
      can: (minimum) => (user ? hasRole(user.role, minimum) : false),
    }),
    [user, me.isPending, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
