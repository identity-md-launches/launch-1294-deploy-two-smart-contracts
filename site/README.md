# imd/acc Sepolia test run 2 site

The finished static site is [`../dist/`](../dist/). It contains all runtime
JavaScript, CSS, fonts, favicon, social image, licenses and the unchanged
`llms.txt`. It needs a static HTTP server and public Sepolia RPC access;
there is no backend, private key, runtime npm registry or contract deployment.

## Pages

| Route | Content |
|---|---|
| `#/` | Product explanation, facts, wallet summary, vault status, last five stacks |
| `#/stack` | Complete personal stack, faucet and stack-to-myself tools |
| `#/projects` | All / Listed / Applied / Delisted project table |
| `#/projects/<address>` | State, historical rate, beneficiary, periods, dated history, open question, Challenge |
| `#/apply` | Three-step application, exact panel question, open questions and outcomes |
| `#/leaderboard` | Top stackers, top projects and last ten stacks |
| `#/docs/what`, `/how`, `/addresses`, `/integrate`, `/listing`, `/points`, `/agents` | One docs section per hash route (each path starts `#/docs/`) |

`#/docs` also opens What it is. Unknown routes show a Home link. Hash URLs
work on reload at an IPFS gateway subpath without server rewrite rules.
The footer's Contracts link opens Docs > Addresses.

## Install and rebuild

Requires Node.js 22.12+ and npm; this revision used Node **22.22.2**.
React, TypeScript, Vite, ethers and test dependencies remain pinned in the
unchanged `package.json` and `package-lock.json`.

Build in a disposable directory to keep dependency and cache directories
out of the repository. From the repository root:

```sh
site_build_dir="$(mktemp -d /tmp/imd-acc-site.XXXXXX)"
cp -R site/. "$site_build_dir/"
npm ci --prefix "$site_build_dir" --cache /tmp/imd-acc-npm-cache
npm run typecheck --prefix "$site_build_dir"
npm test --prefix "$site_build_dir"
npm run build --prefix "$site_build_dir" -- --outDir "$PWD/dist"
```

The production build verifies both canonical ABI hashes, runs TypeScript
and writes Vite's output. `base: './'` makes exported asset URLs relative.
Rebuild after any runtime source change. Keep the complete export alongside
the source and lockfile in the submission. Do not include `node_modules`,
caches, dependency archives or a registry mirror. No ignore file changes
are needed. Existing Solidity build configuration and dependencies are unchanged.

## Preview

From the repository root, serve the export in a terminal:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173/#/`, or append any route above. Stop the server
with Ctrl+C. Use HTTP rather than opening `index.html` as a file. Wallet
actions support EIP-6963 and legacy injected providers; Sepolia ETH pays gas.

## Publish

Copy the complete `dist/` directory to a static host or pin its contents to
IPFS. Keep `assets/`, `fonts/`, `llms.txt`, `favicon.svg` and `og.png` beside
`index.html`. No rebuild or rewrite service is required at the host. In the
IdentityMD contributor flow the submitted export is the publishing input;
this job did not publish or deploy anything. The existing relative `og:image`
reference works at the assigned hosting subpath.

## Shared data and wallet state

`App.tsx` owns one wallet connection, transaction manager, `DataLoader`
and snapshot above all routes. Page changes do not scan logs. Refresh and
every confirmed transaction refresh the snapshot; the existing automatic
15-second open-question / 60-second idle polling remains. Pages with live
chain figures show the snapshot block. A refresh error marks retained data
as stale and disables writes. Event dates are cached with registry history.

The existing RPC order is **ethpandaops → sentio → publicnode**. Chain ID,
code at deployment and now, the deployment receipt and dependency wiring
are checked before enabling transactions. The deployment starts at block
11,891,109; both bundled ABI hashes still match the verified handoff.

The existing 12-block reorg overlap, chunked log reads and consistent-block
snapshot checks remain. Points use inclusive `fromBlock` and exclusive
`toBlock`. Wallet-held shares remain distinct from event shares used to
calculate cashback value. All sends use gas estimates **×1.3, rounded up**.
Oracle approvals use exactly the live fee, plus bond for challenges.
`challengeForBeneficiary` submits the beneficiary displayed for that project.

## Validation

See [`validation/VALIDATION.md`](validation/VALIDATION.md) for actual worker
results, the six-domain Better Interface review, findings and limitations.
The production build, separate typecheck and **16 focused tests passed**.
Chromium checked every route at 360, 768 and 1280px in both themes against
live Sepolia. Local-fork transactions covered wallet choice, switch,
rejection, faucet, approval, credit, application and expiry. No live-chain
transaction was sent and no contract was deployed or modified.

The browser harness owns a temporary `/preview/` server and closes it when
finished. It validates the real export, not Vite's development server.
After installing dependencies into the disposable build directory:

```sh
EXPORT_DIR="$PWD/dist" CHECK_MODE=live \
  npm run test:browser --prefix "$site_build_dir"
EXPORT_DIR="$PWD/dist" CHECK_MODE=fork \
  npm run test:browser --prefix "$site_build_dir"
EXPORT_DIR="$PWD/dist" CHECK_MODE=fixtures \
  npm run test:browser --prefix "$site_build_dir"
EXPORT_DIR="$PWD/dist" CHECK_MODE=edges \
  npm run test:browser --prefix "$site_build_dir"
```

Set `CHROMIUM_PATH` to an installed Chromium executable and `ANVIL_PATH`
to Anvil if the defaults in the script do not match your machine. Set
`EVIDENCE_DIR` to select a temporary report/screenshot directory. `fork`
starts and stops its own isolated local Sepolia fork, creates an ephemeral
impersonated account, funds it locally and advances local time for expiry.
It uses the existing Stacker as a deliberately non-qualifying applicant to
exercise contract prechecks, not panel eligibility. `fixtures` uses clearly
synthetic registry RPC responses for listed/challenged states; it does not
claim a signed oracle outcome or successful challenge transaction. `edges`
checks 320/390px and the 859/860px breakpoint, contrast and RPC retry.

Run Impeccable against source and the served export with
`EXPORT_DIR="$PWD/dist" node "$site_build_dir/test/detect.mjs"`.
This invokes `npx`'s equivalent `npm exec --package impeccable -- impeccable
detect`, with temporary cache storage. It scans source and all routes at
1280 and 360px. The restricted worker environment required a Chromium
launcher supplying `--no-sandbox` and a writable temporary `XDG_CONFIG_HOME`.
Source and desktop scans are clean. Mobile reports only the pre-existing
compact-type advisory; the task explicitly requires those exact sizes.

## Design and licenses

[`../DESIGN.md`](../DESIGN.md) documents the implemented colors, typography,
components and responsive behavior. Existing tokens, theme handling and
compact/Impeccable conventions are retained. The pinned Better Interface
guide informed accessibility, layout, writing, typography, colors and UI.
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and `DESIGN-LICENSE` retain
software, font and design-guidance attribution.
