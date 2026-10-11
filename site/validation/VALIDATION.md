# Sepolia test run 2 website validation

Worker-run checks on 2026-10-11. These results document observations and
limitations; they are not independent certification. No live-chain
transaction was sent, and no contract source, deployment, Solidity build
configuration or existing dependency was changed.

## Delivered build

- App: `dist/index.html` at `#/`; docs: `#/docs` and section hash routes.
- React 19, TypeScript 5.9, Vite 7 and ethers 6 source in `site/`.
- Manifest and lockfile in `site/`. All installations and npm caches used
  temporary directories outside the repository.
- Production export: 651,043 bytes before this documentation/evidence.
  Local fonts, favicon, social PNG, licenses and `llms.txt` are included.
- HTML and CSS asset references resolve relative to the export. Tested
  under `/preview/`, not only at a server root. The exported `llms.txt`
  matches `site/public/llms.txt` byte for byte.
- Title, description, favicon, `og:title` and `og:image` exist. The social
  image is 1200×630. Its relative URL avoids inventing a final hosting name.
- The source/export inventory and final size audit are in `bundle-audit.json`.

## Commands and results

The build workspace was `/tmp/imd-acc-site`; source was copied there to keep
`node_modules` and caches out of the submission. The normal reproduction
commands are in `site/README.md`.

| Check | Actual result |
|---|---|
| `forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache` | Pass, unchanged project sources compiled with solc 0.8.26 |
| `node scripts/verify-abi.mjs` | Both canonical ABI hashes match the verified handoff |
| Creation bytecode keccak from the compiled artifacts | Both match the verified handoff |
| `npm run typecheck` | Pass |
| `npm test` | 12 tests passed, 0 failed |
| `npm run build -- --outDir /tmp/imd-acc-export` | Pass, ABI verification, typecheck and production build; no chunk-size warning in the final build |
| Agent guide interfaces + integration fragment compiled in `test/scratch/AgentIntegration.sol` | Pass with the existing Foundry configuration; no deployment |
| `git diff --check` | Pass |
| Protected path diff / submodule check | No changes in contracts, existing build configuration, `lib/`, `.github/` or ignore files; no submodules |

ABI hashes (canonical recursively sorted object keys, array order retained):

- Stacker: `3ad4d4dc48c1151d15761cc1702132efdebd29256fff2fd8b4fca37532cbb640`
- ProjectRegistry: `99f136e9891dd024a34966657049bd24af8d796abe38964792bed12094a2f53e`

Creation bytecode hashes:

- Stacker: `6fc69b87eec0f874ab88a4e3ff7513a35d8d6fb6cd379fa517dc41bc03fea6b2`
- ProjectRegistry: `af96cb7c212dbc50831eea024c58506f228875b1feb683612f10313a2f815cfa`

The unit checks cover listing boundaries, delisting/relisting, direct
credits, unique traders, rejection/defended outcomes, log order and
deduplication, removed logs, large integer amounts, exact text/rate limits,
ordered RPC fallback, range reduction without gaps, explicit history
failure, application preflight, challenge fee/beneficiary/cooldown races,
expiry's strict boundary and Intake completion, friendly errors and
failure to verify a deployment.

## Live Sepolia browser checks

Chromium 155 was exercised with Playwright 1.58.2, plus direct inspection
through the assigned browser tool. The preview served the actual production
export under `http://127.0.0.1:4173/preview/`.

The successful live run recorded block **11,891,489**. It verified the
launch contracts and their dependency wiring, fetched real logs from
11,891,109, and read the live vault and registry. The observed launch had
no Stacked or application events; the vault was open. The registry fee was
0.5000 oracle test IMD, the bond 5.0000, cooldown one hour and pending
expiry one day. These values are read live in the UI, not used as fixed
transaction quotes.

`browser/live-results.json` records **16 page/theme/viewport combinations**:
App and Docs at 360, 390, 768 and 1280px, each in light and dark. Each had:

- Document scroll width equal to the viewport width.
- Zero axe findings for the selected WCAG A/AA tags.
- All three self-hosted font weights loaded.
- No page exceptions or console errors in the completed run.

At 390px, the main Connect wallet action is within the first 844px. At
360px, the top control row stays below 60px tall, without wrapping or the
Sepolia text. Screenshots in `browser/` show the app and docs at the three
requested widths and both themes. Rendered screenshots were inspected,
not inferred only from source or the accessibility tree.

Navigation, docs section focus/scroll, the skip link, keyboard tab arrows
and Home, system/remembered themes, reduced motion, copying the agent guide,
and the matching static `llms.txt` all passed. A simulated RPC failure
produced a visible retry state and disabled writes; Retry restored live
Sepolia data. The wallet chooser uses a native dialog with Escape and focus
restoration behavior. A no-wallet message was also inspected directly.

## Wallet interaction checks

A successful earlier full browser run used a local Anvil fork of Sepolia
and the same production export. It exercised the real deployed bytecode on
the fork, with an ephemeral impersonated/funded account, without a supplied
private key. It passed:

- EIP-6963 discovery with two providers, wallet choice and Sepolia switching.
- A rejected signature and its plain per-button error message.
- Faucet claim, next-claim state and 10,000.0000 test IMD balance refresh.
- Exact TestIMD approval, then credit to the connected account.
- Updated cashback, tsIMD, value, per-project row and recent stacks.
  The credit was marked direct and points stayed 0.0000.
- Minting 10 oracle test IMD, exact fee approval, and `applyListing`.
- A question preview equal to the contract's `applyQuestion` return value.
- The application appearing with project, kind, asker and age.
- Advancing local time, expiry and a visible cleared-question outcome.
- Every submitted gas limit equal to its captured estimate ×1.3, rounded up.

The final fork run passed, including automatic 15-second polling for expiry without a manual refresh. Six populated-app width/theme cases at 360, 768 and 1280px also passed overflow and axe checks. Combined with the live run, that is 22 completed accessibility scenarios with zero findings and no console errors. The record is `browser/fork-results.json`. The test source supports `CHECK_MODE=live` and
`CHECK_MODE=fork` to repeat the groups separately. Its `FORK_RPC` input is
restricted to localhost. The fork application uses the already-deployed
Stacker as a deliberately non-qualifying applicant to exercise contract
prechecks; this is not evidence of panel eligibility.

## Better Interface review

The pinned workflow and the core principles of all six domains were read
and applied during implementation. The explicit visual brief takes
precedence over generic guide defaults, including compact type, square
corners, 14px inputs and no decorative motion.

| Domain | Coverage and evidence | Applicable findings and corrections |
|---|---|---|
| Accessibility | Native links/buttons/inputs/dialog; labels and described errors; heading order; visible focus; tabs, skip link, copy states, transaction live regions; browser/axe checks | `site/src/App.tsx:88` route targets originally lost the first character. Fixed hash slicing, heading focus and the skip destination. `site/src/ui.tsx:6` copy labels now follow visible success/failure text. `site/src/style.css:524` empty transaction statuses retain their live-region nodes instead of using display:none. |
| Layout | Actual screenshots and overflow measurements at all requested widths; 390px main action; natural frame heights; internal table scrolling; desktop two-column composition | `site/src/App.tsx:365` wallet notices moved below the sticky bar to preserve its single control row. Project/recent table minimum widths are attached to the shared table component. |
| Writing | Sentence-case headings/actions; staking and oracle tokens distinguished; direct/no-points labels; challenge bond consequence before action; loading/empty/retry states | Kept historical application rate explicit and explained event-share value versus currently held shares. Removed draft marketing phrasing and generic status badges. |
| Typography | Loaded IBM Plex Mono 400/500/600; six-size scale; body line height; four-decimal amounts, aligned numbers, 75ch measure; mobile screenshots | Preserved the exact required scale. The mobile detector advisory below conflicts with that prescribed scale and was documented rather than hidden. |
| Colors | Both rendered themes; text/paper/hover pairs measured; disabled colors isolated; statuses carry words | Readable secondary text uses dim, not faint. All measured readable text pairs meet 4.5:1; the minimum is light success text on hover at 4.52:1. Full values are in DESIGN.md. |
| UI | Hover/focus/disabled/pending/success/error, native wallet dialog, Apply/Challenge panels, stable content, copy controls | `site/src/wallet.ts:355` keeps an action pending until its refresh completes, avoiding an enabled button that silently ignores a second click. Only color/background transitions remain; reduced motion removes them. |

A data validation finding was also repaired: `site/src/chain.ts:83`
previously wrapped an RPC range-limit error in a generic Error, so the log
reader could not reduce its chunk size. Preserving RpcError fixed the
reproducing test; all ranges are now scanned without gaps. It remains an
explicit error if the history cannot be read.

## Impeccable

The following commands were run with `IMPECCABLE_BROWSER` pointing at the
installed Chromium executable for URL scans:

```sh
npx impeccable detect site/src site/index.html --json
npx impeccable detect http://127.0.0.1:4173/preview/ \
  http://127.0.0.1:4173/preview/#/docs --json
npx impeccable detect --viewport 360x800 \
  http://127.0.0.1:4173/preview/ \
  http://127.0.0.1:4173/preview/#/docs --json
```

Source and desktop scans returned `[]`. The 360px scan returned no primary
findings and two **advisory** `flat-type-hierarchy` entries, one for each
page. They report the required 18/15/14/13px compact mobile scale. Increasing
a size step would conflict with the task's exact type sizes; weight 600,
spacing and semantic headings supply the hierarchy. The prescribed scale
is retained. No detector ignore rules or suppressions were added. The raw
results are `impeccable-source.json`, `impeccable-page.json` and
`impeccable-mobile.json`.

The review also checked the explicit prohibitions by source and rendered
inspection: no hero metrics, ornamental labels/badges, repeated card grids,
nested frames, side stripes, shadows, gradients, blur, glow, moving layout,
pulsing/blinking effects or animated entrances. The numbered Apply flow is
the only numbered UI sequence.

## Limits

- There was no supplied connected/funded wallet for real Sepolia writes.
  Live verification was read-only; writes ran on an isolated local fork.
- No signed oracle-panel settlement or successful listed-project challenge
  was sent. The live registry had no listed project. Challenge eligibility,
  expected beneficiary, fee races, cooldown, text constraints and error
  decoding have focused tests; listing periods and outcomes have event
  fixtures. These do not certify a future panel decision.
- Native screen-reader sessions, physical mobile devices, Safari, Firefox,
  RTL and browser-native 200% zoom were not tested. Responsive screenshots
  and an axe run are not substitutes for those checks.
- The generic typography guide's 16px mobile-input preference was superseded
  by the brief's explicit 14px inputs; native iOS behavior was not measured.
- A first URL detector attempt could not locate Chrome; supplying its path
  resolved that. Early harness attempts also used an unsupported WebP
  screenshot option and lost temporary preview/fork processes; these were
  repaired. A populated-state accessibility run hit a four-minute harness
  timeout; the final run gives primary interactions priority and allows a
  longer bounded audit. Only completed result files are reported as passes.
- Hosting was not performed. The submission delivers the complete static
  export for the publisher, as requested.
