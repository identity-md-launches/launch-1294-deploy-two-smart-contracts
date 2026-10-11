import { useEffect, useId, useRef, useState } from "react";
import { ADDRESSES as A, REGISTRY, TOKEN } from "./config";
import {
  checkApplication,
  checkChallenge,
  rpc,
  type ProjectView,
  type Snapshot,
} from "./chain";
import {
  type Application,
  type FieldErrors,
  applicationArgs,
  applicationErrors,
  checkedText,
  duration,
  key,
  units,
} from "./model";
import { Address, CodeBlock, TxStatus } from "./ui";
import { explainError, type Transactions } from "./wallet";

type Props = { data?: Snapshot; tx: Transactions; ready: boolean; now: number };
const textHint =
  "Printable ASCII only. No double quotes, backslashes or square brackets.";
export function ListingForms({ data, tx, ready, now }: Props) {
  const [tab, setTab] = useState<"apply" | "challenge">("apply");
  const applyTab = useRef<HTMLButtonElement>(null),
    challengeTab = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div
        className="tabs"
        role="tablist"
        aria-label="Listing actions"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "apply"
                : e.key === "End"
                  ? "challenge"
                  : tab === "apply"
                    ? "challenge"
                    : "apply";
            setTab(next);
            (next === "apply" ? applyTab : challengeTab).current?.focus();
          }
        }}
      >
        <button
          ref={applyTab}
          id="apply-tab"
          role="tab"
          aria-selected={tab === "apply"}
          aria-controls="apply-panel"
          tabIndex={tab === "apply" ? 0 : -1}
          onClick={() => setTab("apply")}
        >
          Apply
        </button>
        <button
          ref={challengeTab}
          id="challenge-tab"
          role="tab"
          aria-selected={tab === "challenge"}
          aria-controls="challenge-panel"
          tabIndex={tab === "challenge" ? 0 : -1}
          onClick={() => setTab("challenge")}
        >
          Challenge
        </button>
      </div>
      <div
        id="apply-panel"
        role="tabpanel"
        aria-labelledby="apply-tab"
        hidden={tab !== "apply"}
      >
        <ApplyForm {...{ data, tx, ready, now }} />
      </div>
      <div
        id="challenge-panel"
        role="tabpanel"
        aria-labelledby="challenge-tab"
        hidden={tab !== "challenge"}
      >
        <ChallengeForm {...{ data, tx, ready, now }} />
      </div>
    </>
  );
}
function ApplyForm({ data, tx, ready }: Props) {
  const [form, setForm] = useState<Application>({
    project: "",
    name: "",
    url: "",
    rate: "50",
    beneficiary: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [question, setQuestion] = useState("");
  const [check, setCheck] = useState(
    "Complete the fields to read the exact panel question.",
  );
  const [checking, setChecking] = useState(false);
  const [valid, setValid] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formKey = JSON.stringify(form);
  useEffect(() => {
    let cancelled = false;
    setQuestion("");
    setValid(false);
    if (Object.keys(applicationErrors(form)).length) {
      setCheck("Complete the fields to read the exact panel question.");
      setChecking(false);
      return;
    }
    setChecking(true);
    setCheck("Checking contract code and registry status…");
    const timer = window.setTimeout(async () => {
      try {
        const exact = await checkApplication(form);
        if (!cancelled) {
          setQuestion(exact);
          setCheck("Contract code and registry status checked.");
          setValid(true);
        }
      } catch (e) {
        if (!cancelled) setCheck(explainError(e));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [formKey, data?.block]);
  const update = (field: keyof Application, value: string) => {
    setForm((old) => ({ ...old, [field]: value }));
    setErrors((old) => ({ ...old, [field]: undefined }));
  };
  const validate = () => {
    const next = applicationErrors(form);
    setErrors(next);
    if (Object.keys(next).length) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return false;
    }
    return true;
  };
  const fee = data?.fee ?? 0n,
    balance = data?.wallet?.oracleBalance ?? 0n;
  const short = balance < fee,
    approved = fee > 0n && data?.wallet?.oracleAllowance === fee;
  const guard = async () => {
    await checkApplication(form);
    const live = (await rpc.read(
      A.ProjectRegistry,
      REGISTRY,
      "ORACLE_FEE",
    )) as bigint;
    if (live === 0n)
      throw new Error(
        "The oracle is not accepting applications. Try again later.",
      );
    if (live !== fee)
      throw new Error(
        "The oracle fee changed. Refresh and approve the current fee.",
      );
  };
  const field = (
    name: keyof Application,
    label: string,
    props: Record<string, unknown> = {},
    hint?: string,
  ) => (
    <div className={`field ${name === "rate" ? "rate-field" : ""}`}>
      <label htmlFor={`apply-${name}`}>{label}</label>
      <input
        id={`apply-${name}`}
        name={name}
        value={form[name]}
        onChange={(e) => update(name, e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!errors[name]}
        aria-describedby={
          errors[name]
            ? `apply-${name}-error`
            : hint
              ? `apply-${name}-hint`
              : undefined
        }
        {...props}
      />
      {hint && (
        <p id={`apply-${name}-hint`} className="hint">
          {hint}
        </p>
      )}
      {errors[name] && (
        <p id={`apply-${name}-error`} className="hint alarm">
          {errors[name]}
        </p>
      )}
    </div>
  );
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate()) return;
        void tx.run(
          "apply",
          A.ProjectRegistry,
          REGISTRY,
          "applyListing",
          applicationArgs(form),
          async () => {
            await guard();
            const allowance = await rpc.read(A.OracleIMD, TOKEN, "allowance", [
              data?.wallet?.account,
              A.ProjectRegistry,
            ]);
            if (allowance !== fee)
              throw new Error(
                "Approve exactly the current oracle fee before applying.",
              );
          },
        );
      }}
    >
      <p>
        Apply for trading cashback to earn points.{" "}
        <a href="#/docs/get-listed">Read the listing rules</a>.
      </p>
      {field("project", "Project contract", { placeholder: "0x…" })}
      {field("name", "Project name", { maxLength: 48 }, "1–48 characters.")}
      {field(
        "url",
        "Verified source URL",
        { type: "url", maxLength: 200, placeholder: "https://" },
        "12–200 characters, starting with https://.",
      )}
      <p className="hint">{textHint}</p>
      {field(
        "rate",
        `Cashback rate · ${Number(form.rate || 0) / 100}%`,
        { inputMode: "numeric", type: "number", min: 25, max: 100, step: 1 },
        "25–100 basis points = 0.25%–1%.",
      )}
      {field(
        "beneficiary",
        "Beneficiary",
        { placeholder: "0x…" },
        "The project owner, team or treasury wallet.",
      )}
      <p className="secondary">
        {data ? (
          <>
            Oracle fee: <strong>{units(fee)} oracle test IMD</strong>. Balance:{" "}
            {data.wallet ? units(balance) : "connect to see"}.
          </>
        ) : (
          "Loading the live oracle fee…"
        )}
      </p>
      {data?.fee === 0n && (
        <p className="alarm secondary">
          The oracle is not accepting this payment token. Try again later.
        </p>
      )}
      <ol className="steps">
        <li>
          <div>
            <strong>Get test IMD if short</strong>
            <p className="hint">
              Mints 10 oracle test IMD. This is separate from the staking token.
            </p>
          </div>
          <button
            type="button"
            disabled={!ready || tx.busy || !short}
            onClick={() =>
              void tx.run("mint-apply", A.OracleIMD, TOKEN, "mint", [
                data?.wallet?.account,
                10n ** 19n,
              ])
            }
          >
            {tx.states["mint-apply"]?.phase === "pending"
              ? "Minting…"
              : short || !data?.wallet
                ? "Get 10 test IMD"
                : "Balance ready"}
          </button>
          <TxStatus state={tx.states["mint-apply"]} />
        </li>
        <li>
          <div>
            <strong>Approve the oracle fee</strong>
            <p className="hint">
              {data
                ? `${units(fee)} oracle test IMD to ProjectRegistry.`
                : "Waiting for the fee."}
            </p>
          </div>
          <button
            type="button"
            disabled={!ready || tx.busy || short || fee === 0n}
            onClick={() => {
              if (validate())
                void tx.run(
                  "approve-apply",
                  A.OracleIMD,
                  TOKEN,
                  "approve",
                  [A.ProjectRegistry, fee],
                  guard,
                );
            }}
          >
            {tx.states["approve-apply"]?.phase === "pending"
              ? "Approving…"
              : approved
                ? "Approve again"
                : "Approve fee"}
          </button>
          <TxStatus state={tx.states["approve-apply"]} />
        </li>
        <li>
          <div>
            <strong>Send the application</strong>
            <p className="hint">The panel answers in a few minutes.</p>
          </div>
          <button
            type="submit"
            disabled={!ready || tx.busy || !approved || short}
          >
            {tx.states.apply?.phase === "pending"
              ? "Applying…"
              : "Apply for listing"}
          </button>
          <TxStatus state={tx.states.apply} />
        </li>
      </ol>
      {!ready && (
        <p className="hint">
          Connect on Sepolia and load the contract data to continue.
        </p>
      )}
      <h3>The panel question</h3>
      <p className={`secondary ${valid ? "ok" : ""}`} role="status">
        {checking ? "Checking contract code and registry status…" : check}
      </p>
      {question && <CodeBlock code={question} label="Copy question" />}
    </form>
  );
}
function ChallengeForm({ data, tx, ready, now }: Props) {
  const [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const available = data?.projects.filter((p) => p.state.listed) ?? [];
  const project = available.find((p) => key(p.address) === key(selected));
  const fee = data?.fee ?? 0n,
    bond = data?.bond ?? 0n,
    cost = fee + bond;
  const balance = data?.wallet?.oracleBalance ?? 0n;
  const wait = project
    ? Math.max(0, Number(project.state.challengeOpenAt) - now)
    : 0;
  const canAsk = project && project.state.ask === 0n && wait === 0;
  const approved = cost > 0n && data?.wallet?.oracleAllowance === cost;
  const validate = () => {
    if (!project) {
      setError("Select a listed project.");
      document.getElementById("challenge-project")?.focus();
      return false;
    }
    try {
      checkedText(reason, 1, 280, "Reason");
      setError("");
      return true;
    } catch (e) {
      setError(explainError(e));
      reasonRef.current?.focus();
      return false;
    }
  };
  const guard = async () => {
    if (!project) throw new Error("Select a listed project.");
    await checkChallenge(
      project.address,
      reason,
      project.state.beneficiary,
      fee,
    );
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate() || !project) return;
        void tx.run(
          "challenge",
          A.ProjectRegistry,
          REGISTRY,
          "challengeForBeneficiary",
          [project.address, reason, project.state.beneficiary],
          async () => {
            await guard();
            if (
              (await rpc.read(A.OracleIMD, TOKEN, "allowance", [
                data?.wallet?.account,
                A.ProjectRegistry,
              ])) !== cost
            )
              throw new Error(
                "Approve exactly the oracle fee plus bond before challenging.",
              );
          },
        );
      }}
    >
      <p>
        If the project still meets the rules, the bond goes to its beneficiary.
        If not, it is delisted and your bond returns.
      </p>
      <div className="field">
        <label htmlFor="challenge-project">Listed project</label>
        <select
          id="challenge-project"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setError("");
          }}
        >
          <option value="">Select a project</option>
          {available.map((p) => (
            <option key={p.address} value={p.address}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {data && !available.length && (
        <p className="dim">No listed projects to challenge yet.</p>
      )}
      {project && (
        <>
          <p className="secondary">
            Beneficiary: <Address value={project.state.beneficiary} copy />
          </p>
          <p className="secondary">
            {project.state.ask !== 0n
              ? "An open question must settle before another challenge."
              : wait > 0
                ? `Challenge opens in ${duration(wait)} (${new Date(Number(project.state.challengeOpenAt) * 1000).toLocaleString()}).`
                : "The listing cooldown has ended."}
          </p>
        </>
      )}
      <div className="field">
        <label htmlFor="challenge-reason">Reason</label>
        <textarea
          ref={reasonRef}
          id="challenge-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
          maxLength={280}
          rows={4}
          aria-invalid={!!error}
          aria-describedby="reason-hint challenge-error"
        />
        <p id="reason-hint" className="hint">
          1–280 characters. {textHint}
        </p>
        <p id="challenge-error" className="hint alarm" role="status">
          {error}
        </p>
      </div>
      <p className="secondary">
        {data ? (
          <>
            Fee {units(fee)} + bond {units(bond)} ={" "}
            <strong>{units(cost)} oracle test IMD</strong>. Balance:{" "}
            {data.wallet ? units(balance) : "connect to see"}.
          </>
        ) : (
          "Loading the live fee and bond…"
        )}
      </p>
      {data?.wallet && balance < cost && (
        <>
          <button
            type="button"
            disabled={!ready || tx.busy}
            onClick={() =>
              void tx.run("mint-challenge", A.OracleIMD, TOKEN, "mint", [
                data.wallet!.account,
                10n ** 19n,
              ])
            }
          >
            Get 10 test IMD
          </button>
          <TxStatus state={tx.states["mint-challenge"]} />
        </>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={
            !ready || tx.busy || !canAsk || balance < cost || fee === 0n
          }
          onClick={() => {
            if (validate())
              void tx.run(
                "approve-challenge",
                A.OracleIMD,
                TOKEN,
                "approve",
                [A.ProjectRegistry, cost],
                guard,
              );
          }}
        >
          {tx.states["approve-challenge"]?.phase === "pending"
            ? "Approving…"
            : "Approve fee + bond"}
        </button>
        <button
          type="submit"
          disabled={!ready || tx.busy || !canAsk || !approved || balance < cost}
        >
          {tx.states.challenge?.phase === "pending"
            ? "Challenging…"
            : "Challenge listing"}
        </button>
      </div>
      <TxStatus state={tx.states["approve-challenge"]} />
      <TxStatus state={tx.states.challenge} />
      {!ready && (
        <p className="hint">
          Connect on Sepolia and load the contract data to continue.
        </p>
      )}
    </form>
  );
}
export function OpenQuestion({
  project: p,
  data,
  tx,
  ready,
  now,
}: Props & { project: ProjectView; data: Snapshot }) {
  const id = useId(),
    state = p.state;
  const expires = Number(state.askedAt + data.expiry) + 1;
  return (
    <article className="question-row" aria-labelledby={id}>
      <h3 id={id}>{p.name}</h3>
      <p className="secondary">
        <Address value={p.address} /> ·{" "}
        {state.ask === 1n ? "Application" : "Challenge"}
      </p>
      <dl className="details-list">
        <div>
          <dt>Asker</dt>
          <dd>
            <Address value={state.asker} />
          </dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{duration(now - Number(state.askedAt))}</dd>
        </div>
      </dl>
      <p className="hint">
        {p.completed
          ? "The Intake has completed this request. It can be cleared."
          : now > expires
            ? "The expiry time has passed. Refresh to confirm."
            : `May expire in ${duration(expires - now)}, or when the Intake completes it.`}
      </p>
      <button
        className="small"
        disabled={!ready || tx.busy || !p.canExpire}
        onClick={() =>
          void tx.run(
            `expire-${p.address}`,
            A.ProjectRegistry,
            REGISTRY,
            "expire",
            [p.address],
          )
        }
      >
        {tx.states[`expire-${p.address}`]?.phase === "pending"
          ? "Expiring…"
          : "Expire"}
      </button>
      <TxStatus state={tx.states[`expire-${p.address}`]} />
    </article>
  );
}
