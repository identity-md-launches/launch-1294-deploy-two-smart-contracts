import { useCallback, useEffect, useRef, useState } from "react";
import { CHAIN_ID } from "./config";
import { DataLoader, type Snapshot } from "./chain";
import { key } from "./model";
import { Address, DataMessage, Frame } from "./ui";
import { explainError, useTransactions, useWallet } from "./wallet";
import { ApplyForm, OpenQuestion } from "./forms";
import { Docs } from "./Docs";
import { Header } from "./Header";
import { parseRoute } from "./routes";
import {
  Boards,
  Home,
  Outcomes,
  ProjectPage,
  Projects,
  TestTools,
  YourStack,
} from "./pages";

export function App() {
  const wallet = useWallet();
  const [hash, setHash] = useState(location.hash || "#/");
  const route = parseRoute(hash);
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now() / 1000);
  const loader = useRef(new DataLoader()),
    active = useRef(false),
    queued = useRef(false);
  const accountRef = useRef(wallet.account);
  accountRef.current = wallet.account;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(async () => {
    if (active.current) {
      queued.current = true;
      return;
    }
    active.current = true;
    setLoading(true);
    const expected = accountRef.current;
    try {
      const snapshot = await loader.current.load(expected);
      if (expected === accountRef.current) {
        setData(snapshot);
        setError("");
      } else queued.current = true;
    } catch (e) {
      setError(explainError(e));
    } finally {
      active.current = false;
      setLoading(false);
      if (queued.current) {
        queued.current = false;
        void refreshRef.current();
      }
    }
  }, []);
  refreshRef.current = refresh;
  useEffect(() => {
    void refresh();
  }, [refresh, wallet.account]);
  const hasOpen = data?.projects.some((p) => p.state.ask !== 0n);
  useEffect(() => {
    const timer = window.setInterval(
      () => void refresh(),
      hasOpen ? 15000 : 60000,
    );
    return () => clearInterval(timer);
  }, [hasOpen, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const change = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const title =
      route.page === "stack"
        ? "Stack"
        : route.page === "docs"
          ? `${route.title} - Docs`
          : route.title;
    document.title = `${title} - imd/acc`;
    window.scrollTo(0, 0);
    document.getElementById("page-heading")?.focus({ preventScroll: true });
  }, [hash]);
  const tx = useTransactions(wallet, refresh);
  const currentWallet =
    data?.wallet && key(data.wallet.account) === key(wallet.account ?? "")
      ? data.wallet
      : undefined;
  const view = data ? { ...data, wallet: currentWallet } : undefined;
  const ready =
    !!view && !!currentWallet && wallet.chain === CHAIN_ID && !error;
  const chainNow = data
    ? data.timestamp + Math.max(0, now - data.readAt / 1000)
    : now;
  const dialog = useRef<HTMLDialogElement>(null);
  const openWallet = () => {
    if (wallet.account || wallet.options.length > 1)
      dialog.current?.showModal();
    else void wallet.connect();
  };
  const message =
    !view || error ? (
      <DataMessage
        error={
          error
            ? view
              ? "Data could not refresh. Figures below are from the last loaded block."
              : error
            : undefined
        }
        loading={loading}
        onRetry={() => void refresh()}
      />
    ) : null;
  return (
    <>
      <a
        className="skip-link"
        href={hash}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("page-heading")?.focus();
        }}
      >
        Skip to content
      </a>
      <Header {...{ route, wallet, openWallet }} />
      <dialog
        ref={dialog}
        className="wallet-dialog"
        aria-labelledby="wallet-title"
      >
        <div className="dialog-heading">
          <h2 id="wallet-title">
            {wallet.account ? "Your wallet" : "Connect a wallet"}
          </h2>
          <button className="small" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        {wallet.account ? (
          <>
            <p>
              <Address value={wallet.account} copy />
            </p>
            <p className="secondary">
              {wallet.chain === CHAIN_ID
                ? "Connected to Sepolia."
                : "Switch to Sepolia to send transactions."}
            </p>
            <div className="actions">
              {wallet.chain !== CHAIN_ID && (
                <button
                  onClick={() => {
                    dialog.current?.close();
                    void wallet.connect();
                  }}
                >
                  Switch to Sepolia
                </button>
              )}
              <button
                onClick={() => {
                  wallet.disconnect();
                  dialog.current?.close();
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <div className="wallet-options">
            {wallet.options.map((option) => (
              <button
                key={option.info.uuid}
                onClick={() => {
                  dialog.current?.close();
                  void wallet.connect(option);
                }}
              >
                {option.info.name}
              </button>
            ))}
          </div>
        )}
      </dialog>
      <main className="container" id="main-content">
        <div className="page-heading">
          <h1 id="page-heading" tabIndex={-1}>
            {route.title}
          </h1>
          {route.page !== "docs" && route.page !== "not-found" && (
            <p className="secondary">Sepolia test run 2</p>
          )}
          {route.page !== "not-found" &&
            (route.page !== "docs" || route.section === "listing") && (
              <>
                <div className="data-line">
                  <span>
                    {view
                      ? `Data at block ${view.block.toLocaleString()}`
                      : "Reading Sepolia…"}
                    {view && loading ? " · refreshing" : ""}
                  </span>
                  <button
                    className="small"
                    disabled={loading}
                    onClick={() => void refresh()}
                  >
                    {loading ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {message}
              </>
            )}
        </div>
        <div className="app-grid">
          {route.page === "home" && (
            <Home
              data={view}
              connected={!!wallet.account}
              openWallet={openWallet}
              connecting={wallet.connecting}
            />
          )}
          {route.page === "stack" && (
            <>
              <Frame id="stack" title="Your stack">
                {!wallet.account ? (
                  <div className="intro-stack">
                    <p>
                      Connect to see your cashback, points, tsIMD balance and
                      what your cashback is worth now.
                    </p>
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={openWallet}
                        disabled={wallet.connecting}
                      >
                        {wallet.connecting ? "Connecting…" : "Connect wallet"}
                      </button>
                      <a href="#/docs/how">How it works ↗</a>
                    </div>
                    <p className="hint">Sepolia only. Use test tokens.</p>
                  </div>
                ) : view && currentWallet ? (
                  <YourStack data={view} />
                ) : (
                  <p className="dim">Loading this wallet’s stack…</p>
                )}
              </Frame>
              <Frame id="tools" title="Test tools" className="test-tools">
                <TestTools
                  data={view}
                  {...{ tx, ready }}
                  now={chainNow}
                  connected={!!wallet.account}
                />
              </Frame>
            </>
          )}
          {route.page === "projects" && (
            <Frame
              id="projects"
              title="Projects"
              action={<a href="#/docs/listing">Listing rules ↗</a>}
            >
              {view && <Projects data={view} />}
            </Frame>
          )}
          {route.page === "project" && view && (
            <ProjectPage
              key={key(route.address)}
              address={route.address}
              data={view}
              {...{ tx, ready }}
              now={chainNow}
            />
          )}
          {route.page === "apply" && (
            <>
              <Frame id="listing" title="Apply for listing">
                <ApplyForm data={view} {...{ tx, ready }} now={chainNow} />
              </Frame>
              <Frame id="questions" title="Open questions">
                <p className="secondary">
                  The panel answers in a few minutes. Open questions refresh
                  every 15 seconds.
                </p>
                {view && (
                  <>
                    {!hasOpen && (
                      <p className="dim empty">
                        No open questions. Applications and challenges appear
                        here.
                      </p>
                    )}
                    {view.projects
                      .filter((p) => p.state.ask !== 0n)
                      .map((p) => (
                        <OpenQuestion
                          key={p.address}
                          project={p}
                          data={view}
                          {...{ tx, ready }}
                          now={chainNow}
                        />
                      ))}
                  </>
                )}
              </Frame>
              <Frame id="outcomes" title="Recent outcomes">
                {view && <Outcomes data={view} />}
              </Frame>
            </>
          )}
          {route.page === "leaderboard" && (
            <Frame id="leaderboards" title="Leaderboard">
              <p className="secondary">
                Points count IMD stacked inside a project’s listing periods.
              </p>
              {view && <Boards data={view} />}
            </Frame>
          )}
          {route.page === "docs" && (
            <Docs
              section={route.section}
              data={view}
              error={error}
              loading={loading}
              refresh={refresh}
            />
          )}
          {route.page === "not-found" && (
            <p>
              This page does not exist. <a href="#/">Go home</a>.
            </p>
          )}
        </div>
      </main>
      <footer className="footer">
        <p>imd/acc · Sepolia 11155111</p>
        <div>
          <a href="#/docs/what">Documentation</a> ·{" "}
          <a href="#/docs/addresses">Contracts</a> ·{" "}
          <a href="./llms.txt">For agents ↗</a>
        </div>
      </footer>
    </>
  );
}
