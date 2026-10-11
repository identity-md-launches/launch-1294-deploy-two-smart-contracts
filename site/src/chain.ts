import { type Interface } from "ethers";
import {
  ADDRESSES as A,
  CHAIN_ID,
  DEPLOYMENT,
  INTAKE,
  REGISTRY,
  RPC_URLS,
  STACKER,
  TOKEN,
  VAULT,
} from "./config";
import {
  type Application,
  type ChainEvent,
  type Project,
  address,
  applicationArgs,
  applicationErrors,
  checkedText,
  hex,
  key,
  summarize,
} from "./model";

export type RawLog = {
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  logIndex: string;
  transactionHash: string;
  removed?: boolean;
};
export class RpcError extends Error {
  constructor(
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}
export class Rpc {
  private checked = new Set<string>();
  private id = 0;
  constructor(
    public urls = RPC_URLS,
    private fetcher = globalThis.fetch.bind(globalThis),
  ) {}
  private async call(url: string, method: string, params: unknown[]) {
    const response = await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.error)
      throw new RpcError(
        body.error.message || "RPC request failed.",
        body.error.data,
      );
    if (!Object.hasOwn(body, "result"))
      throw new Error("RPC returned no result.");
    return body.result;
  }
  async request<T = any>(method: string, params: unknown[] = []): Promise<T> {
    let last: unknown;
    for (const url of this.urls) {
      try {
        if (!this.checked.has(url)) {
          if (
            BigInt(await this.call(url, "eth_chainId", [])) !== BigInt(CHAIN_ID)
          )
            throw new Error("RPC is on a different chain.");
          this.checked.add(url);
        }
        return await this.call(url, method, params);
      } catch (e) {
        last = e;
      }
    }
    if (last instanceof RpcError) throw last;
    throw new Error(
      `Sepolia data is unavailable. Retry to check all three RPCs. ${last instanceof Error ? last.message : ""}`,
    );
  }
  async read(
    target: string,
    iface: Interface,
    method: string,
    args: unknown[] = [],
    block = "latest",
  ): Promise<any> {
    const data = await this.request<string>("eth_call", [
      { to: target, data: iface.encodeFunctionData(method, args) },
      block,
    ]);
    const result = iface.decodeFunctionResult(method, data);
    return result.length === 1 ? result[0] : result;
  }
  async logs(
    target: string,
    from: number,
    to: number,
    topics: string[] = [],
  ): Promise<RawLog[]> {
    const logs: RawLog[] = [];
    let size = 1000;
    for (let start = from; start <= to;) {
      const end = Math.min(start + size - 1, to);
      try {
        const chunk = await this.request<RawLog[]>("eth_getLogs", [
          { address: target, fromBlock: hex(start), toBlock: hex(end), topics },
        ]);
        if (!Array.isArray(chunk))
          throw new Error("RPC returned invalid logs.");
        logs.push(...chunk);
        start = end + 1;
      } catch (e) {
        // A smaller range can resolve provider result limits, never mask a missing block.
        if (size <= 1 || !(e instanceof RpcError)) throw e;
        size = Math.max(1, Math.floor(size / 2));
      }
    }
    return logs;
  }
}
export const rpc = new Rpc();
export function decodeLogs(logs: RawLog[], iface: Interface): ChainEvent[] {
  const seen = new Set<string>();
  const decoded: ChainEvent[] = [];
  for (const log of logs) {
    const id = `${log.blockHash}:${log.transactionHash}:${log.logIndex}`;
    if (log.removed || seen.has(id)) continue;
    seen.add(id);
    const event = iface.parseLog(log);
    if (event)
      decoded.push({
        name: event.name,
        args: event.args,
        block: Number(BigInt(log.blockNumber)),
        index: Number(BigInt(log.logIndex)),
        tx: log.transactionHash,
      });
  }
  return decoded.sort((a, b) => a.block - b.block || a.index - b.index);
}
export async function verifyDeployment(client = rpc) {
  for (const contract of DEPLOYMENT.contracts) {
    const [code, prior, receipt, current] = await Promise.all([
      client.request<string>("eth_getCode", [
        contract.address,
        hex(contract.blockNumber),
      ]),
      client.request<string>("eth_getCode", [
        contract.address,
        hex(contract.blockNumber - 1),
      ]),
      client.request("eth_getTransactionReceipt", [contract.txHash]),
      client.request<string>("eth_getCode", [contract.address, "latest"]),
    ]);
    if (
      code === "0x" ||
      current === "0x" ||
      prior !== "0x" ||
      !receipt ||
      BigInt(receipt.status) !== 1n ||
      Number(BigInt(receipt.blockNumber)) !== contract.blockNumber
    )
      throw new Error(
        `Could not verify the ${contract.name} deployment. Transactions are disabled.`,
      );
  }
  const wires: [string, Interface, string, string][] = [
    [A.Stacker, STACKER, "IMD", A.TestIMD],
    [A.Stacker, STACKER, "SIMD", A.TestSIMD],
    [A.ProjectRegistry, REGISTRY, "stacker", A.Stacker],
    [A.ProjectRegistry, REGISTRY, "intake", A.Intake],
    [A.ProjectRegistry, REGISTRY, "oracleAsset", A.OracleIMD],
    [A.TestSIMD, VAULT, "asset", A.TestIMD],
  ];
  await Promise.all(
    wires.map(async ([target, iface, method, expected]) => {
      if (key(await client.read(target, iface, method)) !== key(expected))
        throw new Error(
          `The ${method} contract connection is unexpected. Transactions are disabled.`,
        );
    }),
  );
}
export type ProjectState = {
  ask: bigint;
  listed: boolean;
  rateBps: bigint;
  askedAt: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  beneficiary: string;
  challengeOpenAt: bigint;
  asker: string;
  intakeId: string;
};
export type ProjectView = Project & {
  state: ProjectState;
  completed: boolean;
  canExpire: boolean;
};
export type WalletData = {
  account: string;
  balance: bigint;
  oracleBalance: bigint;
  held: bigint;
  value: bigint;
  nextFaucet: bigint;
  stakeAllowance: bigint;
  oracleAllowance: bigint;
  projectValues: Map<string, bigint>;
};
export const canExpire = (
  state: Pick<ProjectState, "ask" | "askedAt">,
  timestamp: bigint,
  expiry: bigint,
  completed: boolean,
) => state.ask !== 0n && (timestamp > state.askedAt + expiry || completed);
export type Snapshot = Awaited<ReturnType<DataLoader["load"]>>;
export class DataLoader {
  private verified = false;
  private cache?: {
    block: number;
    hash: string;
    stacks: RawLog[];
    registry: RawLog[];
    eventDates: Map<number, number>;
  };
  constructor(private client = rpc) {}
  async load(account?: string) {
    const c = this.client;
    if (!this.verified) {
      await verifyDeployment(c);
      this.verified = true;
    }
    const head = await c.request("eth_getBlockByNumber", ["latest", false]);
    if (!head)
      throw new Error("Sepolia has not returned a current block. Retry.");
    const block = Number(BigInt(head.number)),
      timestamp = Number(BigInt(head.timestamp)),
      tag = head.number;
    const start = DEPLOYMENT.contracts[0].blockNumber;
    let cache = this.cache;
    if (cache) {
      const previous = await c.request("eth_getBlockByNumber", [
        hex(cache.block),
        false,
      ]);
      if (block < cache.block || previous?.hash !== cache.hash)
        cache = undefined;
    }
    const from = cache ? Math.max(start, cache.block - 12) : start;
    const r = (
      target: string,
      iface: Interface,
      method: string,
      args: unknown[] = [],
    ) => c.read(target, iface, method, args, tag);
    const [
      newStacks,
      newRegistry,
      fee,
      bond,
      cooldown,
      expiry,
      paused,
      totalAssets,
      totalStacked,
      decimals,
    ] = await Promise.all([
      c.logs(A.Stacker, from, block, [STACKER.getEvent("Stacked")!.topicHash]),
      c.logs(A.ProjectRegistry, from, block),
      r(A.ProjectRegistry, REGISTRY, "ORACLE_FEE"),
      r(A.ProjectRegistry, REGISTRY, "challengeBond"),
      r(A.ProjectRegistry, REGISTRY, "challengeCooldown"),
      r(A.ProjectRegistry, REGISTRY, "PENDING_EXPIRY"),
      r(A.TestSIMD, VAULT, "paused"),
      r(A.TestSIMD, VAULT, "totalAssets"),
      r(A.Stacker, STACKER, "totalStacked"),
      r(A.TestSIMD, VAULT, "decimals"),
    ]);
    const stacks = [
      ...(cache?.stacks.filter((l) => Number(BigInt(l.blockNumber)) < from) ??
        []),
      ...newStacks,
    ];
    const registry = [
      ...(cache?.registry.filter((l) => Number(BigInt(l.blockNumber)) < from) ??
        []),
      ...newRegistry,
    ];
    const events = decodeLogs(registry, REGISTRY),
      summary = summarize(decodeLogs(stacks, STACKER), events);
    const eventDates = new Map(
      [...(cache?.eventDates ?? [])].filter(([height]) => height < from),
    );
    const missingDates = [
      ...new Set(events.map((event) => event.block)),
    ].filter((height) => !eventDates.has(height));
    for (let i = 0; i < missingDates.length; i += 6) {
      await Promise.all(
        missingDates.slice(i, i + 6).map(async (height) => {
          const eventBlock =
            height === block
              ? head
              : await c.request("eth_getBlockByNumber", [hex(height), false]);
          if (!eventBlock)
            throw new Error(
              "A registry event date is unavailable. Refresh to retry.",
            );
          eventDates.set(height, Number(BigInt(eventBlock.timestamp)));
        }),
      );
    }
    const projects: ProjectView[] = [];
    // Bound concurrency as the registry grows, to avoid flooding public RPCs.
    const entries = [...summary.projects.values()];
    for (let i = 0; i < entries.length; i += 6) {
      projects.push(
        ...(await Promise.all(
          entries.slice(i, i + 6).map(async (p) => {
            const state = (await r(A.ProjectRegistry, REGISTRY, "projectOf", [
              p.address,
            ])) as ProjectState;
            const completed =
              state.ask !== 0n
                ? (await r(A.Intake, INTAKE, "requests", [state.intakeId]))
                    .completed
                : false;
            return {
              ...p,
              state,
              completed,
              canExpire: canExpire(state, BigInt(timestamp), expiry, completed),
            };
          }),
        )),
      );
    }
    let wallet: WalletData | undefined;
    if (account) {
      const trader = summary.traders.get(key(account));
      const [
        balance,
        oracleBalance,
        held,
        value,
        nextFaucet,
        stakeAllowance,
        oracleAllowance,
        values,
      ] = await Promise.all([
        r(A.TestIMD, TOKEN, "balanceOf", [account]),
        r(A.OracleIMD, TOKEN, "balanceOf", [account]),
        r(A.TestSIMD, VAULT, "balanceOf", [account]),
        r(A.TestSIMD, VAULT, "convertToAssets", [trader?.shares ?? 0n]),
        r(A.TestIMD, TOKEN, "nextFaucetAt", [account]),
        r(A.TestIMD, TOKEN, "allowance", [account, A.Stacker]),
        r(A.OracleIMD, TOKEN, "allowance", [account, A.ProjectRegistry]),
        Promise.all(
          [...(trader?.projects.values() ?? [])].map(
            async (p) =>
              [
                key(p.address),
                await r(A.TestSIMD, VAULT, "convertToAssets", [p.shares]),
              ] as const,
          ),
        ),
      ]);
      wallet = {
        account,
        balance,
        oracleBalance,
        held,
        value,
        nextFaucet,
        stakeAllowance,
        oracleAllowance,
        projectValues: new Map(values),
      };
    }
    // Only publish a complete, consistent snapshot; never display partial leaderboard history.
    const end = await c.request("eth_getBlockByNumber", [tag, false]);
    if (end?.hash !== head.hash)
      throw new Error(
        "The chain changed during this refresh. Retry for a consistent block.",
      );
    this.cache = { block, hash: head.hash, stacks, registry, eventDates };
    return {
      block,
      timestamp,
      readAt: Date.now(),
      summary,
      events,
      eventDates,
      projects,
      fee: fee as bigint,
      bond: bond as bigint,
      cooldown: cooldown as bigint,
      expiry: expiry as bigint,
      paused: paused as boolean,
      totalAssets: totalAssets as bigint,
      totalStacked: totalStacked as bigint,
      decimals: Number(decimals),
      wallet,
    };
  }
}
export class FormFieldError extends Error {
  constructor(
    public field: "project" | "reason" | "beneficiary",
    message: string,
  ) {
    super(message);
  }
}
export async function checkProject(value: string, client = rpc) {
  let project: string;
  try {
    project = address(value);
  } catch (error) {
    throw new FormFieldError("project", (error as Error).message);
  }
  const [code, state] = await Promise.all([
    client.request<string>("eth_getCode", [project, "latest"]),
    client.read(A.ProjectRegistry, REGISTRY, "projectOf", [project]),
  ]);
  if (code === "0x")
    throw new FormFieldError(
      "project",
      "Project has no contract code. Enter the trading contract address.",
    );
  return state as ProjectState;
}
export async function checkApplicationProject(project: string, client = rpc) {
  const state = await checkProject(project, client);
  if (state.ask !== 0n)
    throw new FormFieldError(
      "project",
      "This project already has an open question. Wait for its outcome.",
    );
  if (state.listed)
    throw new FormFieldError(
      "project",
      "Already listed. Open its project page to review or challenge the listing.",
    );
}
export async function checkApplication(form: Application, client = rpc) {
  const errors = applicationErrors(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  await checkApplicationProject(form.project, client);
  return (await client.read(
    A.ProjectRegistry,
    REGISTRY,
    "applyQuestion",
    applicationArgs(form),
  )) as string;
}
export async function checkChallenge(
  project: string,
  reason: string,
  beneficiary: string,
  fee: bigint,
  client = rpc,
) {
  try {
    checkedText(reason, 1, 280, "Reason");
  } catch (error) {
    throw new FormFieldError("reason", (error as Error).message);
  }
  try {
    address(beneficiary);
  } catch (error) {
    throw new FormFieldError("beneficiary", (error as Error).message);
  }
  const [state, liveFee, head] = await Promise.all([
    client.read(A.ProjectRegistry, REGISTRY, "projectOf", [project]),
    client.read(A.ProjectRegistry, REGISTRY, "ORACLE_FEE"),
    client.request("eth_getBlockByNumber", ["latest", false]),
  ]);
  if (!state.listed)
    throw new FormFieldError(
      "project",
      "This project is no longer listed. Refresh to see its outcome.",
    );
  if (state.ask !== 0n)
    throw new FormFieldError(
      "project",
      "This project already has an open question.",
    );
  if (BigInt(head.timestamp) < state.challengeOpenAt)
    throw new FormFieldError(
      "project",
      `The listing cooldown has not ended. Challenge opens ${new Date(Number(state.challengeOpenAt) * 1000).toLocaleString()}.`,
    );
  if (key(state.beneficiary) !== key(beneficiary))
    throw new FormFieldError(
      "beneficiary",
      "The beneficiary changed. Refresh and review it before challenging.",
    );
  if (liveFee === 0n || liveFee !== fee)
    throw new Error(
      "The oracle fee changed or is unavailable. Refresh before approving.",
    );
}
