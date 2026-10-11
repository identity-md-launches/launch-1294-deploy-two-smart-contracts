import { useCallback, useEffect, useRef, useState } from "react";
import { CHAIN_ID } from "./config";
import { short } from "./model";
import { currentPage, pages, type Route } from "./routes";
import type { Wallet } from "./wallet";

export function Header({
  route,
  wallet,
  openWallet,
}: {
  route: Route;
  wallet: Wallet;
  openWallet: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const closeMenu = useCallback((restore = true) => {
    setMenuOpen(false);
    if (restore) menuButton.current?.focus();
  }, []);
  useEffect(() => setMenuOpen(false), [route.page, route.title]);
  useEffect(() => {
    if (!menuOpen) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    const outside = (event: MouseEvent) => {
      if (!header.current?.contains(event.target as Node)) closeMenu();
    };
    const desktop = matchMedia("(min-width: 860px)");
    const resize = () => {
      if (desktop.matches) closeMenu(false);
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("click", outside);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("click", outside);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen, closeMenu]);
  const navigation = pages.map(([href, label]) => (
    <a
      key={href}
      href={href}
      aria-current={currentPage(route, href) ? "page" : undefined}
      onClick={() => {
        if (menuOpen) closeMenu();
      }}
    >
      {label}
    </a>
  ));
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme ?? "light",
  );
  const set = useCallback((next: string, remember = false) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#000000" : "#ffffff");
    if (remember) {
      try {
        localStorage.setItem("imd-acc-theme", next);
      } catch {
        /* Storage may be unavailable. */
      }
    }
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      let saved;
      try {
        saved = localStorage.getItem("imd-acc-theme");
      } catch {}
      if (!saved) set(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [set]);
  return (
    <>
      <header ref={header} className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            imd/acc
          </a>
          <nav className="desktop-nav" aria-label="Main">
            {navigation}
          </nav>
          <button
            ref={menuButton}
            type="button"
            className="small menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
          <div className="top-actions">
            <button
              className="small theme-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => set(theme === "light" ? "dark" : "light", true)}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                {theme === "light" ? (
                  <path d="M16 12.5A7 7 0 0 1 7.5 4 7 7 0 1 0 16 12.5Z" />
                ) : (
                  <>
                    <circle cx="10" cy="10" r="3.5" />
                    <path d="M10 0v3m0 14v3M0 10h3m14 0h3M3 3l2 2m10 10 2 2M3 17l2-2M15 5l2-2" />
                  </>
                )}
              </svg>
            </button>
            <button
              className="small connect-button"
              onClick={openWallet}
              disabled={wallet.connecting}
            >
              {wallet.connecting
                ? "Wait…"
                : wallet.account
                  ? short(wallet.account)
                  : "Connect"}
            </button>
          </div>
        </div>
        <nav
          id="mobile-navigation"
          className="mobile-nav"
          aria-label="Main"
          hidden={!menuOpen}
        >
          {navigation}
        </nav>
      </header>
      <div className="wallet-notice" role="status" hidden={!wallet.status}>
        {wallet.status}
        {wallet.account && wallet.chain !== CHAIN_ID && (
          <button className="small" onClick={() => void wallet.connect()}>
            Switch to Sepolia
          </button>
        )}
      </div>
    </>
  );
}
