import { useRef, useState } from "react";
import { ADDRESSES as A, EXPLORER, STACKER, TOKEN } from "./config";
import type { Snapshot } from "./chain";
import { amount, duration, key, short, units } from "./model";
import { Address, Frame, ProjectLink, Table, TxStatus } from "./ui";
import { explainError, type Transactions } from "./wallet";
import { ChallengeForm, OpenQuestion } from "./forms";
import { projectPath } from "./routes";

export function Home({
  data,
  connected,
  connecting,
  openWallet,
}: {
  data?: Snapshot;
  connected: boolean;
  connecting: boolean;
  openWallet: () => void;
}) {
  const trader =
    data?.wallet && data.summary.traders.get(key(data.wallet.account));
  return (
    <>
      <section className="home-intro" aria-label="About imd/acc">
        <p>
          imd/acc pays trading cashback as staked IMD. Projects deposit it into
          the vault for traders, and an IdentityMD oracle panel decides which
          projects earn points.
        </p>
        <ul className="home-facts">
          <li>Cashback: 0.25%–1% of each trade, paid as staked IMD.</li>
          <li>No owner of the Stacker or ProjectRegistry.</li>
          <li>
            1 point per IMD from a listed project, inside its listing periods.
          </li>
        </ul>
        {connected ? (
          <p className="stack-summary">
            <a href="#/stack">Your stack</a>:{" "}
            {data?.wallet
              ? `${units(trader?.cashback ?? 0n)} IMD cashback · ${units(trader?.points ?? 0n)} points · ${units(data.wallet.held, data.decimals)} tsIMD held.`
              : "loading your wallet…"}
          </p>
        ) : (
          <div className="actions">
            <button
              className="primary"
              onClick={openWallet}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
            <a href="#/stack">View your stack</a>
          </div>
        )}
        <p className="hint">Sepolia only. Use test tokens.</p>
        <p className="home-links">
          <a href="#/apply">Apply for a listing</a> ·{" "}
          <a href="#/docs/what">Read the docs</a>
        </p>
      </section>
      <Frame id="vault" title="Vault">
        {data ? (
          <div className="contract-stats">
            <p className={`secondary ${data.paused ? "alarm" : "ok"}`}>
              Vault {data.paused ? "paused" : "open"}
            </p>
            <p className="secondary">
              Total assets <strong>{units(data.totalAssets)} IMD</strong>
            </p>
            <p className="secondary">
              Total stacked <strong>{units(data.totalStacked)} IMD</strong>
            </p>
          </div>
        ) : (
          <p className="dim">Loading vault status and totals…</p>
        )}
        <p className="hint">
          TestSIMD has an external owner with pause and asset-sweep powers.{" "}
          <a href="#/docs/addresses">Contract details</a>.
        </p>
      </Frame>
      <Frame
        id="recent"
        title="Last 5 stacks"
        action={<a href="#/leaderboard">Leaderboard ↗</a>}
      >
        {data && <RecentStacks data={data} count={5} />}
      </Frame>
    </>
  );
}

const registryEvents = [
  "Applied",
  "Listed",
  "Rejected",
  "Challenged",
  "Defended",
  "Delisted",
  "AskCleared",
  "BeneficiarySet",
];
export function ProjectPage({
  address,
  data,
  tx,
  ready,
  now,
}: {
  address: string;
  data: Snapshot;
  tx: Transactions;
  ready: boolean;
  now: number;
}) {
  const project = data.projects.find((p) => key(p.address) === key(address));
  const total = data.summary.topProjects.find(
    (p) => key(p.address) === key(address),
  );
  const history = data.events
    .filter(
      (e) =>
        key(e.args.project ?? "") === key(address) &&
        registryEvents.includes(e.name),
    )
    .slice()
    .reverse();
  const state = project
    ? project.state.ask === 2n
      ? "Under challenge"
      : project.state.ask === 1n
        ? "Applied"
        : project.state.listed
          ? "Listed"
          : project.outcome
    : "Not applied";
  return (
    <>
      <Frame
        id="project-details"
        title={project?.name ?? short(address)}
        action={<a href="#/projects">All projects</a>}
      >
        <p>
          <Address value={address} copy />
        </p>
        <dl className="details-list project-details">
          <div>
            <dt>State</dt>
            <dd className={project?.state.listed ? "ok" : undefined}>
              {state}
            </dd>
          </div>
          <div>
            <dt>Applied rate (historical)</dt>
            <dd>
              {project
                ? `${Number(project.state.rateBps) / 100}%`
                : "No application"}
            </dd>
          </div>
          <div>
            <dt>Beneficiary</dt>
            <dd>
              {project ? (
                <Address value={project.state.beneficiary} copy />
              ) : (
                "Not set"
              )}
            </dd>
          </div>
          <div>
            <dt>IMD stacked inside listing periods</dt>
            <dd>{units(total?.points ?? 0n)} IMD</dd>
          </div>
          <div>
            <dt>Traders inside listing periods</dt>
            <dd>{total?.traders.size ?? 0}</dd>
          </div>
        </dl>
        {project?.url && (
          <p>
            <a href={project.url} target="_blank" rel="noreferrer">
              Verified source ↗
            </a>
          </p>
        )}
        <h3>Listing periods</h3>
        {project?.periods.length ? (
          <ul>
            {project.periods.map((period, index) => (
              <li key={index}>
                {period.from.toLocaleString()} ≤ block
                {period.to === null
                  ? " (open)"
                  : ` < ${period.to.toLocaleString()}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim">
            No listing periods. Credits are direct, with no points.
          </p>
        )}
        {!project && (
          <p>
            <a href="#/apply">Apply for a listing</a>.
          </p>
        )}
      </Frame>
      <Frame id="project-history" title="Registry history">
        {!history.length ? (
          <p className="dim">No registry history for this address.</p>
        ) : (
          <ol className="history-list">
            {history.map((event) => {
              const date = data.eventDates.get(event.block);
              return (
                <li key={`${event.tx}:${event.index}`}>
                  <p>
                    <strong>{event.name}</strong>
                    {date !== undefined && (
                      <>
                        {" "}
                        ·{" "}
                        <time dateTime={new Date(date * 1000).toISOString()}>
                          {new Date(date * 1000).toLocaleString()}
                        </time>
                      </>
                    )}
                  </p>
                  {event.name === "Applied" && (
                    <p className="secondary">
                      {event.args.name} · {Number(event.args.rateBps) / 100}%
                      applied rate (historical)
                    </p>
                  )}
                  {event.name === "Challenged" && (
                    <p className="secondary">{event.args.reason}</p>
                  )}
                  {event.name === "BeneficiarySet" && (
                    <p className="secondary">
                      Beneficiary: <Address value={event.args.beneficiary} />
                    </p>
                  )}
                  <a
                    className="secondary"
                    href={`${EXPLORER}/tx/${event.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Block {event.block.toLocaleString()} ↗
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </Frame>
      <Frame id="project-question" title="Open question">
        {project && project.state.ask !== 0n ? (
          <OpenQuestion project={project} {...{ data, tx, ready, now }} />
        ) : (
          <p className="dim">This project has no open question.</p>
        )}
      </Frame>
      {project?.state.listed && (
        <Frame id="challenge" title="Challenge listing">
          <ChallengeForm project={project} {...{ data, tx, ready, now }} />
        </Frame>
      )}
    </>
  );
}

export function YourStack({ data }: { data: Snapshot }) {
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
                  <ProjectLink
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
export function Projects({ data }: { data: Snapshot }) {
  const [filter, setFilter] = useState("All");
  const projects = data.projects.filter(
    (p) =>
      filter === "All" ||
      (filter === "Listed" && p.state.listed) ||
      (filter === "Applied" &&
        !p.state.listed &&
        (p.state.ask === 1n || p.outcome.startsWith("Applied"))) ||
      (filter === "Delisted" && !p.state.listed && p.outcome === "Delisted"),
  );
  return (
    <>
      <p className="secondary">
        Rates are historical application rates. Stacked totals and traders count
        only listing periods.
      </p>
      <div className="filters" role="group" aria-label="Filter projects">
        {["All", "Listed", "Applied", "Delisted"].map((name) => (
          <button
            key={name}
            type="button"
            className="small"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="hint" role="status">
        {projects.length} {filter.toLowerCase()} project
        {projects.length === 1 ? "" : "s"}.
      </p>
      {!projects.length ? (
        <p className="dim empty">
          {filter === "All" ? (
            <>
              No projects have applied yet.{" "}
              <a href="#/apply">Apply for a listing</a>.
            </>
          ) : (
            <>
              No {filter.toLowerCase()} projects.{" "}
              <button
                type="button"
                className="small"
                onClick={() => setFilter("All")}
              >
                Show all projects
              </button>
            </>
          )}
        </p>
      ) : (
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
            {projects.map((p) => {
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
                <tr
                  key={p.address}
                  className="project-row"
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest("a, button") ||
                      window.getSelection()?.toString()
                    )
                      return;
                    location.hash = projectPath(p.address);
                  }}
                >
                  <td>
                    <div className="project-name">
                      <ProjectLink value={p.address} label={p.name} />
                    </div>
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
      )}
    </>
  );
}
export function Outcomes({ data }: { data: Snapshot }) {
  const outcomes = data.events
    .filter((e) =>
      ["Listed", "Rejected", "Defended", "Delisted", "AskCleared"].includes(
        e.name,
      ),
    )
    .slice(-5)
    .reverse();
  if (!outcomes.length)
    return (
      <p className="dim">
        No outcomes yet. Panel decisions and expired questions appear here.
      </p>
    );
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
      <ul className="outcome-list">
        {outcomes.map((e) => (
          <li key={`${e.tx}:${e.index}`}>
            <p>
              <ProjectLink
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
export function Boards({ data }: { data: Snapshot }) {
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
                      <ProjectLink
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
      <RecentStacks data={data} count={10} />
    </>
  );
}
export function RecentStacks({
  data,
  count,
}: {
  data: Snapshot;
  count: number;
}) {
  return (
    <>
      {!data.summary.credits.length ? (
        <p className="dim">
          No stacks recorded yet. Try a direct stack in{" "}
          <a href="#/stack">Test tools</a>.
        </p>
      ) : (
        <Table
          label={`Last ${count} stacks of any kind`}
          className="recent-stacks"
        >
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
              .slice(-count)
              .reverse()
              .map((c) => (
                <tr key={`${c.tx}:${c.index}`}>
                  <td>
                    <Address value={c.args.trader} />
                  </td>
                  <td>
                    <ProjectLink
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
export function TestTools({
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
