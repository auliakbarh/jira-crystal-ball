import { NavLink, Outlet } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSquad } from "../context/SquadContext";
import { SQUADS, CREATE_SQUAD } from "../graphql";
import { useState } from "react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { squadId, setSquadId } = useSquad();
  const { data, refetch } = useQuery(SQUADS);
  const [createSquad] = useMutation(CREATE_SQUAD);
  const [newName, setNewName] = useState("");

  const squads = data?.squads ?? [];
  // Auto-select the first squad when none is chosen OR the stored selection
  // points to a squad that no longer exists (e.g. after a DB reset).
  if (squads.length && !squads.some((s: any) => s.id === squadId)) setSquadId(squads[0].id);

  const onCreate = async () => {
    if (!newName.trim()) return;
    const res = await createSquad({ variables: { name: newName.trim() } });
    setNewName("");
    await refetch();
    if (res.data?.createSquad?.id) setSquadId(res.data.createSquad.id);
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${
      isActive ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="text-lg font-bold">🔮 Crystal Ball</span>

          <select
            className="input max-w-[180px]"
            value={squadId ?? ""}
            onChange={(e) => setSquadId(e.target.value)}
          >
            {squads.length === 0 && <option value="">No squads</option>}
            {squads.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Current Sprint
            </NavLink>
            <NavLink to="/board" className={linkClass}>
              Board
            </NavLink>
            <NavLink to="/previous" className={linkClass}>
              Previous Sprints
            </NavLink>
            {!user?.isGuest && (
              <NavLink to="/settings" className={linkClass}>
                Settings
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user?.isGuest && (
              <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                Guest
              </span>
            )}
            {!user?.isGuest && (
              <>
                <input
                  className="input max-w-[130px]"
                  placeholder="New squad…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onCreate()}
                />
                <button className="btn-ghost" onClick={onCreate} title="Create squad">
                  +
                </button>
              </>
            )}
            <button className="btn-ghost" onClick={toggle} title="Toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <span className="hidden text-sm text-gray-500 sm:inline">{user?.name}</span>
            <button className="btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        {squadId ? (
          <Outlet />
        ) : (
          <div className="card">No squad selected. Create one above to begin.</div>
        )}
      </main>
    </div>
  );
}
