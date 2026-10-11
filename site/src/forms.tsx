import { useEffect, useId, useRef, useState } from "react";
import { ADDRESSES as A, REGISTRY, TOKEN } from "./config";
import {
  checkApplication,
  checkApplicationProject,
  checkChallenge,
  checkProject,
  FormFieldError,
  rpc,
  type ProjectView,
  type Snapshot,
} from "./chain";
import {
  type Application,
  type FieldErrors,
  address,
  applicationArgs,
  applicationErrors,
  checkedText,
  duration,
  key,
  units,
} from "./model";
import { Address, CodeBlock, ProjectLink, TxStatus } from "./ui";
import { explainError, type Transactions } from "./wallet";

type Props = { data?: Snapshot; tx: Transactions; ready: boolean; now: number };
const textHint =
  "Printable ASCII only. No double quotes, backslashes or square brackets.";
function unavailable(ready: boolean, busy: boolean) {
  return busy
    ? "Wait for the current transaction to finish."
    : !ready
      ? "Connect on Sepolia and load the contract data to continue."
      : "";
}
function DisabledReason({ id, reason }: { id: string; reason: string }) {
  return (
    <p id={id} className="hint" role="status">
      {reason}
    </p>
  );
}

export function ApplyForm({ data, tx, ready }: Props) {
  const [form, setForm] = useState<Application>({
    project: "",
    name: "",
    url: "",
    rate: "50",
    beneficiary: "",
  });
  const [touched, setTouched] = useState<
    Partial<Record<keyof Application, boolean>>
  >({});
  const [attempted, setAttempted] = useState(false);
  const [remote, setRemote] = useState({
    project: "",
    error: "",
    checked: false,
  });
  const [question, setQuestion] = useState({
    formKey: "",
    text: "",
    error: "",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const formKey = JSON.stringify(form);
  const localErrors = applicationErrors(form);
  const current = data?.projects.find(
    (p) => key(p.address) === key(form.project.trim()),
  );
  const registryError = current?.state.ask
    ? "This project already has an open question. Wait for its outcome."
    : current?.state.listed
      ? "Already listed. Open its project page to review or challenge the listing."
      : "";
  const remoteError = remote.project === form.project ? remote.error : "";
  const errors: FieldErrors = {
    ...localErrors,
    ...(registryError || remoteError
      ? { project: registryError || remoteError }
      : {}),
  };
  const projectChecked =
    remote.project === form.project && remote.checked && !errors.project;
  const syntaxValid = !Object.keys(localErrors).length;
  const exactQuestion = question.formKey === formKey ? question : undefined;
  useEffect(() => {
    let cancelled = false;
    setRemote({ project: form.project, error: "", checked: false });
    try {
      address(form.project);
    } catch {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        await checkApplicationProject(form.project);
        if (!cancelled)
          setRemote({ project: form.project, error: "", checked: true });
      } catch (error) {
        if (!cancelled)
          setRemote({
            project: form.project,
            error: explainError(error),
            checked: true,
          });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.project, data?.block]);
  useEffect(() => {
    let cancelled = false;
    setQuestion({ formKey, text: "", error: "" });
    if (!syntaxValid || !projectChecked) return;
    const timer = window.setTimeout(async () => {
      try {
        const text = await checkApplication(form);
        if (!cancelled) setQuestion({ formKey, text, error: "" });
      } catch (error) {
        if (!cancelled) {
          setQuestion({ formKey, text: "", error: explainError(error) });
          if (error instanceof FormFieldError)
            setRemote({
              project: form.project,
              error: error.message,
              checked: true,
            });
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formKey, projectChecked, data?.block]);
  const validate = () => {
    setAttempted(true);
    const first = Object.entries(errors).find(([, message]) => !!message)?.[0];
    if (first) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return false;
    }
    return true;
  };
  const fee = data?.fee ?? 0n,
    balance = data?.wallet?.oracleBalance ?? 0n;
  const short = balance < fee,
    approved = fee > 0n && data?.wallet?.oracleAllowance === fee;
  const common = unavailable(ready, tx.busy);
  const payment =
    fee === 0n
      ? "The oracle fee is unavailable. Refresh before continuing."
      : short
        ? "Get oracle test IMD to cover the fee first."
        : "";
  const mintReason =
    common || (!short ? "Your balance already covers the oracle fee." : "");
  const approveReason = registryError || remoteError || common || payment;
  const sendReason =
    approveReason ||
    (!approved ? "Approve exactly the oracle fee before applying." : "");
  const guard = async () => {
    try {
      await checkApplication(form);
    } catch (error) {
      if (error instanceof FormFieldError) {
        setAttempted(true);
        setRemote({
          project: form.project,
          error: error.message,
          checked: true,
        });
        formRef.current
          ?.querySelector<HTMLInputElement>('[name="project"]')
          ?.focus();
      }
      throw error;
    }
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
  ) => {
    const error = touched[name] || attempted ? errors[name] : undefined;
    return (
      <div className={`field ${name === "rate" ? "rate-field" : ""}`}>
        <label htmlFor={`apply-${name}`}>{label}</label>
        <input
          id={`apply-${name}`}
          name={name}
          value={form[name]}
          onChange={(event) =>
            setForm((old) => ({ ...old, [name]: event.target.value }))
          }
          onBlur={() => setTouched((old) => ({ ...old, [name]: true }))}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={
            [
              hint ? `apply-${name}-hint` : "",
              error ? `apply-${name}-error` : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          {...props}
        />
        {hint && (
          <p id={`apply-${name}-hint`} className="hint">
            {hint}
          </p>
        )}
        <p id={`apply-${name}-error`} className="hint alarm" role="status">
          {error}
        </p>
      </div>
    );
  };
  return (
    <form
      id="apply-panel"
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validate() || sendReason) return;
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
        <a href="#/docs/listing">Read the listing rules</a>.
      </p>
      {field("project", "Project contract", { placeholder: "0x…" })}
      {field("name", "Project name", {}, "1–48 characters.")}
      {field(
        "url",
        "Verified source URL",
        { type: "url", placeholder: "https://" },
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
      <ol className="steps">
        <li>
          <strong>Get test IMD if short</strong>
          <p className="hint">
            Mints 10 oracle test IMD. This is separate from the staking token.
          </p>
          <button
            type="button"
            disabled={!!mintReason}
            aria-describedby="mint-apply-disabled"
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
          <DisabledReason id="mint-apply-disabled" reason={mintReason} />
          <TxStatus state={tx.states["mint-apply"]} />
        </li>
        <li>
          <strong>Approve the oracle fee</strong>
          <p className="hint">
            {data
              ? `${units(fee)} oracle test IMD to ProjectRegistry.`
              : "Waiting for the fee."}
          </p>
          <button
            type="button"
            disabled={!!approveReason}
            aria-describedby="approve-apply-disabled"
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
          <DisabledReason id="approve-apply-disabled" reason={approveReason} />
          <TxStatus state={tx.states["approve-apply"]} />
        </li>
        <li>
          <strong>Send the application</strong>
          <p className="hint">The panel answers in a few minutes.</p>
          <button
            type="submit"
            disabled={!!sendReason}
            aria-describedby="send-apply-disabled"
          >
            {tx.states.apply?.phase === "pending"
              ? "Applying…"
              : "Apply for listing"}
          </button>
          <DisabledReason id="send-apply-disabled" reason={sendReason} />
          <TxStatus state={tx.states.apply} />
        </li>
      </ol>
      <h3>The panel question</h3>
      <p
        className={`secondary ${exactQuestion?.text ? "ok" : ""}`}
        role="status"
      >
        {registryError || remoteError ||
          exactQuestion?.error ||
          (!syntaxValid
            ? "Complete the fields to read the exact panel question."
            : exactQuestion?.text
              ? "Contract code and registry status checked."
              : "Checking contract code and registry status…")}
      </p>
      {exactQuestion?.text && !errors.project && (
        <CodeBlock code={exactQuestion.text} label="Copy question" />
      )}
    </form>
  );
}

export function ChallengeForm({
  data,
  project,
  tx,
  ready,
  now,
}: Props & { data: Snapshot; project: ProjectView }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [remote, setRemote] = useState<
    Partial<Record<"project" | "reason" | "beneficiary", string>>
  >({});
  const formRef = useRef<HTMLFormElement>(null);
  const wait = Math.max(0, Number(project.state.challengeOpenAt) - now);
  const eligibility =
    project.state.ask !== 0n
      ? "This project already has an open question."
      : !project.state.listed
        ? "This project is no longer listed."
        : wait > 0
          ? `The listing cooldown is not over. Challenge opens ${new Date(Number(project.state.challengeOpenAt) * 1000).toLocaleString()} (in ${duration(wait)}).`
          : "";
  const errors: Partial<Record<"project" | "reason" | "beneficiary", string>> =
    { ...remote };
  if (eligibility) errors.project = eligibility;
  try {
    checkedText(reason, 1, 280, "Reason");
  } catch (error) {
    errors.reason = (error as Error).message;
  }
  try {
    address(project.state.beneficiary);
  } catch (error) {
    errors.beneficiary = (error as Error).message;
  }
  useEffect(() => setRemote({}), [data.block]);
  const fee = data.fee,
    bond = data.bond,
    cost = fee + bond;
  const balance = data.wallet?.oracleBalance ?? 0n;
  const approved = cost > 0n && data.wallet?.oracleAllowance === cost;
  const common = unavailable(ready, tx.busy);
  const approveReason =
    errors.project ||
    errors.beneficiary ||
    common ||
    (fee === 0n
      ? "The oracle fee is unavailable. Refresh before continuing."
      : balance < cost
        ? "Get oracle test IMD to cover the fee and bond first."
        : "");
  const sendReason =
    approveReason ||
    (!approved ? "Approve exactly the fee plus bond before challenging." : "");
  const validate = () => {
    setAttempted(true);
    const first = Object.entries(errors).find(([, message]) => !!message)?.[0];
    if (first) {
      formRef.current
        ?.querySelector<HTMLElement>(`#challenge-${first}`)
        ?.focus();
      return false;
    }
    return true;
  };
  const guard = async () => {
    try {
      await checkProject(project.address);
      await checkChallenge(
        project.address,
        reason,
        project.state.beneficiary,
        fee,
      );
    } catch (error) {
      if (error instanceof FormFieldError) {
        setRemote((old) => ({ ...old, [error.field]: error.message }));
        setAttempted(true);
        formRef.current
          ?.querySelector<HTMLElement>(`#challenge-${error.field}`)
          ?.focus();
      }
      throw error;
    }
  };
  const errorFor = (field: keyof typeof errors) =>
    attempted || touched[field] ? errors[field] : undefined;
  const id = (action: string) => `${action}-${key(project.address)}`;
  const fieldProps = (field: keyof typeof errors) => ({
    id: `challenge-${field}`,
    name: field,
    "aria-invalid": !!errorFor(field),
    "aria-describedby": `challenge-${field}-hint challenge-${field}-error`,
    onBlur: () => setTouched((old) => ({ ...old, [field]: true })),
  });
  return (
    <form
      id="challenge-panel"
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validate() || sendReason) return;
        void tx.run(
          id("challenge"),
          A.ProjectRegistry,
          REGISTRY,
          "challengeForBeneficiary",
          [project.address, reason, project.state.beneficiary],
          async () => {
            await guard();
            if (
              (await rpc.read(A.OracleIMD, TOKEN, "allowance", [
                data.wallet?.account,
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
        <input {...fieldProps("project")} value={project.address} readOnly />
        <p id="challenge-project-hint" className="hint">
          {project.name}. This challenge is for the project on this page.
        </p>
        <p id="challenge-project-error" className="hint alarm" role="status">
          {errorFor("project")}
        </p>
      </div>
      <div className="field">
        <label htmlFor="challenge-beneficiary">Beneficiary</label>
        <input
          {...fieldProps("beneficiary")}
          value={project.state.beneficiary}
          readOnly
        />
        <p id="challenge-beneficiary-hint" className="hint">
          Review this beneficiary. The transaction pins this address and reverts
          if it changes. <Address value={project.state.beneficiary} copy />
        </p>
        <p
          id="challenge-beneficiary-error"
          className="hint alarm"
          role="status"
        >
          {errorFor("beneficiary")}
        </p>
      </div>
      <div className="field">
        <label htmlFor="challenge-reason">Reason</label>
        <textarea
          {...fieldProps("reason")}
          value={reason}
          rows={4}
          onChange={(event) => {
            setReason(event.target.value);
            setRemote((old) => ({ ...old, reason: undefined }));
          }}
        />
        <p id="challenge-reason-hint" className="hint">
          1–280 characters. {textHint}
        </p>
        <p id="challenge-reason-error" className="hint alarm" role="status">
          {errorFor("reason")}
        </p>
      </div>
      <p className="secondary">
        Fee {units(fee)} + bond {units(bond)} ={" "}
        <strong>{units(cost)} oracle test IMD</strong>. Balance:{" "}
        {data.wallet ? units(balance) : "connect to see"}.
      </p>
      {balance < cost && (
        <div className="action-block">
          <button
            type="button"
            disabled={!!common}
            aria-describedby="mint-challenge-disabled"
            onClick={() =>
              void tx.run(id("mint-challenge"), A.OracleIMD, TOKEN, "mint", [
                data.wallet?.account,
                10n ** 19n,
              ])
            }
          >
            {tx.states[id("mint-challenge")]?.phase === "pending"
              ? "Minting…"
              : "Get 10 test IMD"}
          </button>
          <DisabledReason id="mint-challenge-disabled" reason={common} />
          <TxStatus state={tx.states[id("mint-challenge")]} />
        </div>
      )}
      <div className="action-block">
        <button
          type="button"
          disabled={!!approveReason}
          aria-describedby="approve-challenge-disabled"
          onClick={() => {
            if (validate())
              void tx.run(
                id("approve-challenge"),
                A.OracleIMD,
                TOKEN,
                "approve",
                [A.ProjectRegistry, cost],
                guard,
              );
          }}
        >
          {tx.states[id("approve-challenge")]?.phase === "pending"
            ? "Approving…"
            : "Approve fee + bond"}
        </button>
        <DisabledReason
          id="approve-challenge-disabled"
          reason={approveReason}
        />
        <TxStatus state={tx.states[id("approve-challenge")]} />
      </div>
      <div className="action-block">
        <button
          type="submit"
          disabled={!!sendReason}
          aria-describedby="send-challenge-disabled"
        >
          {tx.states[id("challenge")]?.phase === "pending"
            ? "Challenging…"
            : "Challenge listing"}
        </button>
        <DisabledReason id="send-challenge-disabled" reason={sendReason} />
        <TxStatus state={tx.states[id("challenge")]} />
      </div>
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
      <h3 id={id}>
        <ProjectLink value={p.address} label={p.name} />
      </h3>
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
      <p className="hint">
        {!ready
          ? "Connect on Sepolia and load the contract data to expire this question."
          : tx.busy
            ? "Wait for the current transaction to finish."
            : !p.canExpire
              ? `Expiry is available after ${new Date(expires * 1000).toLocaleString()}, or once the Intake completes the request. Refresh to check.`
              : "This question can be expired now."}
      </p>
      <TxStatus state={tx.states[`expire-${p.address}`]} />
    </article>
  );
}
