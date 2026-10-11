import test from "node:test";
import assert from "node:assert/strict";
import { Result } from "ethers";
import { ADDRESSES as A, CHAIN_ID, REGISTRY, STACKER } from "../src/config";
import {
  applicationErrors,
  amount,
  checkedText,
  hex,
  key,
  summarize,
  units,
  type ChainEvent,
} from "../src/model";
import {
  Rpc,
  checkApplication,
  checkChallenge,
  canExpire,
  decodeLogs,
  verifyDeployment,
  type RawLog,
} from "../src/chain";
import { explainError } from "../src/wallet";

const project = A.Stacker,
  trader = A.TestIMD,
  direct = A.Intake;
const event = (
  name: string,
  block: number,
  args: Record<string, unknown>,
): ChainEvent => {
  const values = { project, ...args };
  return {
    name,
    block,
    index: 0,
    tx: "test-event",
    args: Result.fromItems(Object.values(values), Object.keys(values)),
  };
};
const stack = (block: number, imd: number, p = project) =>
  event("Stacked", block, {
    project: p,
    trader,
    imd: BigInt(imd) * 10n ** 18n,
    shares: BigInt(imd) * 10n ** 18n,
  });
test("points honor inclusive starts, exclusive ends, relisting and direct stacks", () => {
  const history = [
    event("Applied", 5, { name: "Venue", sourceUrl: "https://example.test" }),
    event("Listed", 10, { fromBlock: 10n }),
    event("Challenged", 15, {}),
    event("Delisted", 20, { toBlock: 20n }),
    event("Listed", 30, { fromBlock: 30n }),
  ];
  const result = summarize(
    [
      stack(9, 1),
      stack(10, 2),
      stack(19, 3),
      stack(20, 4),
      stack(29, 5),
      stack(30, 6),
      stack(31, 100, direct),
    ],
    history,
  );
  assert.deepEqual(
    result.credits.map((c) => c.eligible),
    [false, true, true, false, false, true, false],
  );
  assert.equal(result.traders.get(key(trader))!.cashback, 121n * 10n ** 18n);
  assert.equal(result.traders.get(key(trader))!.points, 11n * 10n ** 18n);
  assert.equal(result.topProjects[0].traders.size, 1);
  assert.equal(result.topProjects[0].points, 11n * 10n ** 18n);
});
test("rejection earns no points; challenged and defended listings remain eligible", () => {
  assert.equal(
    summarize([stack(10, 1)], [event("Rejected", 9, {})]).topTraders.length,
    0,
  );
  const result = summarize(
    [stack(12, 1)],
    [
      event("Listed", 10, { fromBlock: 10n }),
      event("Challenged", 11, {}),
      event("Defended", 13, {}),
    ],
  );
  assert.equal(result.topTraders[0].points, 10n ** 18n);
  assert.equal(result.projects.get(key(project))!.outcome, "Listed");
});
test("decode logs keeps canonical order, removes duplicates and removed entries", () => {
  const encoded = STACKER.encodeEventLog(STACKER.getEvent("Stacked")!, [
    project,
    trader,
    10n,
    9n,
  ]);
  const base: RawLog = {
    ...encoded,
    blockHash: "block-a",
    transactionHash: "transaction-a",
    blockNumber: "0xa",
    logIndex: "0x2",
  };
  const result = decodeLogs(
    [
      { ...base, logIndex: "0x3" },
      base,
      base,
      { ...base, logIndex: "0x1", removed: true },
    ],
    STACKER,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((e) => e.index),
    [2, 3],
  );
  assert.equal(result[0].args.shares, 9n);
});
test("amounts stay exact beyond Number precision, format four decimal places", () => {
  assert.equal(
    amount("123456789012345678.000000000000000001"),
    123456789012345678000000000000000001n,
  );
  assert.equal(units(1n * 10n ** 18n), "1.0000");
  assert.equal(units(-123456789n, 6), "-123.4567");
  for (const input of [
    "0",
    "-1",
    "1e18",
    "00.3",
    "NaN",
    "1.1234567890123456789",
  ])
    assert.throws(() => amount(input));
});
test("application fields implement the contract byte and character checks", () => {
  const form = {
    project,
    beneficiary: trader,
    name: "Venue",
    url: "https://example.test/source",
    rate: "50",
  };
  assert.deepEqual(applicationErrors(form), {});
  for (const name of ["", "x".repeat(49), "café", 'a"b', "a\\b", "[a]", "a\nb"])
    assert.ok(applicationErrors({ ...form, name }).name);
  for (const rate of ["24", "101", "25.5", "1e2"])
    assert.ok(applicationErrors({ ...form, rate }).rate);
  assert.ok(applicationErrors({ ...form, url: "http://example.test" }).url);
  assert.ok(
    applicationErrors({ ...form, beneficiary: "0x" + "0".repeat(40) })
      .beneficiary,
  );
  assert.equal(checkedText("x".repeat(280), 1, 280, "Reason").length, 280);
  assert.throws(() => checkedText("x".repeat(281), 1, 280, "Reason"));
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
test("RPC checks fallback chains in order and adapts log chunks without gaps", async () => {
  const calls: string[] = [],
    ranges: [number, number][] = [];
  const fetcher: typeof fetch = async (url, options) => {
    const { method, params } = JSON.parse(String(options?.body));
    calls.push(`${url}:${method}`);
    if (method === "eth_chainId")
      return response({ result: url === "wrong" ? "0x1" : hex(CHAIN_ID) });
    const start = Number(BigInt(params[0].fromBlock)),
      end = Number(BigInt(params[0].toBlock));
    if (end - start > 200)
      return response({ error: { message: "range too large" } });
    ranges.push([start, end]);
    return response({ result: [] });
  };
  await new Rpc(["wrong", "good"], fetcher).logs(project, 99, 1341);
  assert.equal(ranges[0][0], 99);
  assert.equal(ranges.at(-1)![1], 1341);
  for (let i = 1; i < ranges.length; i++)
    assert.equal(ranges[i][0], ranges[i - 1][1] + 1);
  assert.ok(
    !calls.some((c) => c.startsWith("wrong:") && !c.endsWith("eth_chainId")),
  );
});
test("missing history fails visibly and never returns partial results", async () => {
  const client = new Rpc(["bad"], async (_, options) =>
    JSON.parse(String(options?.body)).method === "eth_chainId"
      ? response({ result: hex(CHAIN_ID) })
      : response({ error: { message: "history unavailable" } }),
  );
  await assert.rejects(client.logs(project, 10, 12), /history unavailable/);
});
test("preflight refuses EOAs, listed projects and open questions", async () => {
  const form = {
    project,
    beneficiary: trader,
    name: "Venue",
    url: "https://example.test/source",
    rate: "50",
  };
  let code = "0x6000",
    ask = 0n,
    listed = false;
  const client = {
    request: async () => code,
    read: async (_: string, __: unknown, method: string) =>
      method === "projectOf" ? { ask, listed } : "Exact question from contract",
  } as unknown as Rpc;
  assert.equal(
    await checkApplication(form, client),
    "Exact question from contract",
  );
  code = "0x";
  await assert.rejects(checkApplication(form, client), /no contract code/);
  code = "0x6000";
  ask = 1n;
  await assert.rejects(checkApplication(form, client), /open question/);
  ask = 0n;
  listed = true;
  await assert.rejects(checkApplication(form, client), /[Aa]lready listed/);
});
test("human transaction errors explain cancellation, beneficiary race and short allowance", () => {
  assert.match(explainError({ code: 4001 }), /cancelled/);
  assert.match(
    explainError({
      data: REGISTRY.encodeErrorResult("BeneficiaryChanged", [project, trader]),
    }),
    /beneficiary changed/,
  );
  assert.match(explainError({ code: "INSUFFICIENT_FUNDS" }), /Sepolia ETH/);
});
test("deployment verification rejects a missing deployment before enabling transactions", async () => {
  const client = {
    request: async (method: string) => (method === "eth_getCode" ? "0x" : null),
  } as unknown as Rpc;
  await assert.rejects(verifyDeployment(client), /Transactions are disabled/);
});
test("challenge preflight pins beneficiary, fee and cooldown at send time", async () => {
  const state = {
    listed: true,
    ask: 0n,
    challengeOpenAt: 100n,
    beneficiary: trader,
  };
  let fee = 5n,
    timestamp = 100n;
  const client = {
    request: async () => ({ timestamp: hex(timestamp) }),
    read: async (_: string, __: unknown, method: string) =>
      method === "projectOf" ? state : fee,
  } as unknown as Rpc;
  await checkChallenge(project, "The fee guard changed.", trader, fee, client);
  timestamp = 99n;
  await assert.rejects(
    checkChallenge(project, "Reason", trader, fee, client),
    /cooldown/,
  );
  timestamp = 100n;
  state.ask = 2n;
  await assert.rejects(
    checkChallenge(project, "Reason", trader, fee, client),
    /open question/,
  );
  state.ask = 0n;
  state.listed = false;
  await assert.rejects(
    checkChallenge(project, "Reason", trader, fee, client),
    /no longer listed/,
  );
  state.listed = true;
  await assert.rejects(
    checkChallenge(project, "Reason", direct, fee, client),
    /beneficiary changed/,
  );
  fee = 6n;
  await assert.rejects(
    checkChallenge(project, "Reason", trader, 5n, client),
    /fee changed/,
  );
  fee = 0n;
  await assert.rejects(
    checkChallenge(project, "Reason", trader, 0n, client),
    /unavailable/,
  );
});
test("expiry is strictly older than the threshold or completed in Intake", () => {
  const state = { ask: 1n, askedAt: 100n };
  assert.equal(canExpire(state, 86500n, 86400n, false), false);
  assert.equal(canExpire(state, 86501n, 86400n, false), true);
  assert.equal(canExpire(state, 101n, 86400n, true), true);
  assert.equal(canExpire({ ...state, ask: 0n }, 86501n, 86400n, true), false);
});

test("field validation names the exact character or length failure", () => {
  const cases: [string, RegExp][] = [
    ['a"b', /double quote/],
    ["a\\b", /backslash/],
    ["[a]", /square bracket/],
    ["café", /non-ASCII.*U\+00E9/],
    ["a\nb", /non-printable ASCII.*U\+000A/],
    ["", /too short/],
    ["x".repeat(281), /too long/],
  ];
  for (const [value, message] of cases)
    assert.throws(() => checkedText(value, 1, 280, "Reason"), message);
});

test("hash routes distinguish project addresses, individual docs and unknown paths", async () => {
  const { parseRoute, currentPage } = await import("../src/routes");
  assert.equal(parseRoute("").page, "home");
  assert.equal(parseRoute("#/stack").page, "stack");
  assert.equal(parseRoute("#/docs").page, "docs");
  for (const slug of [
    "what",
    "how",
    "addresses",
    "integrate",
    "listing",
    "points",
    "agents",
  ]) {
    const route = parseRoute(`#/docs/${slug}`);
    assert.ok(route.page === "docs" && route.section === slug);
    assert.ok(currentPage(route, "#/docs/what"));
  }
  const route = parseRoute(`#/projects/${project}`);
  assert.equal(route.page, "project");
  assert.ok(currentPage(route, "#/projects"));
  for (const invalid of [
    "#/missing",
    "#/docs/nope",
    "#/docs/what/more",
    "#/projects/not-an-address",
    `#/projects/${project}/extra`,
  ])
    assert.equal(parseRoute(invalid).page, "not-found");
});

test("application code and registry errors are attached to the project field", async () => {
  const { checkApplicationProject, FormFieldError } =
    await import("../src/chain");
  let code = "0x",
    ask = 0n,
    listed = false;
  const client = {
    request: async () => code,
    read: async () => ({ ask, listed }),
  } as unknown as Rpc;
  for (const message of [
    /no contract code/,
    /open question/,
    /Already listed/,
  ]) {
    await assert.rejects(
      checkApplicationProject(project, client),
      (error: unknown) =>
        error instanceof FormFieldError &&
        error.field === "project" &&
        message.test(error.message),
    );
    if (code === "0x") {
      code = "0x6000";
      ask = 1n;
    } else {
      ask = 0n;
      listed = true;
    }
  }
});

test("listing cooldown keeps its exact opening time instead of becoming a faucet error", async () => {
  const client = {
    read: async (_: unknown, __: unknown, method: string) =>
      method === "projectOf"
        ? { listed: true, ask: 0n, challengeOpenAt: 100n, beneficiary: trader }
        : 5n,
    request: async () => ({ timestamp: "0x63" }),
  } as unknown as Rpc;
  try {
    await checkChallenge(project, "Reason", trader, 5n, client);
    assert.fail("must reject cooldown");
  } catch (error) {
    const message = explainError(error);
    assert.match(message, /listing cooldown/);
    assert.match(message, /Challenge opens/);
    assert.doesNotMatch(message, /faucet/);
  }
});
