import { Sun } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { DataBanner } from "../components/DataBanner";
import { InstallHint } from "../components/InstallHint";
import { StatusPill } from "../components/StatusPill";
import { ThemeToggle } from "../components/ThemeToggle";
import { SECTIONS } from "./navigation";
import { UpdatePrompt } from "./UpdatePrompt";

/**
 * Navigation in the style of GitHub: a header row (brand, API status, theme) and a row of
 * underlined tabs. On phones the same tabs become a bar along the bottom, within thumb reach.
 * `main` fills the rest of the screen; pages choose their own width (see PageContainer),
 * so a map can run edge to edge under the header.
 */
export function AppLayout() {
  const tabs = useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();

  // On narrow screens the active tab can be scrolled out of sight; bring it back.
  useEffect(() => {
    tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Pinned, except on short screens (a phone on its side), where it would take a third of the height. */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface [@media(max-height:500px)]:static">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <Brand />
          <div className="ml-auto flex items-center gap-1.5">
            <StatusPill />
            <ThemeToggle />
          </div>
        </div>

        <nav
          aria-label="Main"
          className="mx-auto max-w-[1440px] px-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:border-t max-md:border-line max-md:bg-surface max-md:pb-[env(safe-area-inset-bottom)] md:px-4"
        >
          <ul ref={tabs} className="-mb-px flex overflow-x-auto [scrollbar-width:none]">
            {SECTIONS.map(({ path, label, icon: Icon }) => (
              <li key={path} className="shrink-0 max-md:flex-1">
                <NavLink
                  to={path}
                  end
                  className={({ isActive }) =>
                    `group relative flex h-12 items-center px-1 text-sm font-medium after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full max-md:h-14 max-md:justify-center max-md:after:top-0 max-md:after:bottom-auto ${
                      isActive ? "text-ink after:bg-sun" : "text-ink-muted hover:text-ink"
                    }`
                  }
                >
                  <span className="flex items-center gap-2 rounded-control px-2.5 py-1.5 transition-colors group-hover:bg-surface-muted max-md:flex-col max-md:gap-0.5 max-md:px-1 max-md:py-0 max-md:text-[11px] max-md:group-hover:bg-transparent">
                    <Icon className="size-4 max-md:size-5" aria-hidden />
                    {label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* On phones, leave room for the bottom bar (and the home indicator under it). */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <DataBanner />
        <InstallHint />
        <Outlet />
      </main>
      <UpdatePrompt />
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/" aria-label="Solar Race Planner, overview" className="flex min-h-11 min-w-11 items-center gap-2.5 rounded-control">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-sun text-on-sun">
        <Sun className="size-[18px]" aria-hidden />
      </span>
      <span className="hidden font-display text-[17px] font-semibold tracking-tight sm:inline">Solar Race Planner</span>
    </NavLink>
  );
}
