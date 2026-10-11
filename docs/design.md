# imd/acc design notes

The [README](../README.md) is the overview. This file keeps the design detail and the reasons behind each decision: the parts of the system, how points and the dashboard work, the multichain route, the planned ETH route and project registry, the launch settings and the open questions.

## Building blocks

| Part | What it does |
|---|---|
| `Stacker` (shared contract) | `credit(trader, imdAmount)`: pulls IMD from the caller and calls `sIMD.deposit(amount, trader)`. The caller is the project. Emits `Stacked(project, trader, imd, shares)` and keeps per-project totals on chain. No owner; the IMD and sIMD addresses are immutable. Deposits on every credit. |
| Integration rule | The project wraps `credit` in `try/catch`. If it fails (vault paused, anything else), the hook sends the cashback to the trader as plain IMD instead, so **a trade never reverts because of imd/acc**. |
| Drop-in hook (planned) | For IMD pools without their own hook. Takes the cashback in IMD in `afterSwap` and calls `credit`. Includes the `afterSwap` logic that Uniswap's frontend whitelisting needs (a btc/acc lesson). |
| Trader identity | The router passes the real trader in `hookData`. Fall back to `sender`; never use `tx.origin`. |
| Site | "Your stack" (sIMD from cashback, per project, and its IMD value now), plus leaderboards for top stackers and top projects. |

## Which projects earn points

Anyone can call `credit` with their own IMD. That is just staking for someone, and it can't be blocked without giving the Stacker an owner. So points are counted, not gated: the Stacker records everything, and only credits from **listed projects** earn points. Every `Stacked` event names its project, so the list can be applied at any time.

**Today (decided): a list file.** Credits from anything not on the list show as "direct, no points". Real trading points already cost money (fees paid to trade), so the only cheap attack was a fake project, and the list closes it. The first test page shipped its own `projects.json`; from Sepolia test run 2 the list is a file in this repository, `listings/<chain>.json`, so a listing is a commit, not a paid job. How a project applies, the checklist, the fee guard and delisting with `toBlock` are in [listing.md](listing.md).

**Points start at listing.** A listed project's credits earn points only from its `fromBlock`, never retroactively, so nobody can build fake history and then get approved. A project reviewed before or at launch gets its deploy block (PLEA's case).

**Later: the IMD panel decides the list** through the ProjectRegistry, below. The Stacker never changes.

## The ProjectRegistry

**Planned (2026-10-11); its first trial runs on Sepolia with PLEA.** A small contract with **no owner** replaces the list file, so nobody decides alone. **Nothing is redeployed:** the Stacker doesn't know about listings, so the site and the indexer read the registry's events instead of the file. The registry ships as its own small `evm_contracts` job.

**Oracle: IMD's Intake v2**, `0xa43e6f75ee006411f79ac1c84120606c2330de82`, the same address on Ethereum, Sepolia and Robinhood Chain (code checked on Sepolia and mainnet, 2026-10-11). It keeps every v1 function and adds `requestWithFailure(action, body, callback, onFailure, asset, amount)`, which also reports when the panel gives no answer. Callback gas: 200,000 on mainnet, 1,000,000 on Sepolia (`callbackGas()`, read 2026-10-11).

**Stored per project:** status (none, pending, listed, rejected, delisted), name, source URL, `rateBps`, beneficiary, `fromBlock`, `toBlock`, and the pending oracle request id.

**1. Apply.** `apply(project, name, sourceUrl, rateBps, beneficiary)` pays the oracle fee (0.5 IMD) and sends the question with `requestWithFailure`. One pending application per project at a time. The question and its hash are computed here, not in the callback.

> Is `<project>` on `<chain>` a real trading project whose verified source pays imd/acc cashback through `Stacker.credit`, out of fees its traders pay, at `<rateBps>` of each trade (25 to 100), with the part of its fee that really leaves the project at least as large as the cashback? Reject wallets, contracts that credit their own IMD, and wash-trading setups.

Evidence: the verified source URL, the address and chain, the stated rate and beneficiary. `answerType: bool`, a panel like PLEA's.

**2. Answer (callback, status 0).**
- Only Intake v2 may call it, and only for the pending request id.
- It checks the signed attestation the way PLEA's gate does: EIP-712 domain "IdentityMD Oracle" version 2 with this chain and contract, the oracle signer `0x5598aa9146215bc13eb26f2c692ad1461fd32982`, and the question hash stored at apply time.
- **Yes:** listed, `fromBlock` = this block, event `Listed`. **No:** rejected, event `Rejected`; the project may apply again.
- It stores the verdict and nothing more, so it fits the 200k gas mainnet gives callbacks.

**3. No answer (failure callback, status 1 refused or 2 no agreement).**
- `onFailure(requestId, status, reason, agreed, answered, signature)` from Intake v2, for our pending id only, clears the pending application, so the project can apply again at once.
- Failures are not signed yet (IMD dev, 2026-10-11), so a failure **never** lists, delists or moves value. The oracle fee is spent either way.
- This replaces the manual clear PLEA needed when plea #3 split the panel.

**4. Challenge.** Anyone calls `challenge(project, reason)` and pays the oracle fee. The panel answers "does this listed project still meet the rules?" **No:** delisted, `toBlock` = this block, event `Delisted`; earlier points stay. A failure only clears the pending challenge. One pending challenge per project.

**Open details:**
- Who may apply for a project. **Recommendation:** anyone, one pending at a time; each application costs its sender 0.5 IMD, and the panel rejects wrong data.
- An application fee on top of the oracle fee, and a challenge bond against spam.
- One registry per chain, or one on Ethereum listing projects on every chain.
- The oracle fee token on Sepolia: on 2026-10-09 it was the test IMD `0x44a1cd38474fb1748400e7deb5f8d786cce3f89a`, which anyone can mint. Confirm with Intake v2 before building.

**Sepolia trial with PLEA:**
1. Deploy the registry on Sepolia, wired to Intake v2.
2. PLEA's next version, crediting through the Stacker of test run 2, applies at 50 bps with its beneficiary. Expected: yes.
3. Negative cases: a plain wallet, and a contract that credits its own IMD. Expected: no.
4. A no-answer case, to see the failure callback clear the application.
5. A challenge against PLEA. Expected: it stays listed.
6. The test page reads the registry instead of `listings/sepolia.json`.

## Points now, token maybe later

v1 has **no token**:
- The product is IMD, and a second token would compete with it.
- imd/acc takes no cut, so a token would have nothing behind it.
- Projects adopt a neutral tool more easily.

What v1 does keep is a full **points record** from day one. Every `Stacked(project, trader, imd, shares)` event counts:
- **Trader points**: the IMD stacked for them, all-time, across all listed projects.
- **Project points**: the IMD its traders stacked.

This history drives the leaderboards. If imd/acc takes off, it's the basis for a later token, launched through the IMD swarm and **airdropped to early stackers and integrating projects**. Nothing is promised: points are a record, not a claim. A token would only make sense if imd/acc adds something for it to back, such as a small protocol cut, an integration-incentive budget, or a vote on featured projects.

## Cashback rate: 0.25% to 1%, chosen by each project

**Decided 2026-10-11** (it was a fixed 0.5%). Each project picks its rate between 0.25% and 1% of each trade. Lower lets projects with thin fees join; higher lets projects attract traders. PLEA uses 0.5%.

- **No contract change.** The Stacker never checked the rate: it stakes whatever amount the project sends. The rate is a listing rule.
- **Points stay "1 per IMD stacked".** A project with a higher rate gives its traders more cashback and so more points. Points stay tied to real IMD that reached traders, which is easy to verify for any kind of project.
- **The guard against farming.** A project owner who trades with themselves gets back the cashback and their own share of the fee. So the part of the fee that really leaves the project (to liquidity providers, burns, prizes) must be at least as large as the cashback. Then farming points always costs more than it brings back. PLEA: 0.5% cashback, 0.75% to liquidity, burn and prizes.
- **Listing.** Each listing states the rate (`rateBps`, 25 to 100). The listing check (the list file now, the ProjectRegistry panel later) reads the project's verified code to confirm the rate and the guard.
- **Indexer.** It compares each credit with the swap in the same transaction and flags credits that don't match the stated rate; those earn no points.
- **Dashboard.** Each project's rate is shown next to its name, so traders can compare.
- **Gas.** At 0.25%, a credit's gas (about 2¢ for a new trader today) is outweighed by the cashback on trades above about $10, against $5 at 0.5%.

## Project points and the dashboard

**Decided 2026-10-11.** Points and every dashboard figure come from the `Stacked` events. The mainnet Stacker stores only per-project totals on chain.

**Why not store per-trader totals on chain:** they repeat what the events already record, and they can't be the points anyway, because they count everything (unlisted projects, direct self-stacks, credits before a project was listed). Dropping them makes every credit cheaper (mainnet fork, whole transactions):

| Stacker | New trader | Repeat trader |
|---|---|---|
| Sepolia version (per-trader totals on chain) | 197k gas | 112k gas |
| Mainnet version (this repository) | 130k gas | 96k gas |

The only thing lost is that another contract can't ask the Stacker directly for one trader's total. A later airdrop would use a snapshot of points with claim proofs anyway.

**Project points** are the IMD cashback a project paid its traders. It's real IMD that left the project, so it can't be faked cheaply. Rules for the indexer:
- Count a project's credit only when the same transaction also has a swap on that project's pool, so a project can't credit its own wallets for points. Trading back and forth already costs more in fees than it earns.
- Show next to it: the project's rate, unique traders, number of trades, estimated volume (cashback ÷ the project's rate), all-time, 7-day and 30-day.
- Each listing carries a `beneficiary` wallet (in `projects.json` now, in the registry later), because the project address is a hook contract that can't receive an airdrop.

**What a trader sees**, all from our site:
- cashback received, points and the split per project: their events;
- sIMD held now: the vault's `balanceOf`, live;
- what their cashback is worth today: the shares recorded in their events, priced by the vault's `convertToAssets`, live. This values only the cashback shares, even if they hold other sIMD;
- earned on top: worth today − cashback received.

**Where the list lives (2026-10-11, test run 2):** the new test page fetches `listings/sepolia.json` from this repository on GitHub (CORS is open), with a bundled copy as fallback. Each entry is `{address, name, fromBlock, rateBps, beneficiary}`. Listing a project is a commit, instead of a paid site job each time. The trust is the same as before (whoever controls the list); the ProjectRegistry replaces it later.

**Indexer:** the test page scans events in the browser, which is fine for hundreds of events and too slow for thousands. IMD's `build-ponder-indexer` skill builds an indexer that keeps every chain's events in a table and serves the site. Order: mainnet Stacker, then the indexer, then the mainnet dashboard.

## Multichain: cashback from other chains

**Decided 2026-10-11 (design; not built yet).** The sIMD vault exists only on Ethereum. On other chains, cashback waits per trader on that chain and is delivered to Ethereum as sIMD through **IMD's own LayerZero bridge**. Robinhood Chain comes first (PondPad), then Base and Arbitrum.

**Facts checked on chain (2026-10-11):**
- IMD on Ethereum is a LayerZero OFT (v2) linked to Arbitrum (eid 30110), Base (eid 30184) and Robinhood Chain (eid 30416, IMD `0x5f7b…7127`). No new bridge is needed; anyone holding IMD on those chains already trusts it.
- It supports send-and-call ("compose") and has no message inspector blocking it.
- It moves amounts in steps of 0.000001 IMD (6 shared decimals); smaller dust stays on the source chain.
- Its enforced options cover only plain sends (60k gas on arrival), so a send-and-call must carry its own gas options.
- Ethereum's LayerZero endpoint is `0x1a44076050125825900e736c501f859c50fE728c` (eid 30101).
- IMD can launch on Sepolia, Ethereum and Robinhood Chain today, not yet on Base or Arbitrum.

**Two new contracts, both with no owner:**

| Contract | Where | What it does |
|---|---|---|
| `RemoteStacker` | each other chain | Same `credit(trader, imdAmount)` as on Ethereum, so integrating is identical. Pulls the IMD, adds it to the trader's waiting balance, and emits `Queued(project, trader, imd)` at once: that is the points record. Its `flush(traders)` sends waiting cashback to Ethereum. |
| `StackReceiver` | Ethereum | Receives the IMD plus the list "trader → amount" and calls `sIMD.deposit(amount, trader)` for each. |

**How the waiting cashback is stored:** in the RemoteStacker. The IMD sits in its own balance; for each trader it records the amount waiting and the waiting clock. All of it is public.

**Who can do what:**

| Who | Can | Can't |
|---|---|---|
| A project | add IMD for a trader, from its own IMD | take anything out |
| Anyone | call `flush` with up to 50 traders and earn their tips | choose where it goes or change an amount |
| A trader | flush their own cashback right away, paying the bridge fee | anything else |
| Us, or any owner | nothing: no owner, admin, pause or upgrade | withdraw, redirect or freeze |

The only way out is to the StackReceiver, whose address is fixed at deploy. The tip is computed by the contract, never chosen by the caller. IMD's bridge is configured by the IMD team; that's the one outside trust.

**No fixed batches.** An earlier draft sent batches in order, so 50 junk entries with almost no value could block every batch behind them. Instead, each trader has their own waiting balance and whoever flushes picks up to 50 of them. Junk just sits and blocks nobody.

**The tip (decided 2026-10-11):** each trader's tip is 2% × (hours waiting ÷ 12) of their waiting cashback, at most 2%. It goes, in IMD, to whoever flushes, who pays the bridge fee (in the chain's gas token).
- The clock is the amount-weighted average arrival time, so new cashback doesn't inherit an old clock.
- The same rule applies to every amount. The trader always gets at least 98%, and usually more: someone flushes as soon as the tips cover their cost (about $1 for 50 traders at today's Ethereum gas, an estimate), and a big waiting balance or many traders together get there sooner.
- On a quiet chain, small amounts may wait longer than 12 hours, but the cut stays at 2%.
- imd/acc takes nothing. On Ethereum there is no tip: the cashback is staked inside the trader's own swap.

**Rules both contracts must follow:**
1. **Balance always matches:** the RemoteStacker's IMD equals the sum of all waiting balances, apart from tips already paid out.
2. **Atomic flush:** if anything fails (bridge fee too low, a revert), every waiting balance stays exactly as it was.
3. **No double pay:** a trader listed twice in one flush is delivered once (the second entry finds nothing waiting).
4. **Dust stays with the trader:** each delivered amount is rounded down to the bridge step; the rest stays in that trader's waiting balance.
5. **The contract sets the Ethereum gas** for the delivery (a base plus a fixed amount per trader), not the caller, so nobody can buy too little gas on purpose. If delivery still fails, anyone can retry it through LayerZero with more gas.
6. **The receiver** accepts only calls from LayerZero's endpoint for IMD's own token. It hands out only the IMD that arrived in that message, and only if the listed amounts add up to it; a sender that lies about its own IMD can only lose its own IMD. If a deposit fails, that trader gets plain IMD on Ethereum. It keeps no IMD after a delivery.
7. **Smart-contract wallets** (a Safe, some smart wallets) may not exist at the same address on Ethereum. They're paid plain IMD on their own chain at once, unless they register an Ethereum address for themselves. Plain wallets, including EIP-7702 ones, go through the queue.
8. **Points** are counted on the chain where the trade happened, when it happened. A slow or retried delivery never changes points.
9. **Launchable:** no constructor may revert on IMD's empty-chain rehearsal.

**How we make sure it's right:** spec (this section) → contracts with unit, fuzz and invariant tests (rules 1–4 as invariants), LayerZero's test helpers for the bridge, and forks of Ethereum and Robinhood Chain with the real IMD and sIMD → IMD launches (StackReceiver on Ethereum, RemoteStacker on Robinhood Chain) with the four-specialist audit, judge and independent review → a small live test with a few IMD → PondPad integrates.

**Accepted trade-offs:** the trader's sIMD lands on Ethereum, not on their own chain; delivery waits for the next flush; and it relies on LayerZero and IMD's bridge setup. A later step could send bridged sIMD back to the trader's own chain, or use local vaults if the IMD team deploys sIMD on other chains (worth asking them).

## Who pays the gas

- **On Ethereum:** the trader, inside their own swap. The project pays no extra gas, and imd/acc has no treasury or relayer. With the mainnet Stacker that is about 0.11M gas for a new trader and 0.075M for a repeat one, beyond the base cost of the swap: under 2¢ at today's 0.06 gwei and ETH at $2,505.
- **On other chains:** the trader's own swap pays the small local `credit`; delivery to Ethereum is paid by the tip above.
- **The v2 ETH route** would use the same rising tip for its `flush()`.

## v2: projects whose fees are in ETH

**Not built yet.** The first projects (PLEA, PondPad) collect their fees in IMD, so they can deposit straight into the vault. Projects paired with ETH, or with fees in ETH, use a batched route instead:

1. **On each trade**, the hook takes its cashback in ETH and calls `creditETH(trader)`. The ETH is recorded as the trader's `pendingETH`. Nothing is swapped yet, so it costs little gas.
2. **`flush()`** can be called by anyone, for a small tip like POOL4's keepers get. It:
   - swaps the pooled ETH to IMD in one trade through **POOL4**, IMD's main IMD/ETH pool
   - deposits that IMD into sIMD
   - gives each trader shares in proportion to their `pendingETH`
3. The trader's sIMD goes up after each flush.

Safety rules:
- **Price guard:** the swap must return at least a minimum amount of IMD, measured against a recent average price (TWAP) rather than the price at that moment.
- **Maximum batch size** per flush, so one flush can't move POOL4's price much.
- **Pending ETH can't go anywhere else.** It can only be swapped and credited to the trader it was recorded for.
- The order is fixed: the swap happens first, then shares are split, with rounding in the vault's favour.

Why not swap on every trade: a second swap inside each trade roughly doubles gas on Ethereum, and small swaps made mid-trade are easy to sandwich. One guarded batch avoids both.

Side benefit: POOL4 burns a cut of IMD on its trades, so every flush also burns some IMD.

## Decided

- **Owner:** the Stacker has none, and its IMD and sIMD addresses are immutable. TestSIMD keeps an owner on Sepolia only, so integrators can pause it and test their fallback; mainnet uses the real, renounced sIMD.
- **Gas:** v1 deposits on every credit. Batching comes in v2 with the ETH route.
- **Build:** an IMD `evm_contracts` launch, shipped before PLEA so PLEA could reuse its addresses.
- **Points:** listed projects only, from their `fromBlock` (see above). 1 point per IMD stacked.
- **Cashback rate:** 0.25% to 1% of each trade, chosen by each project and funded from its existing fees (was a fixed 0.5% until 2026-10-11; see above).
- **Mainnet Stacker (2026-10-11):** the lean version in this repository: per-project totals on chain, per-trader figures from events. The constructor checks the vault and approves it only where the vault has code, so IMD's empty-chain rehearsal passes.
- **Dashboard (2026-10-11):** points, leaderboards and each trader's cashback, value and yield come from the events plus live vault reads, served by an indexer.
- **Multichain (2026-10-11):** per-trader waiting balances on other chains, delivered to Ethereum through IMD's bridge, paid by a tip of up to 2% that rises over 12 hours.

## Open questions

1. **Is an sIMD vault planned on Robinhood Chain?** IMD exists there (`0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127`, the same OFT), but no vault does. **Recommendation:** ask the IMD team whether they will deploy StakedIMD there; until then PondPad pays its cashback as plain IMD. A Stacker on Robinhood Chain is a one-contract launch once a vault exists.
2. **Should sells get cashback too, or buys only?** (PLEA pays it on every trade.) **Recommendation:** both. Every trade pays a fee, so every trade funds its 0.5%; wash trading for points still loses money, because the fees on a round trip are larger than the cashback.
3. **An application fee for the ProjectRegistry**, on top of the 0.5 IMD oracle fee?

Known and harmless: a credit mints sIMD to the trader, and the vault's one-block hold then stops that trader from redeeming in the same block. Anyone can already do this by depositing into the vault for someone, so the Stacker adds nothing new.

## Launch settings

### Sepolia (launch #1129, live)

| Field | Value |
|---|---|
| Action | `launch.open` |
| Launch type | Smart contracts (`evm_contracts`) |
| `chainId` | `11155111` (Sepolia) |
| `owner` | `0x4b91078b2374c956a65f7af0999cae0a935e6821` (TestSIMD's owner, who can pause it to test the fallback) |
| Contracts, in order | `TestIMD`, `TestSIMD`, `Stacker` |
| `ipfs` | `"imd-acc-test"` (IMD named the site `imd-acc-sepolia-test-run`) |
| `github` | `true` |
| `references` | `evm-contracts-launch`, `defi-native`, `eth-security`, `eth-testing`, `eth-frontend-ux`, `better-interface`, `pashov-skill`, `solidity-security-review` |
| Prompt | [`jobs/1-sepolia-launch.md`](../jobs/1-sepolia-launch.md) |

### Ethereum mainnet (ready, not paid)

| Field | Value |
|---|---|
| Action | `launch.open` |
| Launch type | Smart contracts (`evm_contracts`) |
| `chainId` | `1` (Ethereum mainnet) |
| Source | `repoUrl` this repository, `khaed1/imd-acc`, at the commit in [`jobs/requests/4-mainnet-launch.json`](../jobs/requests/4-mainnet-launch.json) (checked with `POST /requests/import`) |
| Steps | `chain`: `audit-imported-code`, `adapt-contract-project`, `adversarial-review` (IMD adds tests, the manifest, four audit specialists and the judge). A launch from a repository must start with `audit-imported-code` and end with a review. |
| Contracts | `Stacker` only, `(0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7, 0x9efa934d9fad4ae28c998a40195646b965a97247)` |
| `owner` | none needed (the Stacker has no owner) |
| `ipfs` | none (a mainnet page comes later, as a `job.continue`) |
| `github` | `true` |
| `references` | `evm-contracts-launch`, `defi-native`, `eth-security`, `eth-testing`, `pashov-skill`, `solidity-security-review` |
| Prompt and request | [`jobs/4-mainnet-launch.md`](../jobs/4-mainnet-launch.md), [`jobs/requests/4-mainnet-launch.json`](../jobs/requests/4-mainnet-launch.json) |

Facts behind it (read on chain 2026-10-11, Ethereum block 26,166,812):
- **IMD** is a LayerZero OFT (`BridgedFP`): a standard 18-decimal ERC-20, no transfer fee, no pause. Its owner can only rename it and manage bridge peers.
- **sIMD** (`0x9efa…7247`): ERC-4626 over IMD, so anyone can deposit for a `receiver`. Decimals 24 (offset 6), `owner()` = 0x0 (renounced, so its pause and rescue powers are gone), `paused()` = false, about 1.82M IMD staked. One-block hold: any positive mint stamps the receiver, who can't withdraw or redeem in that block. The vault is on **Ethereum only**.
- **Mainnet fork test** of this repository's Stacker: deploy 446,090 gas. `credit` to a new trader 130,313 gas (181,625 for the very first credit, which also creates the project's totals), a repeat credit 96,113 (whole transactions, 21k base included). `test/MainnetFork.t.sol` checks the shares, the value, the one-block hold and that the Stacker keeps nothing.
- It differs from the live Sepolia Stacker only by the removed per-trader totals and the constructor's empty-chain case.

## Lessons from btc/acc

From TokenWorks' own write-up of [btc/acc](https://www.token.works/archive/btcacc):
- Make the hook pass Uniswap's whitelisting (the `afterSwap` logic) and support router `msgSender` and `hookData`.
- Own the main buying path. Each project's site swaps through its own hooked pool.
- Warn users about copycat v2/v3 pools.
- Fund the cashback from existing fees. Don't charge extra: apps rarely add a fee that only benefits their users.
