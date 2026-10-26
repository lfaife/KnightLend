import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { DemoBar } from "./DemoBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";

export const NAV = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/browse", label: "Browse", icon: "search" },
  { to: "/list", label: "List an Item", short: "List", icon: "plus" },
  { to: "/messages", label: "Messages", icon: "chat" },
  { to: "/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const { tick } = useDemo();
  const loc = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <DemoBar />
      <header className="on-dark sticky top-0 z-30 bg-ink text-paper">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${isActive ? "bg-gold text-ink" : "text-paper/85 hover:text-paper"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {user && <NotificationBell key={`${user.id}-${tick}`} />}
            {user ? (
              <button onClick={signOut} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-paper/85 hover:text-paper" aria-label="Sign out">
                <Icon name="logout" size={18} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              <NavLink to="/login" state={{ from: loc.pathname }} className="btn-dark-outline btn-sm">
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <ErrorBoundary key={`${loc.pathname}-${user?.id ?? "anon"}-${tick}`}>
          <Outlet key={`${user?.id ?? "anon"}-${tick}`} />
        </ErrorBoundary>
      </main>

      <footer className="on-dark hidden bg-ink text-paper/80 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm">
          <Logo />
          <NavLink to="/safety" className="hover:text-paper">
            Safety and protection hold
          </NavLink>
          <span className="ml-auto text-xs text-paper/60">Payments, verification and locations are simulated. Not affiliated with UCF.</span>
        </div>
      </footer>

      <nav className="on-dark fixed inset-x-0 bottom-0 z-30 border-t border-paper/10 bg-ink pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main">
        <ul className="grid grid-cols-6">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${isActive ? "text-gold" : "text-paper/75"}`}
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-7 w-10 items-center justify-center rounded-full ${isActive ? "bg-gold text-ink" : ""}`}>
                      <Icon name={n.icon} size={19} />
                    </span>
                    {n.short ?? n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
