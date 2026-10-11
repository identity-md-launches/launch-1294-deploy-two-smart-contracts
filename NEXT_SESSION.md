Repo: **`khaed1/imd-acc`** (this repository: README, design notes, history, job prompts). If it isn't in your session, attach it with `add_repo` (push access). The imd/acc code IMD built and deployed is public at https://github.com/identity-md-launches/launch-1129-build-imd-acc-sepolia-test (commit `934fb404`, site PR #2 at `7de7d635`). imd/acc no longer lives in the shared notes repo `khaed1/claude` (branch `claude/adoring-goodall-pn3jyz`); its `HANDOFF.md` is mostly PLEA now, so read it only for PLEA details.

You're working on **imd/acc**, a project I'm building on the IMD swarm (imd.fun). A separate session on my other account keeps working on **PLEA**, imd/acc's first integration, so don't change PLEA; just use it as the live example. Read `README.md` first, then `docs/design.md` and `docs/history.md`. Contracts: `src/Stacker.sol` (mainnet version) with Foundry tests in `test/`.

## imd/acc in brief
Trading cashback paid in **staked IMD (sIMD)**, inspired by TokenWorks' btc/acc. A participating project sends a share of each trade (0.25%–1%, its choice; PLEA uses 0.5%), taken from fees it already charges, to the trader as sIMD. It does this through one shared, ownerless **`Stacker.credit(trader, imdAmount)`**, which pulls the IMD from the project and calls `sIMD.deposit(amount, trader)`, so the vault mints shares straight to the trader. No new token and no cut. Every `Stacked(project, trader, imd, shares)` event is kept as **points** (trader and project), the basis for leaderboards and maybe a later airdrop (nothing promised). Only credits from **listed projects** earn points, from the block they were listed; anyone else's credits show as "direct, no points".

## Where it stands (2026-10-11)
- **Live on Sepolia, launch #1129** (block 11,874,601): TestIMD `0x2b69099e59b05901faa1dd164fabf098bf831e82` (`faucet()`: 10,000 tIMD per address per 24h), TestSIMD `0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1` (owner `0x4b91…6821` can pause it), **Stacker `0x293c7134ab8f6bf1d8ff44ed806575f8f1baf477`**.
- **Test page:** https://imd-acc-sepolia-test-run.site.identitymd.eth.limo (site job `5530dde0-f0f2-45c2-b18d-ea718fc458de`, still the project's newest job; `projects.json` is still empty).
- **PLEA v10's hook** `0x3d4CcAc329010b8beA3b14498d9a45EAB00c68Cc` (block 11,885,872) credits 0.5% of every PLEA/IMD buy and sell inside the same swap. Stacker totals at block 11,889,292: 101.27 tIMD, 0.1674 from PLEA.
- **Two jobs ready, waiting for my OK to pay** (both pass `POST /requests/check` with no blockers; exact bodies in `jobs/requests/`):
  1. `jobs/3-list-plea.md`: `job.continue` of `5530dde0` that lists PLEA in `projects.json` (tested locally against live Sepolia).
  2. `jobs/4-mainnet-launch.md`: `launch.open` on chain 1 deploying only the lean `Stacker(IMD, sIMD)` from **this repository** (`src/Stacker.sol`, `launch.json`), with IMD's full audit plan. 42 tests pass, plus 3 mainnet-fork tests (`ETH_RPC_URL=… forge test --mc MainnetFork`). Fork gas: deploy 446k, new trader 130k, repeat 96k.

- **Sepolia test run 2 ready** (`jobs/5-sepolia-v2-launch.md` + `jobs/5-sepolia-v2-site.md`, request `jobs/requests/5-sepolia-v2-workflow.json`): the new Stacker and the **ProjectRegistry** (`src/ProjectRegistry.sol`, oracle-decided listing on Intake v2) from the `sepolia` branch, on the live TestIMD/TestSIMD, plus a new test page that reads the registry. After it's live, PLEA's next version credits through the Stacker and applies to the registry (first trial; steps in `docs/design.md`).

- **Listing:** `docs/listing.md` (steps, checklist, fee guard, `toBlock` delisting) and the GitHub form `.github/ISSUE_TEMPLATE/listing-application.yml`. The ProjectRegistry (Intake v2, failure callback) is designed in `docs/design.md`; its first trial is on Sepolia with PLEA's next version.

## What's next (ask me before paying for any job)
1. List PLEA. 2. Mainnet Stacker (PLEA mainnet needs its address). 3. Indexer and mainnet dashboard. 4. Multichain route, Robinhood Chain first (`docs/design.md`, "Multichain"). 5. v2 ETH route, when an ETH-fee project wants in. 6. ProjectRegistry, when more than one or two projects want listing. Open questions are in `docs/design.md`.

## Useful facts
- IMD docs https://imd.fun/docs/llms.txt · API https://api.imd.fun · free checks `POST /requests/import` and `POST /requests/check` · my orders `GET /requests/paid-by/0xf8ad3f88b0e0d177aa8c5e6be1e13410fd41cdc7` (jobs are paid from that wallet).
- **Hosting:** set it only with the job's `ipfs` field; never ask the agent to host or deploy in the text.
- Sepolia RPC `https://ethereum-sepolia-rpc.publicnode.com` for state; for old logs use `https://rpc.sepolia.ethpandaops.io` (publicnode prunes them). Ethereum: `https://eth.drpc.org` or `https://ethereum-rpc.publicnode.com`.
- Foundry: download `foundry_v1.8.3_linux_amd64.tar.gz` from the GitHub release into `~/.foundry/bin` (`foundryup` is blocked). IMD launches need `bytecode_hash = "none"` in `foundry.toml`; keep `[lint] lint_on_build = false`.
- Test/owner wallet `0x4b91078b2374c956a65f7af0999cae0a935e6821`: its key is in env `TESTNET_KEY` if set. Testnet only.

## Rules
- **Explain simply.** When I need to choose, recommend one option.
- **Don't change agreed numbers** (cashback 0.25%–1% chosen by each project, the fee guard, faucet amounts, points rules, the multichain tip up to 2% over 12h) without asking me.
- **Keys:** never print or commit `TESTNET_KEY`; never ask me for a mainnet key.
- **PLEA** (`khaed1/plea`, `khaed1/plea-site`) belongs to the other session: read only, don't push.
- **PondPad** (branch `claude/bold-gauss-qhlw86` in `khaed1/claude`) is read-only. Never commit its code.
