import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMute } from "../context/MuteContext";
import { useSquad } from "../context/SquadContext";
import { SQUADS } from "../graphql";
import { setLanguage } from "../i18n";
import { playUi } from "../lib/sound";
import { useEffect, useState } from "react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { muted, toggle: toggleMute } = useMute();
  const { t, i18n } = useTranslation();

  // Global click sound: play a tick when any button is clicked (respects mute).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Clicking anywhere in a date field opens the native calendar picker
      // (browsers otherwise only open it from the tiny indicator icon).
      const dateInput = target?.closest?.('input[type="date"]') as HTMLInputElement | null;
      if (dateInput && typeof (dateInput as any).showPicker === "function") {
        try { (dateInput as any).showPicker(); } catch { /* not allowed / unsupported */ }
      }
      const el = target?.closest("button, [role='button'], a.btn, .btn");
      // The theme toggle plays its own distinct chime — skip the generic click.
      if (el && !(el as HTMLButtonElement).disabled && !el.closest("[data-theme-toggle]")) playUi("click");
    };
    // Typing tick while entering text (printable keys + backspace/delete).
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      const isText =
        tag === "TEXTAREA" ||
        (tag === "INPUT" && /^(text|search|email|url|tel|password|number|)$/i.test((el as HTMLInputElement).type));
      if (!isText) return;
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") playUi("type");
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  const { squadId, setSquadId } = useSquad();
  const { data } = useQuery(SQUADS);

  const squads = data?.squads ?? [];
  // Auto-select the first squad when none is chosen OR the stored selection
  // points to a squad that no longer exists (e.g. after a DB reset).
  if (squads.length && !squads.some((s: any) => s.id === squadId)) setSquadId(squads[0].id);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${
      isActive ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
    }`;

  // "Crystal Ball" standup group (dropdown): Current Sprint + The Spread (Board).
  const loc = useLocation();
  const [ballOpen, setBallOpen] = useState(false);
  // Mobile nav collapse (hamburger). Desktop (md+) always shows the full bar.
  const [menuOpen, setMenuOpen] = useState(false);
  // Collapse the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);
  const ballActive = loc.pathname === "/" || loc.pathname === "/board" || loc.pathname === "/moon-phase";
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

          <button
            className="btn-ghost ml-auto md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          <nav
            className={`${
              menuOpen ? "flex" : "hidden"
            } w-full flex-col gap-1 md:flex md:w-auto md:flex-row md:items-center`}
          >
            {/* Crystal Ball standup group — opens on hover or click */}
            <div className="relative" onMouseEnter={() => setBallOpen(true)} onMouseLeave={() => setBallOpen(false)}>
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
                  <div className="absolute left-0 top-full z-20 min-w-[170px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                    <NavLink to="/" end className={ballItemClass} onClick={() => setBallOpen(false)}>
                      {t("nav.current")}
                    </NavLink>
                    <NavLink to="/board" className={ballItemClass} onClick={() => setBallOpen(false)}>
                      {t("nav.board")}
                    </NavLink>
                    <NavLink to="/moon-phase" className={ballItemClass} onClick={() => setBallOpen(false)}>
                      {t("nav.moonPhase")}
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

          <div
            className={`${
              menuOpen ? "flex" : "hidden"
            } w-full flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-800 md:flex md:w-auto md:flex-1 md:flex-nowrap md:border-0 md:pt-0`}
          >
            {user?.isGuest && (
              <span className="chip w-fit bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                {t("common.guest")}
              </span>
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
            <button data-theme-toggle className="btn-ghost" onClick={toggle} title={t("common.toggleTheme")}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="btn-ghost" onClick={toggleMute} title={t(muted ? "common.unmute" : "common.mute")}>
              {muted ? "🔇" : "🔊"}
            </button>
            <span className="ml-auto whitespace-nowrap text-sm text-gray-500">{user?.name}</span>
            <button className="btn-ghost shrink-0" onClick={logout}>
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
