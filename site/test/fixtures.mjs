import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { Interface, keccak256, toUtf8Bytes, ZeroHash } from "ethers";

// Synthetic RPC responses exercise listed-project UI states that the live registry
// does not currently contain. They do not change a contract or claim panel settlement.
export async function checkRegistryFixtures({
  browser,
  base,
  registry,
  stacker,
  registryInterface: iface,
  rpcPattern,
  report,
  note,
  matrix,
}) {
  const liveRpc = async (method, params = []) => {
    const res = await fetch("https://rpc.sepolia.ethpandaops.io", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  };
  const head = await liveRpc("eth_getBlockByNumber", ["latest", false]);
  const block = Number(BigInt(head.number)),
    time = Number(BigInt(head.timestamp));
  const requestId = keccak256(toUtf8Bytes("synthetic browser history fixture"));
  const longName = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV";
  const history = [
    [
      "Applied",
      [
        stacker,
        registry,
        requestId,
        50,
        registry,
        longName,
        `https://sepolia.etherscan.io/address/${stacker}`,
      ],
    ],
    ["Listed", [stacker, 50, registry, block - 11, requestId]],
    ["Challenged", [stacker, registry, requestId, "Fee guard changed."]],
    ["Defended", [stacker, 5n * 10n ** 18n, requestId]],
    ["BeneficiarySet", [stacker, registry]],
    ["Challenged", [stacker, registry, requestId, "Cashback stopped."]],
    ["Delisted", [stacker, block - 6, requestId]],
    [
      "Applied",
      [
        stacker,
        registry,
        requestId,
        50,
        registry,
        longName,
        `https://sepolia.etherscan.io/address/${stacker}`,
      ],
    ],
    ["Rejected", [stacker, requestId]],
    [
      "Applied",
      [
        stacker,
        registry,
        requestId,
        50,
        registry,
        longName,
        `https://sepolia.etherscan.io/address/${stacker}`,
      ],
    ],
    ["AskCleared", [stacker, requestId, 1, 0, ZeroHash]],
    ["Listed", [stacker, 50, registry, block - 1, requestId]],
  ];
  const rawLogs = history.map(([name, args], index) => ({
    ...iface.encodeEventLog(iface.getEvent(name), args),
    address: registry,
    blockNumber: `0x${(block - 12 + index).toString(16)}`,
    blockHash: head.hash,
    transactionHash: requestId,
    logIndex: `0x${index.toString(16)}`,
    removed: false,
  }));
  const intake = new Interface([
    "function requests(bytes32) view returns (address payer,address callbackTarget,bytes4 callbackSelector,bool completed)",
  ]);
  let state = "cooldown";
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error") report.errors.push(entry.text());
  });
  await page.route(rpcPattern, async (route) => {
    const payload = route.request().postDataJSON(),
      { method, params } = payload;
    let result;
    if (
      method === "eth_getLogs" &&
      params[0].address.toLowerCase() === registry.toLowerCase()
    ) {
      result = rawLogs.filter(
        (log) =>
          BigInt(log.blockNumber) >= BigInt(params[0].fromBlock) &&
          BigInt(log.blockNumber) <= BigInt(params[0].toBlock),
      );
    } else if (
      method === "eth_call" &&
      params[0].to.toLowerCase() === registry.toLowerCase() &&
      params[0].data.startsWith(iface.getFunction("projectOf").selector)
    ) {
      const beneficiary =
        state === "zero-beneficiary" ? "0x" + "0".repeat(40) : registry;
      result = iface.encodeFunctionResult("projectOf", [
        [
          state === "open" ? 2 : 0,
          true,
          50,
          time - 60,
          block - 1,
          0,
          beneficiary,
          state === "cooldown" ? time + 3600 : time - 1,
          registry,
          requestId,
        ],
      ]);
    } else if (
      method === "eth_call" &&
      params[0].data.startsWith(intake.getFunction("requests").selector)
    ) {
      result = intake.encodeFunctionResult("requests", [
        registry,
        registry,
        "0x00000000",
        false,
      ]);
    } else result = await liveRpc(method, params);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }),
    });
  });
  const refresh = async () => {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
  };
  await page.goto(base + `#/projects/${stacker}`);
  await expect(page.locator("#challenge-project")).toBeVisible({
    timeout: 60000,
  });
  for (const name of [
    "Applied",
    "Listed",
    "Rejected",
    "Challenged",
    "Defended",
    "Delisted",
    "AskCleared",
    "BeneficiarySet",
  ])
    await expect(
      page
        .locator("#project-history strong")
        .filter({ hasText: new RegExp(`^${name}$`) })
        .first(),
    ).toBeVisible();
  assert.equal(await page.locator("#project-history time").count(), 12);
  await page.locator("#challenge-project").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#challenge-project-error")).toContainText(
    "cooldown is not over",
  );
  await expect(page.locator("#challenge-project-error")).toContainText(
    "Challenge opens",
  );
  await expect(page.locator("#challenge-project")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#send-challenge-disabled")).toContainText(
    "cooldown is not over",
  );
  const cases = [
    ["", /too short/],
    ["x".repeat(281), /too long/],
    ['a"b', /double quote/],
    ["a\\b", /backslash/],
    ["[a]", /square bracket/],
    ["café", /non-ASCII/],
    ["a\nb", /non-printable ASCII/],
  ];
  for (const [value, expected] of cases) {
    const field = page.locator("#challenge-reason");
    await field.fill(value);
    await field.focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#challenge-reason-error")).toHaveText(expected);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    assert.match(
      await field.getAttribute("aria-describedby"),
      /challenge-reason-error/,
    );
  }
  await page.locator("#challenge-reason").fill('A "quoted" reason');
  await page.locator("#challenge-reason").focus();
  await page.screenshot({
      path: resolve(
        process.env.EVIDENCE_DIR || "/tmp/imd-acc-routes-evidence",
        "challenge-errors-390-light.png",
      ),
    });
  await page.locator("#challenge-reason").fill("Check the current fee guard.");
  await expect(page.locator("#challenge-reason")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  state = "open";
  await refresh();
  await expect(page.locator("#challenge-project-error")).toContainText(
    "This project already has an open question",
  );
  await expect(page.locator("#send-challenge-disabled")).toContainText(
    "This project already has an open question",
  );
  state = "zero-beneficiary";
  await refresh();
  await page.locator("#challenge-beneficiary").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#challenge-beneficiary-error")).toContainText(
    "must not be zero",
  );
  state = "listed";
  await refresh();
  await page.evaluate(() => {
    location.hash = "#/apply";
  });
  await page.locator("#apply-project").fill(stacker);
  await page.keyboard.press("Tab");
  await expect(page.locator("#apply-project-error")).toContainText(
    "Already listed",
    { timeout: 30000 },
  );
  await expect(page.locator("#send-apply-disabled")).toContainText(
    "Already listed",
  );
  await page.evaluate((address) => {
    location.hash = `#/projects/${address}`;
  }, stacker);
  await expect(page.locator("#challenge-reason")).toBeVisible();
  // Navigate once before matrix so its first route is an actual page change.
  await page.evaluate(() => {
    location.hash = "#/projects";
  });
  await expect(page.locator("#page-heading")).toHaveText("Projects");
  await matrix(page, "fixture", [`#/projects/${stacker}`]);
  note(
    "Synthetic registry fixtures: all 8 history event kinds and 12 dates; Challenge reason blur errors, cooldown date, open question and zero beneficiary; Apply Already listed; listed detail layout/axe at all 6 width/theme combinations.",
  );
  note(
    "Fixture responses are UI tests only. No signed oracle outcome or successful challenge transaction is claimed.",
  );
  await context.close();
}
