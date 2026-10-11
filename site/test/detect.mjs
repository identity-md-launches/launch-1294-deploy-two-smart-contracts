import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(new URL("../", import.meta.url).pathname);
const dir = resolve(process.env.EXPORT_DIR || `${root}/../dist`);
const output = process.env.EVIDENCE_DIR || "/tmp/imd-acc-detect";
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://local").pathname,
  ).replace(/^\/preview\//, "");
  const file = resolve(dir, path || "index.html");
  if (!file.startsWith(dir + "/")) {
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
const deployment = JSON.parse(
  await readFile(`${root}/src/deployment.json`, "utf8"),
);
const project = deployment.contracts.find(
  (contract) => contract.name === "Stacker",
).address;
const hashes = [
  "#/",
  "#/stack",
  "#/projects",
  `#/projects/${project}`,
  "#/apply",
  "#/leaderboard",
  ...[
    "what",
    "how",
    "addresses",
    "integrate",
    "listing",
    "points",
    "agents",
  ].map((slug) => `#/docs/${slug}`),
  "#/missing-page",
];
const scans = [
  ["source", [`${root}/src`, `${root}/index.html`]],
  ["desktop", ["--viewport", "1280x900", ...hashes.map((hash) => base + hash)]],
  ["mobile", ["--viewport", "360x900", ...hashes.map((hash) => base + hash)]],
];
try {
  for (const [name, targets] of scans) {
    console.log(`Impeccable ${name} scan…`);
    const child = spawn(
      "npm",
      [
        "exec",
        "--yes",
        "--cache",
        "/tmp/imd-acc-routes/npm-cache",
        "--package",
        "impeccable",
        "--",
        "impeccable",
        "detect",
        ...targets,
        "--json",
      ],
      {
        env: {
          ...process.env,
          IMPECCABLE_BROWSER:
            process.env.CHROMIUM_PATH ||
            "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome",
        },
      },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    const code = await new Promise((done) => child.on("close", done));
    await writeFile(resolve(output, `impeccable-${name}.json`), stdout);
    await writeFile(
      resolve(output, `impeccable-${name}.log`),
      `Exit code: ${code}\n${stderr}`,
    );
    console.log(
      `Impeccable ${name}: exit ${code}; ${stdout.length} output bytes.`,
    );
    if (code !== 0) process.exitCode = 1;
  }
} finally {
  await new Promise((done) => server.close(done));
}
