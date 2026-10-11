# imd/acc Sepolia test site

A static page with no build step, package manager, CDN scripts, or server dependency. Serve this directory over HTTP(S), for example `python3 -m http.server 8080 --directory site`. Publishing is the platform's release-setting step; this builder does not publish or deploy anything.

## Deployment handoff

No `deployment.json` is shipped before deployment. The page shows an awaiting-deployment state and disables transactions. It never substitutes launch #1129's Stacker or guessed contract addresses.

After the platform deploys the two contracts, pass its confirmed information to `node site/configure.mjs /path/to/confirmed-sepolia-handoff.json`. This is a read-only network verification followed by writing `site/deployment.json`. The handoff object has:

- `chainId`: numeric `11155111`.
- `contracts`: exactly two entries, in the order `Stacker`, `ProjectRegistry`.
- Each entry has `contract`, `address`, numeric `blockNumber`, and `transactionHash`, all from the confirmed platform receipt. When both contracts are created in one factory transaction, both entries share the block and transaction hash.

The script and page reject missing/zero addresses, failed receipts, the wrong network, historical code predating the supplied deployment block, and unexpected contract wiring. Both names and addresses must be supplied by the platform's actual handoff. The page must be published with the generated file beside `index.html`. The supplied root `launch.json` remains untouched and is not website configuration.

The live dependencies are fixed to the approved Sepolia table in `core.mjs`. New deployment addresses are fully external to the app until confirmed. Do not add keys or deployment scripts.

## User flows

- Connect an injected EIP-1193 wallet and switch/add Sepolia. Every write explicitly carries `chainId: 11155111`, even during wallet confirmation; account/network guards run before each transaction.
- Claim staking TestIMD with `faucet()`, view `nextFaucetAt`, approve exactly the amount entered, and call `credit(self, amount)`. This is direct staking and earns zero listing points.
- Separately mint 10 **oracle** test IMD with `mint(self, 10e18)` on `0x44a1…f89a`. The staking token `0x2b69…1e82` cannot pay Intake fees.
- Apply with project, name, HTTPS source URL, 25–100 bps and beneficiary. Read the current `ORACLE_FEE()`, approve exactly it, then submit.
- Challenge with a reason and an exact fee-plus-bond approval. Listed status, open question and cooldown are checked first; the contracts remain authoritative if state changes while a wallet is open.
- Clear an unanswered request once the Intake completed it or the one-day deadline passed.
- Wallet and project totals, current vault balances/value, listing periods, all-time leaderboards, pending outcomes and recent stacks update on refresh or every 30 seconds. Transaction gas is the wallet estimate multiplied by 1.3.

## Counting and trust

All arithmetic uses `bigint`. Vault share decimals are read from the vault (24 on this test vault); token and points amounts use 18 decimals. Cashback value prices all received shares, including those already transferred/redeemed; the separate current balance avoids confusing that history with present holdings.

Logs are read in bounded chunks from each contract's confirmed deployment block, with endpoint failover and smaller ranges on RPC rejection. A failed or reorganized scan is visibly stale, never presented as a complete new leaderboard. Scans rebuild history, so removed logs are not retained in an incremental cache.

Each listing epoch is `[fromBlock, toBlock)`, or open-ended while listed. Previous eligible points survive delisting; relisting starts another epoch. Applications and challenges do not create eligibility themselves. Direct and unlisted stacks have no points. **This test page counts listing eligibility; it does not verify each project's swap logs, fee funding, or exact per-trade rate.** A production rewards indexer must add project-specific trade reconciliation. The page labels these as listing points and promises no rewards.

The single-open-request model permits spam and front-running. Defending a challenge no longer buys a new cooldown, but does not guarantee fair ordering. If Intake retires the action or the signer changes, a new registry and an explicit old-registry cutoff are needed; this page does not invent a migration rule.

## Local checks

```
forge build
node --test site/test/core.test.mjs site/test/app.test.mjs
node site/test/browser.mjs /path/to/chrome
```

The first Node suite tests ABI compatibility against Foundry output, fee-token separation, real app event handlers with a simulated DOM/wallet/RPC, exact approvals, wallet network changes, point boundaries and relisting, deployment validation and incomplete RPC history. All synthetic addresses exist only in tests. No test uses a real wallet key or broadcasts a transaction.

The optional Chrome runner uses a fresh disposable profile, local server and mocked RPC/wallet, and checks a 360px viewport and the same flows. It requires an installed Chrome/Chromium that can start in the host environment. Chrome here aborts while registering with macOS before loading a page, so visual/mobile rendering and a real extension wallet remain release smoke checks. The DOM tests do not claim to prove browser layout. Live Sepolia contract behavior was tested separately through local Foundry forks.

After deployment/publication the platform should open the page in a real browser, verify the shown release addresses, then use a test wallet to claim, stack, mint oracle IMD and submit an application. This worker deliberately does not conduct these broadcasts.

## Vendored code

`vendor/ethers-6.17.0.mjs` is the self-contained ESM build from the npm `ethers` 6.17.0 distribution, MIT license in `vendor/ethers-LICENSE.md`. SHA-256 `b016b0c3898c78fd8156466eb1ff1f42c9df951c2f0d64c9bdf799fe745b0a6c`.

`test/vendor/linkedom-0.18.12.mjs` is the self-contained `worker.js` DOM implementation from npm `linkedom` 0.18.12, used only by offline tests. Its MIT license is adjacent. SHA-256 `196efeb17c260e001979dbc54a3c30e701a881c6e8a3eedaddc5ad83c99ee5ff`. Neither library requires downloading anything during verification or site loading. Existing project configuration and dependency directories are unchanged.
