import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Interface, Wallet } from "ethers";
import { injectForkWallet } from "./fork-wallet.mjs";
import { checkRegistryFixtures } from "./fixtures.mjs";

const output = process.env.EVIDENCE_DIR || "/tmp/imd-acc-routes-evidence";
const mode = process.env.CHECK_MODE || "live";
const exportDir = resolve(
  process.env.EXPORT_DIR || new URL("../../dist", import.meta.url).pathname,
);
const executablePath =
  process.env.CHROMIUM_PATH ||
  "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome";
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
const rpcPattern =
  /https:\/\/(rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz|ethereum-sepolia-rpc\.publicnode\.com)\/?$/;
const sections = [
  "what",
  "how",
  "addresses",
  "integrate",
  "listing",
  "points",
  "agents",
];
const routes = [
  "#/",
  "#/stack",
  "#/projects",
  `#/projects/${stacker}`,
  "#/apply",
  "#/leaderboard",
  ...sections.map((s) => `#/docs/${s}`),
  "#/missing-page",
];
const report = {
  mode,
  checkedAt: new Date().toISOString(),
  browser: "",
  blocks: [],
  checks: [],
  measurements: [],
  accessibility: [],
  errors: [],
  resourceFailures: [],
};
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://local").pathname,
  ).replace(/^\/preview\//, "");
  const file = resolve(exportDir, path === "" ? "index.html" : path);
  if (!file.startsWith(exportDir + "/")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    const mime =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".png": "image/png",
        ".txt": "text/plain",
      }[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime }).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ executablePath, headless: true });
report.browser = browser.version();
let anvil;
let fork;
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
function observe(page) {
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error") report.errors.push(entry.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.resourceFailures.push({
        url: response.url(),
        status: response.status(),
      });
  });
}
const note = (text) => {
  report.checks.push(text);
  console.log(text);
};
const navigate = async (page, hash) => {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, hash);
  await expect(page).toHaveURL(base + hash);
  await expect(page.locator("#page-heading")).toBeFocused();
};
async function ready(page) {
  await expect(page.locator(".data-line")).toContainText("Data at block", {
    timeout: 90000,
  });
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
}
async function matrix(page, label, allRoutes = routes) {
  for (const width of [360, 768, 1280])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page.locator(".theme-button").click();
      await page.waitForFunction(() => {
        const dark = document.documentElement.dataset.theme === "dark";
        return (
          getComputedStyle(document.querySelector(".connect-button")).color ===
          (dark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)")
        );
      });
      for (const route of allRoutes) {
        if (new URL(page.url()).hash === route)
          await page.locator("#page-heading").focus();
        else await navigate(page, route);
        await page.evaluate(() => document.fonts.ready);
        const measurement = await page.evaluate(() => {
          const bar = document.querySelector(".topbar-inner");
          const center = (node) => {
            const r = node.getBoundingClientRect();
            return r.y + r.height / 2;
          };
          const controls = [...bar.children].filter(
            (node) => getComputedStyle(node).display !== "none",
          );
          return {
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            barWidth: bar.scrollWidth,
            barHeight: bar.getBoundingClientRect().height,
            centers: controls.map(center),
            focus: document.activeElement.id,
            scrollY,
            title: document.title,
            theme: document.documentElement.dataset.theme,
            fonts: [...document.fonts].map(
              (font) => `${font.weight}:${font.status}`,
            ),
            contents: getComputedStyle(
              document.querySelector(".contents") || bar,
            ).display,
            select: getComputedStyle(
              document.querySelector(".docs-select") || bar,
            ).display,
          };
        });
        assert.equal(
          measurement.scroll,
          width,
          `${label} ${route} ${width} ${theme}: page overflow`,
        );
        assert.ok(measurement.barWidth <= width, "bar has no scroll");
        assert.ok(
          Math.max(...measurement.centers) - Math.min(...measurement.centers) <
            2,
          "bar is one row",
        );
        assert.equal(measurement.scrollY, 0, "route scrolls to top");
        assert.ok(
          measurement.fonts.every((font) => font.endsWith("loaded")),
          "local fonts loaded",
        );
        assert.match(measurement.title, / - imd\/acc$/);
        assert.equal(await page.locator("main h1").count(), 1);
        if (!route.startsWith("#/docs/") && route !== "#/missing-page")
          await expect(page.locator(".data-line")).toContainText(
            "Data at block",
          );
        if (route.startsWith("#/docs/")) {
          assert.equal(measurement.contents === "none", width < 860);
          assert.equal(measurement.select === "none", width >= 860);
          assert.equal(
            await page.locator(".docs-content > section").count(),
            1,
          );
        }
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        const violations = axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        }));
        report.accessibility.push({ label, route, width, theme, violations });
        assert.deepEqual(violations, [], `${route} ${width} ${theme}`);
        report.measurements.push({ label, route, ...measurement });
        await page.screenshot({
          path: resolve(
            output,
            `${label}-${route.replace(/[^a-z0-9]/gi, "_")}-${width}-${theme}.jpg`,
          ),
          type: "jpeg",
          quality: 72,
        });
      }
      console.log(
        `${label}: all ${allRoutes.length} routes checked at ${width}px ${theme}`,
      );
    }
}
async function menus(page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await navigate(page, "#/");
  const button = page.getByRole("button", { name: "Menu", exact: true });
  const menu = page.locator("#mobile-navigation");
  await button.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.locator("#page-heading").click();
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  // Theme and wallet follow Menu in the single control row, then the list.
  await expect(page.locator(".theme-button")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    menu.getByRole("link", { name: "Home", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(base + "#/stack");
  await expect(page.locator("#page-heading")).toBeFocused();
  await expect(menu).toBeHidden();
  await button.click();
  await menu.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.locator("#page-heading")).toHaveText("Projects");
  await expect(page.locator('.mobile-nav [aria-current="page"]')).toHaveText(
    "Projects",
  );
  await page.goBack();
  await expect(page.locator("#page-heading")).toHaveText("Your stack");
  await page.goForward();
  await expect(page.locator("#page-heading")).toHaveText("Projects");
  note(
    "Menu: mouse, Enter, Space, Tab navigation, Escape, outside click, focus return, current page and browser back/forward passed.",
  );
}
async function formErrors(page, eoa) {
  await navigate(page, "#/apply");
  const cases = [
    ["project", "not an address", /valid Ethereum address/],
    ["project", eoa, /no contract code/],
    ["name", "", /too short/],
    ["name", "x".repeat(49), /too long/],
    ["name", 'a"b', /double quote/],
    ["name", "a\\b", /backslash/],
    ["name", "[a]", /square bracket/],
    ["name", "café", /non-ASCII/],
    ["url", "http://example.test/source", /https:\/\//],
    ["url", "https://a", /too short/],
    ["url", "https://" + "x".repeat(200), /too long/],
    ["rate", "24", /25 to 100/],
    ["rate", "101", /25 to 100/],
    ["rate", "25.5", /whole number/],
    ["beneficiary", "wrong", /valid Ethereum address/],
    ["beneficiary", "0x" + "0".repeat(40), /must not be zero/],
  ];
  for (const [field, value, expected] of cases) {
    const input = page.locator(`#apply-${field}`);
    await input.fill(value);
    await input.focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(`#apply-${field}-error`)).toHaveText(expected, {
      timeout: 30000,
    });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    assert.match(
      await input.getAttribute("aria-describedby"),
      new RegExp(`apply-${field}-error`),
    );
    assert.equal(
      await page
        .locator(`#apply-${field}-error`)
        .evaluate((node) => getComputedStyle(node).color),
      await page
        .evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--alarm")
            .trim(),
        )
        .then((hex) =>
          hex === "#b3261e" ? "rgb(179, 38, 30)" : "rgb(255, 107, 98)",
        ),
    );
  }
  note(
    `${cases.length} Apply blur-error cases identify the reason, use alarm, aria-invalid and aria-describedby.`,
  );
}
try {
  if (mode === "live") {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    observe(page);
    let logReads = 0;
    page.on("request", (request) => {
      if (request.postData()?.includes('"eth_getLogs"')) logReads++;
    });
    await page.goto(base);
    await ready(page);
    report.blocks.push(await page.locator(".data-line").innerText());
    const start = logReads;
    for (const route of routes) await navigate(page, route);
    assert.equal(logReads, start, "route changes never scan logs");
    note(
      `All ${routes.length} routes reuse the existing snapshot with zero additional log scans.`,
    );
    await navigate(page, "#/");
    const first = await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .boundingBox();
    assert.ok(
      first.y + first.height < 844,
      "390px first screen has the main action",
    );
    note(
      `390px first-screen Connect wallet bottom: ${Math.round(first.y + first.height)}px.`,
    );
    await matrix(page, "live");
    await menus(page);
    for (const route of routes) {
      await page.goto(base + route);
      await expect(page.locator("#page-heading")).toBeFocused();
      await page.reload();
      await expect(page.locator("#page-heading")).toBeFocused();
      assert.equal(new URL(page.url()).hash, route);
    }
    note(
      "All 14 deep links and reloads work at /preview/ with relative static assets.",
    );
    await navigate(page, "#/docs/what");
    await page.locator("#docs-section").selectOption("how");
    await expect(page.locator("#page-heading")).toHaveText("How it works");
    await page
      .getByRole("link", { name: "Next: Addresses →", exact: true })
      .click();
    await expect(page.locator("#page-heading")).toHaveText("Addresses");
    await page
      .getByRole("link", { name: "← Previous: How it works", exact: true })
      .click();
    await expect(page.locator("#page-heading")).toHaveText("How it works");
    await navigate(page, "#/docs/agents");
    const agentText = await page.locator("#docs-agents pre").innerText();
    const download = await context.request.get(base + "llms.txt");
    assert.equal((await download.text()).trim(), agentText.trim());
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy agent guide", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).trim(),
      agentText.trim(),
    );
    note(
      "Docs select, previous/next links, agent guide copy and byte-equivalent llms.txt passed.",
    );
    await page.locator(".theme-button").click();
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".connect-button")
        .evaluate((node) => getComputedStyle(node).transitionDuration),
      "0s",
    );
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#page-heading")).toBeFocused();
    note("Remembered theme, reduced motion and keyboard skip link passed.");
    await formErrors(page, Wallet.createRandom().address);
    await context.close();
  }
  if (mode === "edges") {
    const context = await browser.newContext();
    const page = await context.newPage(); observe(page);
    await page.goto(base); await ready(page);
    for (const width of [320, 390, 859, 860]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator(".theme-button").click();
      for (const hash of ["#/apply", "#/docs/addresses", "#/stack", "#/"]) {
        await navigate(page, hash);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert.equal(await page.locator(".desktop-nav").isVisible(), width >= 860);
        assert.equal(await page.locator(".menu-button").isVisible(), width < 860);
        const centers = await page.locator(".topbar-inner").evaluate((bar) => [...bar.children].filter((child) => getComputedStyle(child).display !== "none").map((child) => { const r = child.getBoundingClientRect(); return r.y + r.height / 2; }));
        assert.ok(Math.max(...centers) - Math.min(...centers) < 2);
        report.measurements.push({ width, theme, hash, overflow: false, oneRow: true });
      }
    }
    for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator(".theme-button").click();
      const pairs = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
        const tokens = Object.fromEntries(["paper", "ink", "dim", "ok", "alarm", "hover"].map((name) => [name, css.getPropertyValue(`--${name}`).trim()]));
        const luminance = (hex) => {
          const h = hex.slice(1); const expanded = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
          const v = [0, 2, 4].map((i) => parseInt(expanded.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
        };
        return { bodyBackground: body.backgroundColor, tokens, pairs: ["paper", "hover"].flatMap((background) => ["ink", "dim", "ok", "alarm"].map((foreground) => { const a = luminance(tokens[foreground]), b = luminance(tokens[background]); return { foreground, background, ratio: Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100 }; })) };
      });
      assert.ok(pairs.pairs.every((pair) => pair.ratio >= 4.5));
      (report.contrast ??= []).push({ theme, ...pairs });
    }
    await page.route(rpcPattern, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Read service unavailable for test" } }) }));
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry data", exact: true })).toBeVisible({ timeout: 60000 });
    await page.unrouteAll();
    await page.getByRole("button", { name: "Retry data", exact: true }).click();
    await ready(page);
    note("Boundary reflow at 320, 390, 859 and 860px in both themes; menu/desktop breakpoint and single-row bar passed. Rendered CSS contrast pairs all meet 4.5:1. Simulated read failure and Retry recovered live data.");
    await context.close();
  }
  if (mode === "fork") {
    const portServer = createServer();
    await new Promise((done) => portServer.listen(0, "127.0.0.1", done));
    const port = portServer.address().port;
    await new Promise((done) => portServer.close(done));
    fork = `http://127.0.0.1:${port}`;
    anvil = spawn(
      process.env.ANVIL_PATH || "/home/imd/.foundry/bin/anvil",
      [
        "--fork-url",
        "https://rpc.sepolia.ethpandaops.io",
        "--chain-id",
        "11155111",
        "--port",
        String(port),
        "--accounts",
        "0",
        "--silent",
      ],
      {
        env: {
          ...process.env,
          XDG_CACHE_HOME: "/tmp/imd-acc-routes/foundry-cache",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    anvil.stderr.on("data", (data) => process.stderr.write(data));
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await rpc("eth_chainId");
        started = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 200));
      }
    }
    assert.ok(started, "local Sepolia fork started");
    const tester = Wallet.createRandom().address;
    await rpc("anvil_impersonateAccount", [tester]);
    await rpc("anvil_setBalance", [tester, "0x56bc75e2d63100000"]);
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
    });
    const page = await context.newPage();
    observe(page);
    await page.route(rpcPattern, async (route) => {
      const response = await fetch(fork, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: route.request().postData(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await response.text(),
      });
    });
    await injectForkWallet(page, fork, tester);
    await page.goto(base + "#/stack");
    await ready(page);
    report.blocks.push(await page.locator(".data-line").innerText());
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expect(page.locator("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Connect wallet", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sepolia fork wallet", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Claim faucet", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    note(
      "EIP-6963 choice, Escape/focus restoration and Sepolia switch passed.",
    );
    await page.evaluate(() => {
      window.__walletControl.rejectNext = true;
    });
    await page
      .getByRole("button", { name: "Claim faucet", exact: true })
      .click();
    await expect(
      page.getByText("Request cancelled in your wallet. You can try again.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Claim faucet", exact: true })
      .click();
    await expect(page.locator("#tools")).toContainText("Balance: 10,000.0000", {
      timeout: 60000,
    });
    await page
      .getByRole("button", { name: "Approve IMD", exact: true })
      .click();
    await expect(page.locator('#tools button[type="submit"]')).toBeEnabled({
      timeout: 60000,
    });
    await page
      .getByRole("button", { name: "Stack to myself", exact: true })
      .click();
    await expect(page.locator("#stack")).toContainText("1.0000", {
      timeout: 60000,
    });
    await navigate(page, "#/leaderboard");
    await expect(page.locator("#leaderboards")).toContainText(
      "Direct, no points",
    );
    await expect(page.locator("#leaderboards")).toContainText("1.0000");
    await navigate(page, "#/");
    await expect(page.locator(".stack-summary")).toContainText(
      "1.0000 IMD cashback",
    );
    note(
      "Faucet → exact approval → credit refreshed Stack, Home and Leaderboard; direct credits earn zero points.",
    );
    await formErrors(page, tester);
    // Clear the remote EOA check before trying all empty fields on an enabled approval.
    await page.locator("#apply-project").fill("");
    await page.locator("#apply-beneficiary").fill("");
    await page.locator("#apply-name").fill("");
    await page.locator("#apply-url").fill("");
    await page.locator("#apply-rate").fill("50");
    await page
      .getByRole("button", { name: "Get 10 test IMD", exact: true })
      .click();
    await expect(page.locator("#apply-panel")).toContainText(
      "Balance: 10.0000",
      { timeout: 60000 },
    );
    await page
      .getByRole("button", { name: "Approve fee", exact: true })
      .click();
    await expect(page.locator("#apply-project")).toBeFocused();
    for (const field of ["project", "name", "url", "beneficiary"])
      await expect(page.locator(`#apply-${field}`)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    const name = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV";
    const url = `https://sepolia.etherscan.io/address/${stacker}`;
    await page.locator("#apply-project").fill(stacker);
    await page.locator("#apply-name").fill(name);
    await page.locator("#apply-url").fill(url);
    await page.locator("#apply-beneficiary").fill(tester);
    await expect(
      page.getByRole("button", { name: "Copy question", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    const exact = registryInterface.decodeFunctionResult(
      "applyQuestion",
      await rpc("eth_call", [
        {
          to: registry,
          data: registryInterface.encodeFunctionData("applyQuestion", [
            stacker,
            name,
            url,
            50,
            tester,
          ]),
        },
        "latest",
      ]),
    )[0];
    assert.equal(await page.locator("#apply-panel pre").innerText(), exact);
    await page
      .getByRole("button", { name: "Approve fee", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Apply for listing", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page
      .getByRole("button", { name: "Apply for listing", exact: true })
      .click();
    await expect(page.locator("#questions")).toContainText(name, {
      timeout: 60000,
    });
    await expect(page.locator("#send-apply-disabled")).toContainText(
      "This project already has an open question",
    );
    await expect(page.locator("#apply-project")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.locator("#questions .project-link").click();
    await expect(page.locator("#project-details")).toContainText(name);
    await expect(page.locator("#project-history")).toContainText("Applied");
    await expect(page.locator("#project-history time")).toBeVisible();
    await expect(page.locator("#project-question")).toContainText(
      "Application",
    );
    note(
      "Oracle token mint, exact fee approval and application passed; exact panel question, Apply open question, project history/date and disabled open-question reason verified.",
    );
    await navigate(page, "#/projects");
    await page.getByRole("button", { name: "Applied", exact: true }).click();
    await expect(page.locator(".project-table")).toContainText(name);
    await page.getByRole("button", { name: "Listed", exact: true }).click();
    await expect(
      page.getByText("No listed projects.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delisted", exact: true }).click();
    await expect(
      page.getByText("No delisted projects.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.locator(".project-table .project-link").click();
    await expect(page.locator("#project-details")).toContainText(name);
    note(
      "Project filters and linked rows passed with a populated application.",
    );
    await matrix(page, "fork", [
      "#/",
      "#/stack",
      "#/projects",
      `#/projects/${stacker}`,
      "#/apply",
      "#/leaderboard",
    ]);
    await rpc("evm_increaseTime", [86401]);
    await rpc("evm_mine");
    await navigate(page, `#/projects/${stacker}`);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Expire", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "Expire", exact: true }).click();
    await expect(page.locator("#project-question")).toContainText(
      "no open question",
      { timeout: 60000 },
    );
    await expect(page.locator("#project-history")).toContainText("AskCleared");
    await navigate(page, "#/apply");
    await expect(page.locator("#outcomes")).toContainText(
      "Question cleared without a decision",
    );
    const gas = await page.evaluate(() => window.__walletControl.gasChecks);
    assert.ok(
      gas.length >= 7 && gas.every(Boolean),
      "all transaction limits are estimate ×1.3 rounded up",
    );
    note(
      `Expiry and refreshed outcome passed. All ${gas.length} wallet gas-limit checks equal estimate ×1.3, rounded up.`,
    );
    await context.close();
  }
  if (mode === "fixtures")
    await checkRegistryFixtures({
      browser,
      base,
      registry,
      stacker,
      registryInterface,
      rpcPattern,
      report,
      note,
      matrix,
    });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.resourceFailures, []);
  note(
    "No page exceptions, console errors or failed resources in the completed run.",
  );
} catch (error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(
    resolve(output, `${mode}-results.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((done) => server.close(done));
  if (anvil) anvil.kill("SIGTERM");
}
