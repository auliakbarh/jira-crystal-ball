import { createContext, useContext, useState, ReactNode } from "react";

interface SquadCtx {
  squadId: string | null;
  setSquadId: (id: string) => void;
}

const Ctx = createContext<SquadCtx>(null as any);

export function SquadProvider({ children }: { children: ReactNode }) {
  const [squadId, setSquadIdState] = useState<string | null>(() => localStorage.getItem("jcb_squad"));
  const setSquadId = (id: string) => {
    localStorage.setItem("jcb_squad", id);
    setSquadIdState(id);
  };
  return <Ctx.Provider value={{ squadId, setSquadId }}>{children}</Ctx.Provider>;
}

export const useSquad = () => useContext(Ctx);
