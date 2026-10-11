import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Interface, Wallet } from "ethers";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:4173/preview/";
const output = process.env.EVIDENCE_DIR || "/tmp/imd-acc-browser-evidence";
const fork = process.env.FORK_RPC;
const mode = process.env.CHECK_MODE || "all";
if (mode === "fork" && !fork)
  throw new Error("CHECK_MODE=fork requires FORK_RPC.");
if (
  fork &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(fork).hostname)
) {
  throw new Error("FORK_RPC must point to a local Anvil fork.");
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});
const deployment = JSON.parse(
  await readFile(new URL("../src/deployment.json", import.meta.url), "utf8"),
);
const stacker = deployment.contracts.find((c) => c.name === "Stacker").address;
const registry = deployment.contracts.find(
  (c) => c.name === "ProjectRegistry",
).address;
const registryInterface = new Interface(
  JSON.parse(
    await readFile(
      new URL("../src/abi/ProjectRegistry.json", import.meta.url),
      "utf8",
    ),
  ),
);
await mkdir(output, { recursive: true });
const report = {
  mode,
  checkedAt: new Date().toISOString(),
  live: [],
  fork: [],
  errors: [],
  accessibility: [],
  measurements: [],
};
const rpc = async (method, params = []) => {
  const response = await fetch(fork, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
};
const until = async (page, predicate, label, timeout = 60000) => {
  await page.waitForFunction(predicate, undefined, { timeout });
  report.fork.push(label);
  console.log(label);
};
try {
  if (mode !== "fork") {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByText(/Data at block/).waitFor({ timeout: 90000 });
    report.live.push(await page.locator(".data-line").innerText());
    assert.equal(
      await page
        .locator(".alarm")
        .filter({ hasText: /Sepolia data is unavailable/ })
        .count(),
      0,
    );
    for (const width of [360, 390, 768, 1280])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page.locator(".theme-button").click();
        for (const route of ["#/", "#/docs"]) {
          await page.goto(base + route, { waitUntil: "networkidle" });
          await page
            .getByText(/Data at block/)
            .first()
            .waitFor({
              state: route === "#/" ? "visible" : "attached",
              timeout: 60000,
            });
          await page.evaluate(() => document.fonts.ready);
          const result = await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            theme: document.documentElement.dataset.theme,
            headerHeight: document
              .querySelector(".topbar-inner")
              .getBoundingClientRect().height,
            heading: getComputedStyle(
              document.querySelector("main:not([hidden]) h1"),
            ).fontSize,
            fonts: [...document.fonts].map((f) => `${f.weight}:${f.status}`),
            connect: document
              .querySelector(".intro-stack button")
              .getBoundingClientRect().bottom,
          }));
          assert.equal(
            result.scroll,
            width,
            `overflow: ${width} ${theme} ${route}`,
          );
          assert.ok(result.fonts.every((f) => f.endsWith("loaded")));
          if (route === "#/" && width === 390)
            assert.ok(
              result.connect < 844,
              "primary action above first screen",
            );
          if (width === 360)
            assert.ok(result.headerHeight < 60, "one-row topbar");
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          report.accessibility.push({
            width,
            theme,
            route,
            violations: axe.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          });
          assert.equal(
            axe.violations.length,
            0,
            JSON.stringify(
              axe.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
            ),
          );
          report.measurements.push({ route, ...result });
          if (width !== 390)
            await page.screenshot({
              path: resolve(
                output,
                `${route === "#/" ? "app" : "docs"}-${width}-${theme}.png`,
              ),
              type: "png",
            });
        }
      }
    await page.goto(base + "#/docs/for-agents");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "for-agents",
    );
    const text = await page.locator("#for-agents pre").innerText();
    const download = await context.request.get(base + "llms.txt");
    assert.equal(download.status(), 200);
    assert.equal((await download.text()).trim(), text.trim());
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy agent guide", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).trim(),
      text.trim(),
    );
    report.live.push("Docs anchor, llms.txt and copy agent guide passed.");
    await page.goto(base + "#/");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.reload();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".connect-button")
        .evaluate((e) => getComputedStyle(e).transitionDuration),
      "0s",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.className),
      "skip-link",
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.activeElement.id === "stack-title",
    );
    report.live.push(
      "Remembered theme, reduced motion and keyboard skip link exercised.",
    );
    await page.getByRole("tab", { name: "Apply", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "Challenge", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Home");
    assert.equal(
      await page
        .getByRole("tab", { name: "Apply", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    report.live.push("Keyboard tab navigation passed.");
    await page.route(
      /https:\/\/(rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz|ethereum-sepolia-rpc\.publicnode\.com)\/?$/,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: {
              code: -32000,
              message: "Read service unavailable for test",
            },
          }),
        }),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Retry data", exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Claim faucet", exact: true })
        .isDisabled(),
      true,
    );
    await page.unrouteAll();
    await page
      .getByRole("button", { name: "Retry data", exact: true })
      .first()
      .click();
    await page.getByText(/Data at block/).waitFor({ timeout: 90000 });
    report.live.push(
      "Read-error state disables writes, and Retry recovers live data.",
    );
    assert.equal(report.errors.length, 0, report.errors.join("\n"));
    await context.close();
  }
  if (fork && mode !== "live") {
    // All writes below go to a local fork. No private key or live-chain signer.
    const tester = Wallet.createRandom().address;
    await rpc("anvil_impersonateAccount", [tester]);
    await rpc("anvil_setBalance", [tester, "0x56bc75e2d63100000"]);
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 900 },
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await p.route(
      /https:\/\/(rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz|ethereum-sepolia-rpc\.publicnode\.com)\/?$/,
      async (route) => {
        const request = route.request();
        const response = await fetch(fork, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: request.postData(),
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: await response.text(),
        });
      },
    );
    await p.addInitScript(
      ({ fork, tester }) => {
        const listeners = new Map();
        window.__walletControl = {
          chain: "0x1",
          rejectNext: false,
          accounts: [tester],
          calls: [],
          estimates: [],
          gasChecks: [],
        };
        const control = window.__walletControl;
        const provider = {
          request: async ({ method, params = [] }) => {
            control.calls.push({ method, params });
            if (method === "eth_accounts" || method === "eth_requestAccounts")
              return control.accounts;
            if (method === "eth_chainId") return control.chain;
            if (method === "wallet_switchEthereumChain") {
              control.chain = params[0].chainId;
              for (const f of listeners.get("chainChanged") || [])
                f(control.chain);
              return null;
            }
            if (method === "eth_sendTransaction") {
              const estimate = [...control.estimates]
                .reverse()
                .find((e) => e.data === params[0].data);
              control.gasChecks.push(
                !!estimate &&
                  BigInt(params[0].gas) ===
                    (BigInt(estimate.result) * 130n + 99n) / 100n,
              );
            }
            if (method === "eth_sendTransaction" && control.rejectNext) {
              control.rejectNext = false;
              throw Object.assign(new Error("User rejected"), { code: 4001 });
            }
            const response = await fetch(fork, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: Date.now(),
                method,
                params,
              }),
            });
            const body = await response.json();
            if (body.error)
              throw Object.assign(new Error(body.error.message), body.error);
            if (method === "eth_estimateGas")
              control.estimates.push({
                data: params[0].data,
                result: body.result,
              });
            return body.result;
          },
          on: (event, fn) => {
            const list = listeners.get(event) || [];
            listeners.set(event, [...list, fn]);
          },
          removeListener: (event, fn) =>
            listeners.set(
              event,
              (listeners.get(event) || []).filter((f) => f !== fn),
            ),
        };
        const announce = () => {
          dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid: "fork-wallet",
                  name: "Sepolia fork wallet",
                  rdns: "test.local",
                },
                provider,
              },
            }),
          );
          dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid: "second-wallet",
                  name: "Second test wallet",
                  rdns: "test.second",
                },
                provider: { ...provider },
              },
            }),
          );
        };
        addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      { fork, tester },
    );
    await p.goto(base);
    await p
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Sepolia fork wallet", exact: true })
      .waitFor();
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("dialog").isVisible(), false);
    await p
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Sepolia fork wallet", exact: true })
      .click();
    await until(
      p,
      () => !document.querySelector("#tools button").disabled,
      "EIP-6963 selection and Sepolia switch passed.",
    );
    await p.evaluate(() => {
      window.__walletControl.rejectNext = true;
    });
    await p.getByRole("button", { name: "Claim faucet", exact: true }).click();
    await p
      .getByText("Request cancelled in your wallet. You can try again.", {
        exact: true,
      })
      .waitFor();
    report.fork.push("Rejected signature has a plain per-button error.");
    await p.getByRole("button", { name: "Claim faucet", exact: true }).click();
    await until(
      p,
      () =>
        document
          .querySelector("#tools")
          .innerText.includes("Balance: 10,000.0000"),
      "Faucet minted 10,000 and refreshed balance.",
    );
    await p.getByRole("button", { name: "Approve IMD", exact: true }).click();
    await until(
      p,
      () => !document.querySelector('#tools button[type="submit"]').disabled,
      "Exact stake approval enables credit.",
    );
    await p
      .getByRole("button", { name: "Stack to myself", exact: true })
      .click();
    await until(
      p,
      () =>
        document.querySelector("#stack").innerText.includes("1.0000") &&
        document
          .querySelector("#leaderboards")
          .innerText.includes("Direct, no points"),
      "Credit updates cashback, vault value, project split and recent stacks.",
    );
    assert.match(await p.locator("#stack").innerText(), /Points\n0\.0000/);
    assert.match(await p.locator("#leaderboards").innerText(), /No points yet/);
    assert.ok(
      await p.evaluate(() => window.__walletControl.gasChecks.every(Boolean)),
      "every transaction uses its estimate multiplied by 1.3",
    );
    const projectName = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV";
    await p.locator("#apply-project").fill(stacker);
    await p.locator("#apply-name").fill(projectName);
    await p
      .locator("#apply-url")
      .fill(`https://sepolia.etherscan.io/address/${stacker}`);
    await p.locator("#apply-beneficiary").fill(tester);
    await p
      .getByRole("button", { name: "Copy question", exact: true })
      .waitFor({ timeout: 30000 });
    const expectedQuestion = registryInterface.decodeFunctionResult(
      "applyQuestion",
      await rpc("eth_call", [
        {
          to: registry,
          data: registryInterface.encodeFunctionData("applyQuestion", [
            stacker,
            projectName,
            `https://sepolia.etherscan.io/address/${stacker}`,
            50,
            tester,
          ]),
        },
        "latest",
      ]),
    )[0];
    assert.equal(
      await p.locator("#apply-panel pre").innerText(),
      expectedQuestion,
    );
    await p
      .getByRole("button", { name: "Get 10 test IMD", exact: true })
      .click();
    await until(
      p,
      () =>
        document
          .querySelector("#apply-panel")
          .innerText.includes("Balance: 10.0000"),
      "Open mint supplies the separate oracle fee token.",
    );
    await p.getByRole("button", { name: "Approve fee", exact: true }).click();
    await until(
      p,
      () =>
        !document.querySelector('#apply-panel button[type="submit"]').disabled,
      "Exact oracle fee approval enables application.",
    );
    await p
      .getByRole("button", { name: "Apply for listing", exact: true })
      .click();
    await until(
      p,
      () =>
        document
          .querySelector("#questions")
          .innerText.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV") &&
        document.querySelector("#questions").innerText.includes("Application"),
      "Application appears in open questions with project, asker and age.",
    );
    const checkQuestionWidth = async (state) => {
      for (const width of [360, 390, 768, 1280])
        for (const theme of ["light", "dark"]) {
          await p.setViewportSize({ width, height: 800 });
          if ((await p.locator("html").getAttribute("data-theme")) !== theme)
            await p.locator(".theme-button").click();
          await p.evaluate(() => document.fonts.ready);
          const measurement = await p.evaluate((state) => {
            const element = document.querySelector(
              state === "open" ? ".question-row h3" : ".outcome-list .address a",
            );
            const range = document.createRange();
            range.selectNodeContents(element);
            return {
              state,
              width: innerWidth,
              theme: document.documentElement.dataset.theme,
              scroll: document.documentElement.scrollWidth,
              name: element.textContent,
              nameWidth: element.getBoundingClientRect().width,
              nameScrollWidth: element.scrollWidth,
              lines: range.getClientRects().length,
              whiteSpace: getComputedStyle(element).whiteSpace,
              overflowWrap: getComputedStyle(element).overflowWrap,
              addressWhiteSpace: getComputedStyle(
                document.querySelector("#contracts .address a"),
              ).whiteSpace,
            };
          }, state);
          report.measurements.push(measurement);
          assert.equal(
            measurement.scroll, width, `${state}: ${width}px ${theme} page overflow`,
          );
          assert.equal(
            measurement.name, projectName, "the complete project name remains visible",
          );
          assert.ok(
            measurement.nameScrollWidth <= Math.ceil(measurement.nameWidth),
            "name stays within its box",
          );
          assert.equal(
            measurement.addressWhiteSpace, "nowrap", "hex addresses retain compact formatting",
          );
          if (width <= 390)
            assert.equal(measurement.lines, 2, "long names wrap into two lines on phones");
          if (width === 360) {
            await p.locator("#questions").scrollIntoViewIfNeeded();
            await p.screenshot({
              path: resolve(output, `questions-${state}-${width}-${theme}.png`),
            });
          }
        }
    };
    await checkQuestionWidth("open");
    await p.setViewportSize({ width: 390, height: 900 });
    await p.screenshot({
      path: resolve(output, "fork-application-390.png"),
      type: "png",
      fullPage: true,
    });
    await rpc("evm_increaseTime", [86401]);
    await rpc("evm_mine");
    await until(
      p,
      () => !document.querySelector("#questions article button").disabled,
      "The 15-second poll enables expiry after the live contract threshold, without a manual refresh.",
    );
    await p.getByRole("button", { name: "Expire", exact: true }).click();
    await until(
      p,
      () =>
        document
          .querySelector("#questions")
          .innerText.includes("Question cleared without a decision"),
      "Expire clears the question and shows its outcome.",
    );
    await checkQuestionWidth("outcome");
    for (const width of [360, 768, 1280])
      for (const theme of ["light", "dark"]) {
        await p.setViewportSize({ width, height: 900 });
        if ((await p.locator("html").getAttribute("data-theme")) !== theme)
          await p.locator(".theme-button").click();
        assert.equal(
          await p.evaluate(() => document.documentElement.scrollWidth),
          width,
          "populated app has no page overflow",
        );
        console.log(`Auditing populated app: ${width}px ${theme}`);
        const axe = await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.equal(
          axe.violations.length,
          0,
          JSON.stringify(
            axe.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          ),
        );
        report.accessibility.push({
          width,
          theme,
          route: "#/ (populated local fork)",
          violations: [],
        });
        await p.locator("#stack").screenshot({
          path: resolve(output, `stack-${width}-${theme}.png`),
          type: "png",
        });
        console.log(`Populated app checked: ${width}px ${theme}`);
      }
    report.fork.push(
      "Populated tables and wallet balances pass overflow and accessibility checks at 360, 768 and 1280 in both themes.",
    );
    report.fork.push(
      "No live-chain writes were sent. Fork application uses an existing non-trading contract to exercise contract prechecks only.",
    );
    assert.ok(
      await p.evaluate(() => window.__walletControl.gasChecks.every(Boolean)),
      "all wallet gas limits equal estimate times 1.3",
    );
    report.fork.push(
      "All transaction gas limits equal the captured estimate multiplied by 1.3, rounded up.",
    );
    await ctx.close();
  }
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
