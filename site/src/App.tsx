import { useCallback, useEffect, useRef, useState } from "react";
import {
  ADDRESSES as A,
  CHAIN_ID,
  EXPLORER,
  REGISTRY,
  STACKER,
  TOKEN,
} from "./config";
import { DataLoader, rpc, type Snapshot } from "./chain";
import { amount, duration, key, short, units } from "./model";
import { Address, DataMessage, Frame, Table, TxStatus } from "./ui";
import {
  explainError,
  useTransactions,
  useWallet,
  type Transactions,
  type Wallet,
} from "./wallet";
import { ListingForms, OpenQuestion } from "./forms";
import { Docs } from "./Docs";

export function App() {
  const wallet = useWallet();
  const [route, setRoute] = useState(location.hash || "#/");
  const docs = route.startsWith("#/docs");
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
    const change = () => setRoute(location.hash || "#/");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const previousRoute = useRef(route);
  useEffect(() => {
    document.title = docs
      ? "Docs · imd/acc · Sepolia"
      : "imd/acc · Sepolia test run 2";
    const anchor = route.startsWith("#/docs/")
      ? route.slice(7)
      : route === "#/stack"
        ? "stack-title"
        : "";
    if (anchor) {
      const element = document.getElementById(anchor);
      element?.scrollIntoView();
      element?.focus({ preventScroll: true });
    } else if (route !== previousRoute.current) {
      window.scrollTo(0, 0);
      document
        .getElementById(docs ? "docs-heading" : "app-heading")
        ?.focus({ preventScroll: true });
    }
    previousRoute.current = route;
  }, [route, docs]);
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
      <a className="skip-link" href={docs ? "#/docs/what-it-is" : "#/stack"}>
        Skip to content
      </a>
      <Header {...{ docs, wallet, openWallet }} />
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
      <div hidden={docs}>
        <main className="container" id="app-main">
          <div className="page-heading">
            <h1 id="app-heading" tabIndex={-1}>
              Sepolia test run 2
            </h1>
            <p>Trading cashback, held as staked IMD.</p>
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
            {error && (
              <p className="hint alarm" role="status">
                {error}
              </p>
            )}
          </div>
          <div className="app-grid">
            <Frame id="stack" title="Your stack" className="your-stack">
              {!wallet.account ? (
                <div className="intro-stack">
                  <p>
                    Connect to see your cashback, points, tsIMD balance and what
                    your cashback is worth now.
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={openWallet}
                      disabled={wallet.connecting}
                    >
                      {wallet.connecting ? "Connecting…" : "Connect wallet"}
                    </button>
                    <a href="#/docs">How it works ↗</a>
                  </div>
                  <p className="hint">Sepolia only. Use test tokens.</p>
                </div>
              ) : (
                <>
                  {message}
                  {view && currentWallet ? (
                    <YourStack data={view} />
                  ) : (
                    !message && (
                      <p className="dim">Loading this wallet’s stack…</p>
                    )
                  )}
                </>
              )}
            </Frame>
            <Frame
              id="projects"
              title="Projects"
              className="projects-section"
              action={<a href="#/docs/get-listed">Listing rules ↗</a>}
            >
              {message}
              {view && <Projects data={view} />}
            </Frame>
            <div className="listing-grid">
              <Frame id="listing" title="Apply and challenge">
                {message}
                <ListingForms data={view} {...{ tx, ready }} now={chainNow} />
              </Frame>
              <Frame id="questions" title="Open questions">
                <p className="secondary">
                  The panel answers in a few minutes. Open questions refresh
                  every 15 seconds.
                </p>
                {message}
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
                    <Outcomes data={view} />
                  </>
                )}
              </Frame>
            </div>
            <Frame
              id="leaderboards"
              title="Leaderboards"
              className="leaderboards"
            >
              <p className="secondary">
                Points count IMD stacked inside a project’s listing periods.
              </p>
              {message}
              {view && <Boards data={view} />}
            </Frame>
            <Frame id="tools" title="Test tools" className="test-tools">
              {message}
              <TestTools
                data={view}
                {...{ tx, ready }}
                now={chainNow}
                connected={!!wallet.account}
              />
            </Frame>
            <Frame
              id="contracts"
              title="Contracts"
              className="contracts-section"
            >
              <ContractAddresses />
              {message}
              {view && (
                <div className="contract-stats">
                  <p className={`secondary ${view.paused ? "alarm" : "ok"}`}>
                    Vault {view.paused ? "paused" : "open"}
                  </p>
                  <p className="secondary">
                    Total assets <strong>{units(view.totalAssets)} IMD</strong>
                  </p>
                  <p className="secondary">
                    Total stacked{" "}
                    <strong>{units(view.totalStacked)} IMD</strong>
                  </p>
                </div>
              )}
            </Frame>
          </div>
        </main>
      </div>
      <div hidden={!docs}>
        <Docs data={view} error={error} loading={loading} refresh={refresh} />
      </div>
      <footer className="footer">
        <p>imd/acc · Sepolia 11155111</p>
        <div>
          <a href="#/docs">Documentation</a> ·{" "}
          <a href="./llms.txt">For agents ↗</a>
        </div>
      </footer>
    </>
  );
}
function Header({
  docs,
  wallet,
  openWallet,
}: {
  docs: boolean;
  wallet: Wallet;
  openWallet: () => void;
}) {
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
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            imd/acc
          </a>
          <span className="network-label">Sepolia test</span>
          <nav aria-label="Main">
            <a href="#/" aria-current={!docs ? "page" : undefined}>
              App
            </a>
            <a href="#/docs" aria-current={docs ? "page" : undefined}>
              Docs
            </a>
          </nav>
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
function YourStack({ data }: { data: Snapshot }) {
  const wallet = data.wallet!,
    trader = data.summary.traders.get(key(wallet.account));
  const cashback = trader?.cashback ?? 0n,
    earned = wallet.value - cashback;
  const figures = [
    ["Cashback received", units(cashback), "IMD"],
    ["Points", units(trader?.points ?? 0n), ""],
    ["tsIMD held", units(wallet.held, data.decimals), "tsIMD"],
    ["Worth now", units(wallet.value), "IMD"],
    ["Earned on top", `${earned > 0n ? "+" : ""}${units(earned)}`, "IMD"],
  ];
  return (
    <>
      <p className="secondary">
        <Address value={wallet.account} />
      </p>
      <dl className="stack-values">
        {figures.map(([label, value, token]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value} {token && <small>{token}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        Worth now prices the shares from your cashback events. Your held balance
        can differ after transfers or withdrawals.
      </p>
      <h3>By project</h3>
      {!trader?.projects.size ? (
        <p className="dim">
          No cashback yet. Try stacking to yourself in Test tools.
        </p>
      ) : (
        <Table label="Cashback by project">
          <thead>
            <tr>
              <th>Project</th>
              <th className="num">Received IMD</th>
              <th className="num">Points</th>
              <th className="num">Worth now IMD</th>
              <th className="num">Earned IMD</th>
            </tr>
          </thead>
          <tbody>
            {[...trader.projects.values()].map((p) => (
              <tr key={p.address}>
                <td>
                  <Address
                    value={p.address}
                    label={data.summary.projects.get(key(p.address))?.name}
                  />
                </td>
                <td className="num">{units(p.cashback)}</td>
                <td className="num">{units(p.points)}</td>
                <td className="num">
                  {units(wallet.projectValues.get(key(p.address)) ?? 0n)}
                </td>
                <td className="num">
                  {units(
                    (wallet.projectValues.get(key(p.address)) ?? 0n) -
                      p.cashback,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
function Projects({ data }: { data: Snapshot }) {
  if (!data.projects.length)
    return (
      <p className="dim empty">
        No projects have applied yet. Use Apply below to request a listing.
      </p>
    );
  return (
    <>
      <p className="secondary">
        Rates are historical application rates. Stacked totals and traders count
        only listing periods.
      </p>
      <Table label="Projects and listing history" className="project-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>State</th>
            <th className="num">Rate</th>
            <th>Beneficiary</th>
            <th>Listing periods</th>
            <th className="num">IMD stacked</th>
            <th className="num">Traders</th>
          </tr>
        </thead>
        <tbody>
          {data.projects.map((p) => {
            const total = data.summary.topProjects.find(
              (t) => key(t.address) === key(p.address),
            );
            const state =
              p.state.ask === 2n
                ? "Under challenge"
                : p.state.ask === 1n
                  ? "Applied"
                  : p.state.listed
                    ? "Listed"
                    : p.outcome;
            return (
              <tr key={p.address}>
                <td>
                  <div className="project-name">{p.name}</div>
                  <Address value={p.address} />
                </td>
                <td
                  className={`project-state ${state === "Listed" ? "ok" : ""}`}
                >
                  {state}
                </td>
                <td className="num">{Number(p.state.rateBps) / 100}%</td>
                <td>
                  <Address value={p.state.beneficiary} />
                </td>
                <td className="period-list">
                  {p.periods.length
                    ? p.periods.map((period, i) => (
                        <div key={i}>
                          {period.from.toLocaleString()} ≤ block
                          {period.to !== null
                            ? ` < ${period.to.toLocaleString()}`
                            : " (open)"}
                        </div>
                      ))
                    : "None"}
                </td>
                <td className="num">{units(total?.points ?? 0n)}</td>
                <td className="num">{total?.traders.size ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
function Outcomes({ data }: { data: Snapshot }) {
  const outcomes = data.events
    .filter((e) =>
      ["Listed", "Rejected", "Defended", "Delisted", "AskCleared"].includes(
        e.name,
      ),
    )
    .slice(-5)
    .reverse();
  if (!outcomes.length) return null;
  const labels: Record<string, string> = {
    Listed: "Application accepted. Listed.",
    Rejected: "Application rejected.",
    Defended: "Challenge defended. Still listed; bond paid to beneficiary.",
    Delisted: "Delisted. Challenge bond returned.",
    AskCleared:
      "Question cleared without a decision. Any challenge bond returned.",
  };
  return (
    <div role="status" aria-live="polite">
      <h3>Recent outcomes</h3>
      <ul className="outcome-list">
        {outcomes.map((e) => (
          <li key={`${e.tx}:${e.index}`}>
            <p>
              <Address
                value={e.args.project}
                label={data.summary.projects.get(key(e.args.project))?.name}
              />
            </p>
            <p className="secondary">
              {labels[e.name]}{" "}
              <a
                href={`${EXPLORER}/tx/${e.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                Block {e.block.toLocaleString()} ↗
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Boards({ data }: { data: Snapshot }) {
  return (
    <>
      <div className="board-columns">
        <div>
          <h3>Top stackers</h3>
          {!data.summary.topTraders.length ? (
            <p className="dim">
              No points yet. Credits from listed projects appear here.
            </p>
          ) : (
            <Table label="Top stackers by points">
              <thead>
                <tr>
                  <th>Trader</th>
                  <th className="num">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.topTraders.slice(0, 20).map((t) => (
                  <tr key={t.address}>
                    <td>
                      <Address value={t.address} />
                    </td>
                    <td className="num">{units(t.points)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div>
          <h3>Top projects</h3>
          {!data.summary.topProjects.length ? (
            <p className="dim">No IMD stacked inside listing periods yet.</p>
          ) : (
            <Table label="Top projects by stacked IMD">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">IMD stacked</th>
                  <th className="num">Traders</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.topProjects.slice(0, 20).map((p) => (
                  <tr key={p.address}>
                    <td>
                      <Address
                        value={p.address}
                        label={data.summary.projects.get(key(p.address))?.name}
                      />
                    </td>
                    <td className="num">{units(p.points)}</td>
                    <td className="num">{p.traders.size}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
      <h3>Last 10 stacks</h3>
      {!data.summary.credits.length ? (
        <p className="dim">
          No stacks recorded yet. Test tools can make a direct stack.
        </p>
      ) : (
        <Table label="Last ten stacks of any kind" className="recent-stacks">
          <thead>
            <tr>
              <th>Trader</th>
              <th>Project</th>
              <th>Kind</th>
              <th className="num">IMD</th>
              <th className="num">Block</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.credits
              .slice(-10)
              .reverse()
              .map((c) => (
                <tr key={`${c.tx}:${c.index}`}>
                  <td>
                    <Address value={c.args.trader} />
                  </td>
                  <td>
                    <Address
                      value={c.args.project}
                      label={
                        data.summary.projects.get(key(c.args.project))?.name
                      }
                    />
                  </td>
                  <td className={c.eligible ? "ok" : "dim"}>
                    {c.eligible ? "Listed" : "Direct, no points"}
                  </td>
                  <td className="num">{units(c.args.imd)}</td>
                  <td className="num">
                    <a
                      href={`${EXPLORER}/tx/${c.tx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.block.toLocaleString()} ↗
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
function TestTools({
  data,
  tx,
  ready,
  now,
  connected,
}: {
  data?: Snapshot;
  tx: Transactions;
  ready: boolean;
  now: number;
  connected: boolean;
}) {
  const [input, setInput] = useState("1"),
    [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  let value = 0n;
  try {
    value = amount(input);
  } catch {
    /* Validate on action. */
  }
  const w = data?.wallet,
    wait = w ? Number(w.nextFaucet) - now : 0;
  const validate = () => {
    try {
      const v = amount(input);
      if (w && v > w.balance)
        throw new Error(
          "Amount exceeds your test IMD balance. Claim from the faucet first.",
        );
      setError("");
      return v;
    } catch (e) {
      setError(explainError(e));
      ref.current?.focus();
      return undefined;
    }
  };
  return (
    <>
      <p className="secondary">
        {connected
          ? w
            ? `Balance: ${units(w.balance)} test IMD.`
            : "Loading your test IMD balance…"
          : "Connect a wallet to claim test IMD and try a direct stack."}
      </p>
      <button
        disabled={!ready || tx.busy || wait > 0}
        onClick={() => void tx.run("faucet", A.TestIMD, TOKEN, "faucet", [])}
      >
        {tx.states.faucet?.phase === "pending" ? "Claiming…" : "Claim faucet"}
      </button>
      <p className="hint">
        {w
          ? wait > 0
            ? `Next claim in ${duration(wait)}. Available ${new Date(Number(w.nextFaucet) * 1000).toLocaleString()}.`
            : "Faucet available now. 10,000 test IMD every 24 hours."
          : "10,000 test IMD every 24 hours. Sepolia ETH pays for gas."}
      </p>
      <TxStatus state={tx.states.faucet} />
      <h3>Stack to myself</h3>
      <p className="secondary">
        Direct, no points. Deposit your own test IMD into the vault.
      </p>
      {data?.paused && (
        <p className="alarm secondary">
          The vault is paused. Stacking is unavailable.
        </p>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const v = validate();
          if (v !== undefined)
            void tx.run("credit", A.Stacker, STACKER, "credit", [
              w?.account,
              v,
            ]);
        }}
      >
        <div className="field">
          <label htmlFor="stack-amount">Amount of test IMD</label>
          <input
            ref={ref}
            id="stack-amount"
            inputMode="decimal"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            aria-invalid={!!error}
            aria-describedby="stack-error"
          />
          <p className="hint alarm" id="stack-error" role="status">
            {error}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            disabled={!ready || tx.busy || data?.paused}
            onClick={() => {
              const v = validate();
              if (v !== undefined)
                void tx.run("approve-stack", A.TestIMD, TOKEN, "approve", [
                  A.Stacker,
                  v,
                ]);
            }}
          >
            {tx.states["approve-stack"]?.phase === "pending"
              ? "Approving…"
              : "Approve IMD"}
          </button>
          <button
            type="submit"
            disabled={
              !ready ||
              tx.busy ||
              data?.paused ||
              value === 0n ||
              (w?.stakeAllowance ?? 0n) < value
            }
          >
            {tx.states.credit?.phase === "pending"
              ? "Stacking…"
              : "Stack to myself"}
          </button>
        </div>
        <TxStatus state={tx.states["approve-stack"]} />
        <TxStatus state={tx.states.credit} />
      </form>
    </>
  );
}
export function ContractAddresses() {
  const names: Record<keyof typeof A, string> = {
    Stacker: "Stacker",
    ProjectRegistry: "ProjectRegistry",
    TestIMD: "TestIMD",
    TestSIMD: "TestSIMD",
    OracleIMD: "Oracle fee token",
    Intake: "Intake v2",
  };
  return (
    <div className="contract-addresses">
      {(Object.entries(A) as [keyof typeof A, string][]).map(
        ([name, value]) => (
          <div key={name} className="contract-row">
            <span>{names[name]}</span>
            <Address value={value} copy />
          </div>
        ),
      )}
    </div>
  );
}
