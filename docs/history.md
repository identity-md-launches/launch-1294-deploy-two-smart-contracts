# imd/acc history

What happened so far, oldest first, with the checks behind each step. Moved here from the shared `HANDOFF.md` in `khaed1/claude`.

## 1. Sepolia launch (2026-10-09)

- **Job:** `640b4951-f512-4415-ab2e-944462a2f5ba`, launch #1129 (`8e1fcd97-a3ff-4f90-adb8-3dc15b2dc2f1`), prompt [`jobs/1-sepolia-launch.md`](../jobs/1-sepolia-launch.md) with owner `0x4b91…6821`. All 8 steps were accepted: build, tests, manifest, four audits and the judge, an independent review and reproducible bytecode. Code: [launch-1129 repository](https://github.com/identity-md-launches/launch-1129-build-imd-acc-sepolia-test), commit `934fb404`.
- **Parked first.** IMD's preflight estimated 23,701,870 gas, over the 16,777,216 per-transaction cap (EIP-7825). That was IMD's Sepolia deploy path, not the code: a real deploy of all three contracts costs 3,082,437 gas. The IMD dev unparked it.
- **Live** at block 11,874,601 (tx `0x9512b5df4f5711989f0436343d14bf30cd2e9d664d43aedfc6a4c1845fe4c0f0`, 23,509,044 gas):
  - TestIMD `0x2b69099e59b05901faa1dd164fabf098bf831e82`
  - TestSIMD `0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1` (owner `0x4b91…6821`)
  - Stacker `0x293c7134ab8f6bf1d8ff44ed806575f8f1baf477`
- **Verified on chain:** the runtime code equals our build (TestIMD exactly; TestSIMD and the Stacker once their immutables are masked), the immutables point at the right contracts, and the Stacker's max allowance to the vault is set.
- **Independent check, all clean:**
  - Rebuilt with forge 1.8.3 (the verifier's version): all three contracts reproduce the attested creation and deployed bytecode exactly.
  - All 76 tests pass, including invariants and fuzzing.
  - TestSIMD's logic is identical to the live StakedIMD; only the name, symbol and pragma differ. The vendored Solady files are byte-identical to the vault's verified sources, and the OpenZeppelin files are identical to the official v5.1.0 release.
  - Slither's 7 results are all expected: strict equalities (the one-block hold, the faucet's never-used check), timestamps (the 24h faucet), and state written after the vault call in `credit`, which `nonReentrant` and the fixed, trusted token and vault cover.

## 2. Test page (2026-10-09)

- **Job:** `5530dde0-f0f2-45c2-b18d-ea718fc458de` (`job.continue`, skill `build-website`), prompt [`jobs/2-sepolia-site.md`](../jobs/2-sepolia-site.md). Delivered as PR #2, commit `7de7d635`; Vite + TypeScript in `site/`, built into `dist/`, with `config.json` and `projects.json` read at run time.
- **Hosted** at https://imd-acc-sepolia-test-run.site.identitymd.eth.limo (CID `bafybeic2skjuhsi5le5kt4sfya7sitdbn4g2jpctfzosxjdvt45iuxwyr4`). IMD named it `imd-acc-sepolia-test-run`, not the requested `imd-acc-test`.
- **Tested on a local Sepolia fork** with the delivered `dist/` and a scripted wallet: connect, faucet, the 24h cooldown, approve + credit, then the stack, tsIMD and its value, recent stacks and vault totals all updated. A listed project's credit earns points; self-stacks show "direct, no points"; a `fromBlock` after the credit gives 0 points. All 19 hard-coded selectors match the contracts. No page errors, no horizontal scroll at 360 px.
- **Live Sepolia test** with the owner wallet:
  - faucet tx `0x23a62183…94bb`: 10,000 tIMD; a second call reverts with `FaucetCooldown`
  - approve + `credit(self, 100 tIMD)` tx `0xaabe6a70…3252`: 100 tsIMD to the trader, a correct `Stacked` event and totals, the Stacker left with 0 tIMD and 0 tsIMD, and the one-block hold confirmed (redeemable 2 blocks later)
  - a second credit of 1 tIMD (tx `0x73580d51…0705`)
- **Sepolia gas is unusually high for new storage:** the first `credit` for a new trader used 1,161,856 gas, the second 182,644; the faucet 349,871; an approve 128k.
- The owner wallet's key was shared in chat for this test. It stays testnet-only.

## 3. PLEA, the first integration (2026-10-09 to 10-11)

PLEA is a sell-gated meme token on Uniswap v4 (its own repository, `khaed1/plea`). Its hook pays imd/acc cashback on every trade.

- **First PLEA test run** (launch #1148, hook `0x37337cd25f09a1cb77bba55d12358c9d00e2e8cc`): cashback was owed, then settled, then claimed by the trader, never paid at trade time. Three buys; their cashback reached the Stacker in two credits, 0.1026 tIMD. This hook stays unlisted.
- **Lesson from its site test:** the hook called `credit` only when `gasleft()` was above a reserve and paid plain tIMD otherwise. A wallet's gas estimate picks the cheapest path that succeeds, so normal wallets never got sIMD. **Rule for integrators:** check gas up front (revert if it's short) instead of letting the amount of gas choose a path without cashback.
- **PLEA v10** fixed both: its hook `0x3d4CcAc329010b8beA3b14498d9a45EAB00c68Cc` (deployed at block 11,885,872, tx `0x1379a47d…a00c`) credits the cashback **inside the same swap**, and checks at the start of `beforeSwap` that the swap has the credit gas (1.3M on Sepolia) plus a 1M reserve.
- **Live results:** buy A, 20 tIMD: 0.0596 tIMD stacked in the same swap. Buy B: the first cashback for a new wallet, 0.0936 tIMD. Two approved sells added 0.0093 and 0.0050 tIMD (PLEA pays cashback on sells too).
- **Sepolia gas under the new schedule:** a first credit to a new trader estimates about 698k gas, a repeat about 229k; approvals to a new spender 100k–130k. Wallets should use estimates ×1.3.

## 4. imd/acc gets its own session (2026-10-11)

- **Live state** at Sepolia block 11,889,292: 101.27 tIMD stacked in total, 0.1674 of it from PLEA v10's hook in 4 credits (traders `0x4b91…6821` and `0x0c85…7b7b`), vault open.
- **Listing PLEA:** [`jobs/3-list-plea.md`](../jobs/3-list-plea.md) is ready. Tested before paying: the delivered `dist/` with PLEA in `projects.json`, served locally in Chromium against live Sepolia. PLEA is listed, its 4 stacks marked "listed", top stackers `0x0c85…7b7b` (0.1 points) and `0x4b91…6821` (0.06), PLEA 0.1674 tIMD from 2 traders, no console errors, no overflow at 360 px. `/requests/check`: no blockers.
- **publicnode prunes old logs:** `eth_getLogs` from block 11,874,601 answers "pruned history unavailable" (code 4444). The page falls over to the next RPC; the listing job puts ethpandaops first. Scripts that read logs should use `https://rpc.sepolia.ethpandaops.io` or `https://sepolia.rpc.sentio.xyz`.
- **Mainnet:** [`jobs/4-mainnet-launch.md`](../jobs/4-mainnet-launch.md) is ready. IMD and sIMD were read on chain, and the exact Stacker was tested on a mainnet fork (see [design notes](design.md#ethereum-mainnet-ready-not-paid)). `/requests/check`: no blockers.
- **Intake v2** (`0xa43e6f75ee006411f79ac1c84120606c2330de82`, the same address on Ethereum, Sepolia and Robinhood Chain) was announced by the IMD dev. imd/acc only needs it for the future ProjectRegistry.
- **Moved** from `khaed1/claude` (`imd-acc/`) into this repository.

## 5. Lean mainnet Stacker and the multichain design (2026-10-11)

- **Decided in discussion:** the mainnet Stacker drops per-trader totals (points and the dashboard come from events); project points are the cashback a project paid, counted only for credits inside a swap on its pool; other chains use per-trader waiting balances delivered to Ethereum through IMD's own LayerZero bridge, paid by a tip of up to 2% rising over 12 hours. Details in [design notes](design.md#project-points-and-the-dashboard).
- **Mainnet Stacker written here** (`src/Stacker.sol`), with the launch-1129 tests adapted: per-trader checks now rebuild the figures from the events, the way the dashboard will. 42 tests pass; the 3 mainnet-fork tests pass against live IMD and sIMD.
- **Launch blocker avoided:** IMD rehearses constructors on an empty chain, where the mainnet IMD and sIMD have no code. The Sepolia constructor calls `sIMD.asset()` and would have reverted there. The mainnet constructor checks and approves only where the vault has code; `test/Deployment.t.sol` covers both cases.
- **Gas on a mainnet fork** (whole transactions): deploy 446,090; first credit ever 181,625; new trader 130,313; repeat trader 96,113. The Sepolia version measured 197k and 112k for the same calls.
- **IMD bridge facts** for the multichain route: OFT v2 linked to Arbitrum, Base and Robinhood Chain (eid 30416); compose supported, no message inspector; 6 shared decimals.
- The mainnet job ([`jobs/4-mainnet-launch.md`](../jobs/4-mainnet-launch.md)) now imports this repository instead of the launch-1129 one.

## 6. Sepolia test run 2 prepared (2026-10-11)

- **Plan (the user's):** test the new Stacker on Sepolia first, then PLEA's next version credits through it, then mainnet.
- **Reuses the live TestIMD and TestSIMD** of launch #1129: PLEA keeps the same tIMD, faucet balances carry over, the vault can still be paused for fallback tests, and only one contract is deployed.
- **Branch `sepolia`** (commit `03284ea`) differs from `main` only in `launch.json`. New `test/SepoliaFork.t.sol` passes against the live pair (credit, event, totals, paused-vault revert and recovery).
- **Two ready shapes**, both with no blockers at `/requests/check`:
  - `jobs/requests/5-sepolia-v2-workflow.json` (`workflow.open`): audit as it arrived, adapt, independent review, deploy, build and host a new test page (label `imd-acc-sepolia-v2`). It needed plain wording: "deploy one smart contract", what it does, and that publishing the site is approved and done by the platform, not the builders.
  - `jobs/requests/5-sepolia-v2-launch-only.json` (`launch.open`): the full audit panel, contracts only.
- **The new page reads `listings/sepolia.json` from this repository**, so listing PLEA's next hook there is a commit, not a paid job. The old listing job (`jobs/3-list-plea.md`, for the first page and PLEA v10) is no longer needed.

## 7. Cashback rate opened to 0.25%–1% (2026-10-11)

- **Decided:** each project picks its cashback rate between 0.25% and 1% (was a fixed 0.5%; PLEA keeps 0.5%). Points stay 1 per IMD stacked, so a higher rate gives traders more points.
- **Guard:** the part of a project's fee that really leaves it (liquidity, burns, prizes) must be at least its cashback, so self-trading for points always costs more than it returns. Listings state `rateBps`; the indexer flags credits that don't match it.
- **No contract change:** the Stacker stakes whatever amount it's sent. The README, design notes, explainer, session brief and the texts of jobs 4 and 5 were updated, and the requests re-checked.

## 8. Listing guide and the ProjectRegistry design (2026-10-11)

- **Listing today:** `docs/listing.md` (steps, checklist, the fee guard with PLEA's numbers, when points start, delisting with `toBlock`, per-credit checks) and a GitHub application form. The Sepolia run 2 site brief now honours `toBlock`.
- **ProjectRegistry:** designed in `docs/design.md` on Intake v2 (`0xa43e…de82`, code checked on Sepolia and mainnet; callback gas 1M on Sepolia, 200k on mainnet). `requestWithFailure` lets a refused or split panel clear the pending application at once; failures are unsigned, so they never list, delist or move value. No Stacker redeploy: the site and indexer read the registry instead of the file.
- **Next:** a Sepolia trial with PLEA's next version as the first applicant, plus negative cases, a no-answer case and a challenge.
