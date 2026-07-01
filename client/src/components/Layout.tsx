import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSquad } from "../context/SquadContext";
import { SQUADS, CREATE_SQUAD } from "../graphql";
import { setLanguage } from "../i18n";
import { useState } from "react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
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

  // "Crystal Ball" standup group (dropdown): Current Sprint + The Spread (Board).
  const loc = useLocation();
  const [ballOpen, setBallOpen] = useState(false);
  const ballActive = loc.pathname === "/" || loc.pathname === "/board";
  const ballItemClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded px-3 py-1.5 text-sm ${
      isActive ? "bg-brand text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
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
            {squads.length === 0 && <option value="">{t("common.noSquads")}</option>}
            {squads.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <nav className="flex items-center gap-1">
            {/* Crystal Ball standup group */}
            <div className="relative">
              <button
                onClick={() => setBallOpen((o) => !o)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  ballActive ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {t("nav.crystalBall")} <span className="text-[10px] leading-none">▾</span>
              </button>
              {ballOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBallOpen(false)} />
                  <div className="absolute left-0 z-20 mt-1 min-w-[170px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                    <NavLink to="/" end className={ballItemClass} onClick={() => setBallOpen(false)}>
                      {t("nav.current")}
                    </NavLink>
                    <NavLink to="/board" className={ballItemClass} onClick={() => setBallOpen(false)}>
                      {t("nav.board")}
                    </NavLink>
                  </div>
                </>
              )}
            </div>
            <NavLink to="/clairvoyance" className={linkClass}>
              {t("nav.clairvoyance")}
            </NavLink>
            <NavLink to="/tarot" className={linkClass}>
              {t("nav.tarot")}
            </NavLink>
            <NavLink to="/previous" className={linkClass}>
              {t("nav.previous")}
            </NavLink>
            <NavLink to="/velocity" className={linkClass}>
              {t("nav.velocity")}
            </NavLink>
            {!user?.isGuest && (
              <NavLink to="/fortune" className={linkClass}>
                {t("nav.fortune")}
              </NavLink>
            )}
            {!user?.isGuest && (
              <NavLink to="/settings" className={linkClass}>
                {t("nav.settings")}
              </NavLink>
            )}
            <NavLink to="/help" className={linkClass}>
              {t("nav.help")}
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user?.isGuest && (
              <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                {t("common.guest")}
              </span>
            )}
            {!user?.isGuest && (
              <>
                <input
                  className="input max-w-[130px]"
                  placeholder={t("common.newSquad")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onCreate()}
                />
                <button className="btn-ghost" onClick={onCreate} title={t("common.createSquad")}>
                  +
                </button>
              </>
            )}
            <select
              className="input max-w-[70px] py-1 text-xs"
              value={i18n.resolvedLanguage || "en"}
              onChange={(e) => setLanguage(e.target.value)}
              title={t("common.language")}
            >
              <option value="en">EN</option>
              <option value="id">ID</option>
            </select>
            <button className="btn-ghost" onClick={toggle} title={t("common.toggleTheme")}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <span className="hidden text-sm text-gray-500 sm:inline">{user?.name}</span>
            <button className="btn-ghost" onClick={logout}>
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        {squadId ? (
          <Outlet />
        ) : (
          <div className="card">{t("common.noSquadSelected")}</div>
        )}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 py-6 text-center text-xs text-gray-400">
        {t("common.footer")}
      </footer>
    </div>
  );
}
