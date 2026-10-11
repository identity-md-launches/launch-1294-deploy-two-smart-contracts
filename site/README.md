# imd/acc Sepolia test run 2 site

The app is `#/`; the documentation is `#/docs`. The published artifact is
[`../dist/`](../dist/), including `llms.txt`, local fonts, favicon and social
image. It needs only a static HTTP server. No backend, keys, runtime npm
registry or contract deployment is needed.

## Install and rebuild

Requires Node.js 22.12+ (validated with Node 24.21.0) and npm. React,
TypeScript, Vite and ethers are pinned in this directory's manifest and
lockfile. The repository's Solidity build configuration is unchanged.

Build in a disposable directory so no dependency or cache directories enter
the submission. Run these commands from the repository root:

```sh
site_build_dir="$(mktemp -d /tmp/imd-acc-site.XXXXXX)"
cp -R site/. "$site_build_dir/"
npm ci --prefix "$site_build_dir" --cache /tmp/imd-acc-npm-cache
npm run typecheck --prefix "$site_build_dir"
npm test --prefix "$site_build_dir"
npm run build --prefix "$site_build_dir" -- --outDir "$PWD/dist"
```

The build verifies both canonical ABI hashes, runs TypeScript, and exports
Vite's production output. `base: './'` gives relative asset URLs. Building
replaces only `dist/`. No Foundry dependencies are installed or changed.

For normal development in a separate working copy, `cd site`, `npm ci`,
`npm run dev`, and `npm run build` work too. Never include generated
`node_modules`, npm caches or dependency archives in a submission.

## Preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173/#/`, `http://127.0.0.1:4173/#/docs` and
`http://127.0.0.1:4173/llms.txt`. Serve over HTTP rather than opening the HTML
as a `file:` URL. Wallet actions use an injected EIP-6963 or legacy provider.
The wallet must be on Sepolia and have Sepolia ETH for gas.

## Publish

Publish the complete contents of `dist/` to a static host or IPFS directory.
Keep the `assets/` and `fonts/` directories beside `index.html`; no rewrite
rules or rebuild are needed. Hash routes work at a gateway subpath. In the
IdentityMD contributor flow, the committed export is the publishing input;
this assignment does not invoke a publishing command. `og:image` is relative
because the final host name is assigned after submission.

## Data and transactions

- Stacker and ProjectRegistry are copied from the verified launch handoff in
  `src/deployment.json`, source commit
  `ef39dd18d1c65faaaa49c0a4a3f162960d594f18`, deployment block 11,891,109.
- Full ABIs in `src/abi/` were generated from the unchanged Solidity sources
  with solc 0.8.26. Both canonical ABI hashes and creation bytecode hashes
  match the handoff. `scripts/verify-abi.mjs` checks the ABI hashes at build.
- Before enabling writes, the app verifies chain ID, code at deployment and
  now, absence of code before deployment, the successful deployment receipt,
  and Stacker/registry/vault dependency wiring.
- Reads fall back in order: ethpandaops, sentio, publicnode. Logs are scanned
  in chunks of at most 1,000 blocks, reduced on provider range-limit errors.
  A failed scan never becomes a partial leaderboard. Reads share a block
  tag. The cache rescans the last 12 blocks and is invalidated on a changed
  previous block hash; the completed snapshot's hash is checked again.
- All registry events reconstruct listing periods. Points use
  `fromBlock <= event.block < toBlock`; open periods have no upper bound.
  Current wallet shares are separate from event shares used for value.
- Open questions trigger a 15-second refresh. Otherwise data refreshes each
  minute. Every confirmed transaction triggers a refresh. The loaded block
  is visible. A refresh failure retains clearly marked old data and
  disables writes until a successful refresh.
- Each action estimates gas and sends the estimate multiplied by 1.3,
  rounded up. Account/network are checked before estimation and signing.
  Application and challenge preflight checks run again before sending.
  Approvals use exactly the current oracle fee (plus bond for challenges).
- The agent guide in `public/llms.txt` is imported verbatim into the docs;
  it is also copied unchanged to `dist/llms.txt`.

## Validation

Actual results, review findings, screenshots, commands and limitations are
in [`validation/VALIDATION.md`](validation/VALIDATION.md). The final
production build, typecheck and 12 focused tests pass. Browser validation
uses the production export at a subpath, live Sepolia reads, and a local
Sepolia fork for transactions. No live-chain transaction was sent.

The browser test checks both pages at 360, 390, 768 and 1280 pixels, both
light and dark themes, overflow, local fonts, axe accessibility findings,
keyboard tabs and skip link, remembered theme, docs anchors and agent guide
copy/download. With a local fork it also checks wallet discovery, chain
switch, signature rejection, faucet, approval, credit, application and
expiry. Test accounts are generated and funded only on that fork.

To repeat it, preview the production export, install a Playwright Chromium
browser in the disposable build environment, and run:

```sh
PREVIEW_URL=http://127.0.0.1:4173/ npm run test:browser --prefix "$site_build_dir"
```

Set `CHECK_MODE=live` or `CHECK_MODE=fork` to run the two groups separately. The fork mode requires `FORK_RPC`. Set `CHROMIUM_PATH` to an existing Chromium executable if needed. Evidence
is written under `/tmp/imd-acc-browser-evidence` by default; `EVIDENCE_DIR`
can select another temporary output directory.

For the transaction checks, start an isolated local fork in another terminal:

```sh
anvil --fork-url https://rpc.sepolia.ethpandaops.io \
  --chain-id 11155111 --port 8547 --silent
```

Then run the same browser test with `FORK_RPC=http://127.0.0.1:8547`.
**Use only a local Anvil fork for this variable.** The test impersonates a
fresh account, funds it locally and advances local time for expiry. It uses
an existing non-trading contract to test application prechecks, not panel
eligibility. It deploys no contracts and sends no transaction to Sepolia.

The optional social image can be rebuilt with `npm run social` in the
build directory, using the same Chromium setup. Its source uses the local
IBM Plex Mono font. The generated `public/og.png` is included already.

## Design and licenses

[`../DESIGN.md`](../DESIGN.md) records the implemented tokens, type scale,
components and responsive behavior. The pinned Better Interface guide was
applied across accessibility, layout, writing, typography, colors and UI.
See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for bundled software,
font and design-guidance attribution.
