# imd/acc

**Trading cashback in staked IMD.** Every trade in a participating project sends 0.5% of the trade back to the trader as sIMD, IMD's staking-vault share, deposited straight into the trader's wallet, where it keeps earning the vault's yield.

| | |
|---|---|
| **Status** | Live on Sepolia (launch #1129). First integration, PLEA, live there too. Mainnet Stacker written and tested here; launch ready. |
| **Test page** | https://imd-acc-sepolia-test-run.site.identitymd.eth.limo |
| **Contract code** | [`src/Stacker.sol`](src/Stacker.sol) in this repository (the mainnet version). The Sepolia launch's code, built and deployed by the [IMD swarm](https://imd.fun), is in the [launch-1129 repository](https://github.com/identity-md-launches/launch-1129-build-imd-acc-sepolia-test). |

## Contents

1. [Why imd/acc](#why-imdacc)
2. [How it works](#how-it-works)
3. [The Stacker contract](#the-stacker-contract)
4. [Deployments](#deployments)
5. [Points](#points)
6. [Integrating a project](#integrating-a-project)
7. [Projects](#projects)
8. [Roadmap](#roadmap)
9. [Repository layout](#repository-layout)
10. [Build and test](#build-and-test)
11. [Credits](#credits)

## Why imd/acc

- **No new token.** The cashback is IMD, staked. There is nothing else to buy.
- **No custody.** imd/acc never holds the cashback. The vault mints the shares directly to the trader.
- **No extra fee.** Projects pay the 0.5% out of fees they already charge, so traders pay nothing on top and projects don't have to add a new fee.
- **No owner.** The shared contract has no admin, no fee, no pause and no upgrade.

## How it works

```
 trader ── trades ──► project's pool and hook
                          │  takes 0.5% of the trade in IMD, out of its own fee
                          ▼
              Stacker.credit(trader, amount)
                          │  pulls the IMD from the project
                          ▼
              sIMD.deposit(amount, trader) ──► sIMD shares minted to the trader
                          │
                          └─► event Stacked(project, trader, imd, shares) ──► points
```

1. A trader trades in a participating pool, for example PLEA/IMD.
2. The project's hook takes 0.5% of the trade on the IMD side, so IMD-paired pools need no extra swap.
3. The hook calls `Stacker.credit(trader, amount)`. The Stacker pulls the IMD and deposits it into the sIMD vault with the trader as the receiver.
4. The trader's sIMD balance goes up. They can unstake any time, except in the block where new shares arrive (the vault's one-block hold).

## The Stacker contract

One shared contract that every project calls.

```solidity
function credit(address trader, uint256 imdAmount) external returns (uint256 shares);
event Stacked(address indexed project, address indexed trader, uint256 imd, uint256 shares);
```

| Property | Detail |
|---|---|
| Project | `msg.sender`. Any contract or wallet can call `credit`; [points](#points) decide who counts. |
| Flow | Pulls `imdAmount` IMD from the caller, then calls `sIMD.deposit(imdAmount, trader)`. |
| Holds nothing | 0 IMD and 0 sIMD between calls (tested as an invariant). |
| Fixed | IMD and sIMD addresses are immutable; the constructor checks `sIMD.asset() == IMD` and approves the vault once. Both are skipped only where the vault has no code (IMD's empty-chain launch rehearsal); such a Stacker can't move any IMD. |
| Totals on chain | Per project (`projectStacked`, `projectShares`) and in total (`totalStacked`). |
| Per trader | From the `Stacked` events, which record project, trader, IMD and shares for every credit. Storing them on chain too would cost every trader extra gas, so the mainnet Stacker doesn't. |
| Failures | Reverts and moves nothing if the vault is paused, the allowance or balance is short, the trader is zero, or the vault would mint 0 shares. A 0 amount returns 0 with no event. |
| Safety | `nonReentrant`, OpenZeppelin `SafeERC20`, no owner or admin functions at all. |

Source: [`src/Stacker.sol`](src/Stacker.sol). The Sepolia Stacker is the same contract, plus per-trader totals on chain (`traderStacked`, `stackedBy`, `traderShares`) and the constructor checks without the empty-chain case.

## Deployments

### Sepolia (live, launch #1129, block 11,874,601)

| Contract | Address | Notes |
|---|---|---|
| TestIMD | [`0x2b69099e59b05901faa1dd164fabf098bf831e82`](https://sepolia.etherscan.io/address/0x2b69099e59b05901faa1dd164fabf098bf831e82) | Test IMD. `faucet()` gives 10,000 tIMD per address every 24h. |
| TestSIMD | [`0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1`](https://sepolia.etherscan.io/address/0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1) | A copy of the real sIMD vault. Its owner can pause it, so integrators can test their fallback. |
| Stacker | [`0x293c7134ab8f6bf1d8ff44ed806575f8f1baf477`](https://sepolia.etherscan.io/address/0x293c7134ab8f6bf1d8ff44ed806575f8f1baf477) | The imd/acc contract. |

Test page: https://imd-acc-sepolia-test-run.site.identitymd.eth.limo. It shows your stack, the leaderboards, the faucet and a "stack to myself" tool.

### Ethereum mainnet (next)

| Contract | Address | Notes |
|---|---|---|
| IMD | [`0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`](https://etherscan.io/address/0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7) | Standard 18-decimal ERC-20 (a LayerZero OFT), no transfer fee. |
| sIMD | [`0x9efa934d9fad4ae28c998a40195646b965a97247`](https://etherscan.io/address/0x9efa934d9fad4ae28c998a40195646b965a97247) | ERC-4626 staking vault. Owner renounced, so nobody can pause it or sweep its funds. |
| Stacker | not deployed yet | Launch ready: [`jobs/4-mainnet-launch.md`](jobs/4-mainnet-launch.md), deploying [`src/Stacker.sol`](src/Stacker.sol) as listed in [`launch.json`](launch.json). |

## Points

Every `Stacked` event is kept as a record. Points are the basis for the leaderboards and maybe a later airdrop; **nothing is promised**.

- **Trader points:** 1 point per IMD stacked for the trader.
- **Project points:** the IMD its traders stacked.
- **Listed projects only.** Anyone can call `credit` with their own IMD; that's just staking for someone, so it earns no points. Only credits from a listed project count, from the block it was listed (`fromBlock`), never before.
- **The list today** is `projects.json` on the first test page (`{address, name, fromBlock}`). The test run 2 page reads [`listings/sepolia.json`](listings/sepolia.json) from this repository instead, so listing a project there is a commit, not a paid job. Later, an ownerless `ProjectRegistry` decided by an IMD oracle panel replaces it ([design notes](docs/design.md#which-projects-earn-points)).
- **How they're counted:** by adding up the `Stacked` events, which can't be changed or deleted. An indexer keeps the totals ready for the site; project totals are also on chain.

**What a trader sees on the dashboard**, with no visit to the vault's site:

| Figure | Where it comes from |
|---|---|
| Cashback received, points, split per project | their `Stacked` events |
| sIMD held now | the vault, live |
| What their cashback is worth today | the shares in their events, priced by the vault, live |
| Earned on top (vault yield) | worth today − cashback received |

The all-traders dashboard and leaderboards (top traders, top projects, 7-day and 30-day views) come from the same events.

| Listed project | Address | From block | Status |
|---|---|---|---|
| PLEA | `0x3d4CcAc329010b8beA3b14498d9a45EAB00c68Cc` | 11,885,872 | Listing job ready ([`jobs/3-list-plea.md`](jobs/3-list-plea.md)) |

## Integrating a project

```solidity
// Once: let the Stacker pull IMD from your contract.
IERC20(imd).approve(address(stacker), type(uint256).max);

// On each trade, with the real trader taken from hookData:
uint256 cashback = imdSideAmount * 50 / 10_000;              // 0.5%, out of your existing fee
try stacker.credit(trader, cashback) {
    // the trader now holds the sIMD
} catch {
    IERC20(imd).transfer(trader, cashback);                  // plain IMD: the trade never reverts
}
```

Rules:
1. **Fund it from your fee.** Take the 0.5% on the IMD side of the trade, out of the fee you already charge.
2. **Never let imd/acc break a trade.** Wrap `credit` in `try/catch` and pay plain IMD if it fails.
3. **Pay the real trader.** Read it from the router's `hookData`, fall back to `sender`, never use `tx.origin`.
4. **Check gas before the call.** Require enough gas for `credit` up front and revert if it's short. Otherwise a wallet's gas estimate picks the cheaper path without cashback, and traders get plain IMD. PLEA learned this on Sepolia.
5. **Budget the gas.** Measured costs of `credit` (whole transactions):

   | Network | New trader | Repeat trader |
   |---|---|---|
   | Ethereum mainnet (this Stacker, fork test) | 130k | 96k |
   | Sepolia (the launch #1129 Stacker; today's expensive new storage) | 0.7M–1.2M | about 0.2M |

   Wallets should send estimates ×1.3.
6. **For Uniswap v4 hooks:** include the `afterSwap` logic Uniswap's frontend whitelisting expects, support the router's `msgSender`, and warn users about copycat v2/v3 pools. These are btc/acc's lessons.
7. **Test the failure path** on Sepolia: TestSIMD's owner can pause it, and your hook should then pay plain IMD.

## Projects

| Project | Chain | Status |
|---|---|---|
| **PLEA**: a sell-gated meme token on Uniswap v4 | Ethereum (Sepolia first) | **Live on Sepolia.** Its v10 hook credits 0.5% of every PLEA/IMD trade inside the same swap, for buys and sells; new and repeat traders were stacked. PLEA mainnet will use the mainnet Stacker. |
| **PondPad**: an IMD-paired launchpad | Robinhood Chain | Planned. The sIMD vault is on Ethereum only, so PondPad uses the [multichain route](docs/design.md#multichain-cashback-from-other-chains): cashback waits on Robinhood Chain and is delivered to Ethereum as sIMD through IMD's own bridge. |

## Roadmap

1. **Sepolia test run 2:** the new Stacker on the live test pair, with a new test page, in one order. PLEA's next version then credits through it. [`jobs/5-sepolia-v2-launch.md`](jobs/5-sepolia-v2-launch.md)
2. **Deploy the Stacker on Ethereum mainnet** from this repository, with a full audit by the IMD swarm. PLEA mainnet needs its address. [`jobs/4-mainnet-launch.md`](jobs/4-mainnet-launch.md)
3. **Indexer and mainnet dashboard:** the events kept in a fast table, then the site with each trader's cashback, points and value, and the leaderboards.
4. **Multichain:** Robinhood Chain first (PondPad), then Base and Arbitrum. Cashback waits per trader on that chain and goes to Ethereum through IMD's own LayerZero bridge, paid by a small tip ([design](docs/design.md#multichain-cashback-from-other-chains)).
5. **v2: the ETH route** for projects whose fees are in ETH. `creditETH(trader)` records pending ETH; a public `flush()` swaps the batch to IMD through POOL4 behind a TWAP price guard, deposits it and splits the shares. Built once such a project wants in.
6. **ProjectRegistry**: an ownerless project list decided by an IMD oracle panel, replacing `projects.json`, once more than one or two projects want in.

Open questions (with recommendations) are in the [design notes](docs/design.md#open-questions): an sIMD vault on Robinhood Chain, and cashback on sells as well as buys.

## Repository layout

```
README.md                 this page
src/Stacker.sol           the Stacker (mainnet version)
test/                     Foundry tests: unit, edge cases, fuzz, invariants, deployment, mainnet and Sepolia forks
  mocks/                  TestIMD and TestSIMD (a copy of StakedIMD), test doubles only
lib/                      forge-std, OpenZeppelin and Solady files, vendored
launch.json               the IMD launch manifest: one Stacker, mainnet IMD and sIMD
foundry.toml              solc 0.8.26, cancun, 10,000 optimizer runs, bytecode_hash none
docs/
  design.md               design detail: building blocks, points, ProjectRegistry, v2 ETH route,
                          decisions, open questions, launch settings, btc/acc lessons
  history.md              what happened so far, with the checks and transactions behind it
  explainer.html          a one-page explainer for traders and projects
jobs/                     IMD swarm job prompts, in order
  1-sepolia-launch.md     the Sepolia launch (done, launch #1129)
  2-sepolia-site.md       the test page (done, job 5530dde0)
  3-list-plea.md          list PLEA on the test page (ready)
  4-mainnet-launch.md     the mainnet Stacker (ready)
  5-sepolia-v2-launch.md  Sepolia test run 2: the new Stacker on the live test pair (ready)
  5-sepolia-v2-site.md    its test page, built in the same order (ready)
  requests/               exact request bodies for the ready jobs
listings/sepolia.json     projects that earn points on the Sepolia test run 2 page
NEXT_SESSION.md           the brief for the next working session
```

## Build and test

With [Foundry](https://getfoundry.sh) 1.8.3, the version IMD's verifier runs:

```
forge build
forge test                                                        # 42 tests; the 6 fork tests skip
ETH_RPC_URL=https://ethereum-rpc.publicnode.com forge test --mc MainnetFork            # live IMD and sIMD
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test --mc SepoliaFork # live TestIMD and TestSIMD
forge fmt --check src test
```

The mainnet fork tests check the live vault's facts (asset, renounced owner, not paused), a credit to a new and a repeat trader, and the one-block hold followed by a redeem. The Sepolia ones check a credit, its event and totals, and that a paused vault makes `credit` revert without moving anything.

**Branches:** `main` holds the mainnet manifest. The `sepolia` branch differs only in `launch.json`, which wires the same Stacker to the live Sepolia TestIMD and TestSIMD for test runs.

**Working with IMD:** jobs are paid in IMD (0.5 IMD each) from the owner's wallet. Run the free `POST https://api.imd.fun/requests/check` before paying. Set hosting only with the job's `ipfs` field, never in the prompt text, or the agent tries to publish the site itself and blocks. Docs: https://imd.fun/docs.

## Credits

imd/acc is inspired by **[btc/acc](https://www.token.works/archive/btcacc)** by **[TokenWorks](https://www.token.works)** (February 2025). btc/acc was a Uniswap v4 hook that took 1% of each trade on the trader's behalf, bought them Bitcoin (cbBTC) and kept it for them in its protocol, so traders built a Bitcoin position just by trading.

imd/acc takes the same idea into the IMD ecosystem: the cashback is staked IMD instead of Bitcoin, and it comes out of fees projects already charge instead of a new 1% on top. That second change answers a lesson TokenWorks wrote up themselves: apps rarely add a fee that only benefits their users. Their notes on Uniswap's frontend whitelisting, router `msgSender` support and copycat pools shaped the integration rules above.

imd/acc is an independent project, not made by TokenWorks. Thank you to TokenWorks for building btc/acc in the open and writing up what they learned.
