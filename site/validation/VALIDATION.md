# Routed Sepolia website validation

Worker checks on **2026-10-11**, for the current routed site in `dist/`.
These are recorded observations, not independent certification. This job
changed no contract source or deployment, sent no transaction to live
Sepolia, and left existing build configuration and dependencies unchanged.
Previous screenshots/reports in `browser/`, `overflow/` and the older
root-level detector JSON files describe earlier revisions. Current evidence
is in [`routes/`](routes/) and [`bundle-audit.json`](bundle-audit.json).

## Delivered behavior

- Home, Stack, Projects, project detail, Apply, Leaderboard and seven docs
  section routes are separate views. Unknown routes have a Home link.
- One wallet hook, transaction manager, data loader and cache live above
  the routes. Switching all 14 tested routes made **zero extra log scans**.
  The existing 15/60-second polling, Refresh, and confirmed-transaction
  refresh remain. Registry event dates are fetched and cached with the
  snapshot. Every page displaying live chain figures shows its block.
- The top row has all six page links at 860px and above. Below it, Menu
  discloses the links beneath the row. Native links support browser history
  and static/IPFS deep links. Route changes set the title, scroll to top
  and focus the h1. Current page links are underlined and use aria-current.
- Apply retains the three token/approval/send steps and exact panel question.
  Challenge lives on listed project pages, showing fee plus bond and the
  pinned beneficiary. Errors are per field after blur or attempted action;
  disabled actions explain the blocking condition underneath.
- All app content boxes are a single column. Leaderboards also stack so
  unequal table lengths cannot create empty space beside shorter boxes.
  Docs navigation is the specified desktop sidebar/mobile select.
- `dist/llms.txt` is byte-identical to the previous export. The palette,
  six-size scale, compact geometry, theme handling, RPC order and gas ×1.3
  remain. Contracts moved to Docs > Addresses; the footer links there.

## Build and focused tests

Dependencies were installed **only under `/tmp/imd-acc-routes/site`** from
copies of the unchanged manifest/lockfile. npm caches were under `/tmp`.
The final source was copied there, built and its export copied to repository
`dist/`. All final browser checks below served that repository export.

| Command/check | Actual result |
|---|---|
| `npm ci --prefix /tmp/imd-acc-routes/site --cache /tmp/imd-acc-routes/npm-cache --no-audit --no-fund` | Passed; 90 packages in the temporary workspace |
| `npm run build --prefix /tmp/imd-acc-routes/site` | Passed: ABI verification, TypeScript and Vite production build |
| `npm run typecheck --prefix /tmp/imd-acc-routes/site` | Passed separately |
| `npm test --prefix /tmp/imd-acc-routes/site` | **16 passed, 0 failed** |
| `git diff --check` | Passed |
| Production export | **664,577 bytes**, including fonts, favicon, OG PNG, notices and unchanged llms.txt |
| Static asset audit | Relative HTML/CSS asset references resolve inside the export; no dependency/runtime registry required |
| Protected paths | No changes to contracts, manifests, lockfiles, Solidity build configuration, `.github/`, `.git/`, `.env`, `lib/`, or ignore files |

Node was **22.22.2**. The existing scripts verify these canonical ABI hashes:

- Stacker: `3ad4d4dc48c1151d15761cc1702132efdebd29256fff2fd8b4fca37532cbb640`
- ProjectRegistry: `99f136e9891dd024a34966657049bd24af8d796abe38964792bed12094a2f53e`

Both ABIs and the deployment handoff are unchanged. The app verifies the
live chain, deployment code/receipt and dependency wiring before writes.
This job did not recompile, change or deploy Solidity contracts.

The 16 tests cover listing boundaries/relisting, direct credits, ranking,
log decoding/order/deduplication, integer arithmetic, text/URL/rate/address
limits, ordered RPC fallback and range reduction, incomplete-history
failure, code/listing/open-question preflight, fee/beneficiary/cooldown
races, strict expiry boundaries, error messages and route parsing. New
regressions check exact invalid-character names, field-bound code/registry
errors and the cooldown date surviving transaction-error translation.

## Real-browser checks

Chromium **154.0.8037.0**, Playwright 1.58.2 and axe-core were used against
the production export at a temporary `/preview/` HTTP subpath. The harness
owns and closes its server/browser. Live RPCs were not mocked in `live` mode.
The first snapshot in the final live run was **Sepolia block 11,892,123**;
the final fork run started at block **11,892,108**.

The supplied MCP browser connector could not initialize because its cache
path was read-only (`EROFS`). The installed Chromium was therefore driven
by Playwright directly; this is a real rendered-browser check, not a
source-only substitute. Representative screenshots were opened and visually
inspected with the image tool. Native-device/screen-reader testing is not
claimed.

Actual browser commands used the temporary source/test installation:

```sh
EXPORT_DIR="$PWD/dist" CHECK_MODE=live EVIDENCE_DIR=/tmp/imd-acc-routes/final-live \
  node /tmp/imd-acc-routes/site/test/browser.mjs
EXPORT_DIR="$PWD/dist" CHECK_MODE=fork EVIDENCE_DIR=/tmp/imd-acc-routes/final-fork \
  node /tmp/imd-acc-routes/site/test/browser.mjs
EXPORT_DIR="$PWD/dist" CHECK_MODE=fixtures EVIDENCE_DIR=/tmp/imd-acc-routes/final-fixtures \
  node /tmp/imd-acc-routes/site/test/browser.mjs
EXPORT_DIR="$PWD/dist" CHECK_MODE=edges EVIDENCE_DIR=/tmp/imd-acc-routes/edges \
  node /tmp/imd-acc-routes/site/test/browser.mjs
```

| Group | Coverage | Result/evidence |
|---|---|---|
| Live Sepolia | 14 routes × 360/768/1280px × light/dark | **84 cases**, zero page overflow, single-row top bar, loaded local fonts, correct h1/title/focus; 84 axe scans with zero violations. `routes/live-results.json` |
| Populated local fork | Home, Stack, Projects, project, Apply, Leaderboard × all three widths × both themes | **36 cases**, zero overflow and axe violations, including a 48-character unbroken project name. `routes/fork-results.json` |
| Synthetic listed-project UI | Listed detail/Challenge × all three widths × both themes | **6 cases**, zero overflow and axe violations. `routes/fixtures-results.json` |
| Boundary/recovery | Home, Stack, Apply, Addresses × 320/390/859/860px × both themes | **32 cases**, no page overflow; exact Menu/desktop breakpoint and one-row bar. Simulated RPC error and Retry recovery passed. `routes/edges-results.json` |

There are **126 completed axe scenarios with zero violations** and 32
additional boundary layout cases. Completed final runs had **no page
exceptions, console errors or HTTP resource failures**. Accessibility scans
are limited to the selected WCAG A/AA tags, not certification.

The live run also exercised:

- All 14 routes by direct deep link and reload, beneath `/preview/`.
- Menu via mouse, Enter, Space and Tab; Escape/outside closure and returned
  focus; current-page markers; browser back and forward.
- Docs section select and previous/next links, one rendered section, agent
  guide copy and matching static download.
- Remembered theme, reduced-motion styles and the keyboard skip link.
- At 390×844, the Home Connect wallet button ends at **493px**, in the first
  screen, with the product explanation visible above it.
- Sixteen Apply error cases: invalid address, no code, short/long name,
  double quote, backslash, square bracket, non-ASCII, URL scheme and lengths,
  rate boundaries/fraction, invalid beneficiary and zero beneficiary.
  Each has the expected reason, alarm color and described invalid field.

## Transactions on an isolated Sepolia fork

The harness created an ephemeral account, impersonated/funded it only in
Anvil, and used existing deployed bytecode. It deployed nothing. It passed:

1. EIP-6963 discovery/choice, native dialog Escape/focus return and Sepolia switch.
2. Wallet rejection with a recoverable per-action message.
3. Faucet claim: 10,000 test IMD and the next-claim state.
4. Exact TestIMD approval, then credit. Stack's cashback, held shares, value,
   earned amount and project row update. Home's summary and Leaderboard's
   recent stack update; direct credits retain zero points.
5. Oracle-token mint, invalid-field checks on attempted approval, exact
   fee approval and application. The question equals `applyQuestion`'s return.
6. The application appears in Apply and its project route with a dated
   Applied event, asker, age and Expire. The project field and disabled
   send line explain its open question. Project filters and row link work.
7. Advancing local time, Refresh, Expire and the cleared-question outcome
   update both the project page and Apply.
8. All **eight captured wallet send attempts**, including the rejected
   request, carried gas limits equal to estimate ×1.3, rounded up.

The Stacker was the fork's applicant solely to test contract prechecks;
it is not a qualifying trading integration and no panel eligibility is claimed.

The live registry had no listed project for a completed Challenge flow.
Separate **synthetic RPC fixtures** tested all eight registry event kinds
(Applied, Listed, Rejected, Challenged, Defended, Delisted, AskCleared,
BeneficiarySet), 12 dated entries, periods, Challenge reason errors,
cooldown date, open-question disabling, zero-beneficiary validation and
Apply's Already listed error. These fixtures change browser responses only;
they neither modify deployed contracts nor represent signed oracle outcomes.
Source review confirms the send uses `challengeForBeneficiary` and the
shown beneficiary; unit tests check preflight races. A successful Challenge
transaction and signed panel settlement remain **unperformed**.

## Better Interface review and fixes

The pinned workflow and core principles of all six domains were read and
applied during implementation. The existing design is authoritative; no
new palette, font, larger type, motion or decorative component was introduced.

| Domain | Coverage | Finding and correction |
|---|---|---|
| Accessibility | Native page links, h1 focus/title, menu keys/focus return, docs select, labels, inline errors, live statuses, dialog; browser/axe | `site/src/Header.tsx:17` supplies the disclosure and return focus; `site/src/App.tsx:81` handles route focus/title/scroll. `site/src/forms.tsx:45` and `:399` now track blur/action validation, attach each error to its field and explain disabled actions. |
| Layout | Single-column source flow, measured 360/768/1280 pages plus 320/390/859/860 edges; representative screenshots | The old desktop app/listing/leaderboard column pairs left large spaces beside shorter boxes. `site/src/style.css:751` removes those pairs; `pages.tsx:534` keeps leaderboards sequential. Docs retain only their required navigation sidebar/select. No page overflow was measured. |
| Writing | Labels/actions, field errors, empty states, historical rate, token distinction and challenge bond consequence | `site/src/model.ts:33` now distinguishes short/long text and names the offending character; `site/src/chain.ts:417` binds code/registry errors to fields. `site/src/wallet.ts:104` no longer changes every listing-cooldown error into a faucet message. |
| Typography | Exact six-size scale, IBM Plex Mono 400/500/600 loaded, four-decimal/tabular values, long names and 75ch docs measure | `site/src/style.css:916` retains wrapping for project names/links while hexadecimal address links remain compact. No text size changed. Mobile Impeccable advisory is recorded below. |
| Colors | Both rendered palettes, alarm-field styles, measured CSS foreground/background pairs, axe contrast | All readable token pairs on paper/hover meet 4.5:1; lowest is **4.52:1** for light success text on hover. Disabled faint tokens are restricted to disabled controls. Exact pairs are in `routes/edges-results.json` and DESIGN.md. |
| UI | Loading, empty, error, pending, success, disabled explanations; copied address/guide, native controls, no layout animation | `site/src/pages.tsx:105` gathers project state/history/question/challenge. `site/src/chain.ts:302` fetches dates with shared data instead of on navigation. Existing square frames, compact controls and theme behavior remain. |

Rechecked corrections pass the final build, focused tests and the browser
cases above. Source review and rendered checks found no applicable remaining
layout, error, navigation or palette issue. Modals, screen readers, native
zoom and devices have the coverage limits below; no unperformed check is
reported as a pass.

## Impeccable

`site/test/detect.mjs` ran `npm exec --package impeccable -- impeccable detect`
(the `npx impeccable detect` equivalent), with source plus index.html, and
all 14 running routes at **1280×900** and **360×900**. Cache and browser
configuration stayed under `/tmp`. Current raw results are
`routes/impeccable-source.json`, `routes/impeccable-desktop.json` and
`routes/impeccable-mobile.json`.

- Source: clean, `[]`.
- Desktop: clean, `[]`.
- Mobile: only **11 advisory `flat-type-hierarchy` entries**, describing the
  inherited 18/15/14/13px compact hierarchy. Changing the size step would
  violate the explicit instruction to preserve text sizes. Weight, spacing,
  heading semantics and frames preserve hierarchy. No detector ignore or
  suppression rules were added. There are no non-advisory findings.

Initial detector URL launches failed because Chromium needed a writable
config directory and its sandbox was unavailable in this container. A
small temporary launcher supplied `--no-sandbox`; `XDG_CONFIG_HOME` pointed
to a temporary directory. One parallel validation attempt also exhausted
browser thread resources; it was stopped and rerun sequentially. Successful
runs above are the recorded results, not those startup failures. An early
axe measurement caught controls midway through the existing 150ms theme
transition; checks now wait for the settled theme before measuring contrast.

The manual Impeccable pass also checked the retained conventions: no hero
metrics, oversized figures, ornamental labels/badges, repeated metric-card
arrays, nested frames, side stripes, gradients, shadows, blur, glow, moving
layout, blinking/pulsing or entrance animation. Apply is the only visual
numbered step sequence.

## Limits and delivery audit

- Live Sepolia verification was read-only. Wallet writes used a local fork.
- Signed panel settlement and a successful listed-project challenge were
  not performed; synthetic fixtures are labeled separately above.
- No native screen reader, physical phone, Safari/Firefox, native 200% zoom,
  localization/RTL or iOS input-zoom test was run. The required inherited
  14px inputs remain, despite the generic guide's 16px mobile preference.
- System/remembered theme logic is unchanged; remembered choice was tested.
  Exact visual behavior under every OS/browser setting is not claimed.
- Browser and detector tools run in this worker, not as independent reviewers.
- Final source/export size and hashes, protected-path checks, relative assets
  and dependency/cache exclusions are recorded in `bundle-audit.json`.
  No ignore file was changed and no git submodule was introduced.
