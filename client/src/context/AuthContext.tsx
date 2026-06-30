import { createContext, useContext, useState, ReactNode } from "react";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isGuest?: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("jcb_token"));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("jcb_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const login = (t: string, u: AuthUser) => {
    localStorage.setItem("jcb_token", t);
    localStorage.setItem("jcb_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("jcb_token");
    localStorage.removeItem("jcb_user");
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  };

  return <Ctx.Provider value={{ user, token, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
