# Listing a project

Any project can use imd/acc: its traders get real sIMD from the first credit. **Listing** decides which projects' credits also earn **points**. This page covers how listing works today, what is checked, and how it moves to an on-chain registry later.

## Today: a list file in this repository

One file per chain: [`listings/sepolia.json`](../listings/sepolia.json) now, `listings/mainnet.json` and others later. The test page fetches it from GitHub, so a listing takes effect when it is committed, with no paid job.

```json
[
  {
    "address": "0x…",
    "name": "PLEA",
    "fromBlock": 11885872,
    "rateBps": 50,
    "beneficiary": "0x…"
  }
]
```

| Field | Meaning |
|---|---|
| `address` | The contract that calls `Stacker.credit`, usually the project's hook. |
| `name` | Shown on the site. |
| `fromBlock` | Points count from this block on, never before. |
| `toBlock` | Optional, set only when a project is delisted: points stop at this block. Earlier points stay. |
| `rateBps` | The project's cashback rate in basis points, 25 to 100 (0.25% to 1%). |
| `beneficiary` | The wallet that holds the project's points, since a hook contract can't receive an airdrop. |

### Steps

1. **Integrate.** Call `Stacker.credit` inside the project's trades, following the [integration rules](../README.md#integrating-a-project): try/catch with a plain-IMD fallback, the real trader, a gas check.
2. **Verify** the contract source on the chain's explorer, so anyone can read it.
3. **Apply.** Open a ["List my project" issue](https://github.com/khaed1/imd-acc/issues/new?template=listing-application.yml) with the address, rate, fee split and beneficiary.
4. **Review** against the checklist below.
5. **Decision** by the repository owner. If yes, the entry is committed and points start.

### Checklist

- [ ] The source is verified on the explorer.
- [ ] It calls `credit` only inside real trades, never with its own IMD for wallets it picks.
- [ ] The cashback is the stated `rateBps` of the trade, between 25 and 100.
- [ ] **Fee guard:** the part of the fee that really leaves the project is at least as large as the cashback (see below).
- [ ] If its fees can change later, the limits are in the code, and any change stays inside the guard and the range.
- [ ] It credits the real trader: router `hookData`, else `sender`, never `tx.origin`.
- [ ] A failed credit never blocks a trade: the trader gets plain IMD instead.
- [ ] It checks gas up front, so a wallet's gas estimate can't choose a path without cashback.

### The fee guard

A normal trader can't farm points: they pay the whole fee and get back only the cashback, which is smaller. A project owner also gets back their own share of the fee, so trading with themselves could be nearly free. Split the fee into three parts:

| Part | Examples | Counts as "leaves"? |
|---|---|---|
| Cashback | the trader's sIMD | no |
| Comes back to the owner | owner share, team treasury, liquidity the owner can withdraw | no |
| Really leaves | burned tokens, liquidity locked forever, prizes paid to other people, fees to third parties | **yes** |

**Rule: "really leaves" ≥ cashback.** Then every point an owner farms costs at least as much as it returns, plus price impact and gas.

- **PLEA passes:** fee 1.75% = 0.5% cashback + 0.5% owner + 0.25% locked liquidity + 0.25% burn + 0.25% season prizes. Leaves 0.75% ≥ 0.5%. An owner round trip of $10,000 costs $350 in fees, gets back $200 ($100 cashback, $100 owner share) and loses $150 for $100 of points.
- **Fails:** fee 1.25% = 1% cashback + 0.25% owner. Nothing leaves, so points are almost free. Such a project can still use imd/acc, unlisted.

### When points start

- Reviewed **before or at launch**: `fromBlock` is the deploy block, as there is no earlier history (PLEA's case).
- Listed **later**: `fromBlock` is the block it is listed. Nobody can trade first and have points backdated.

### Delisting

If a listed project breaks the rules (changes its rate, fails the guard, credits its own wallets), its entry gets a `toBlock`. Points earned before it stay; later credits earn none. The entry is never deleted, so history stays readable.

### Every credit is checked too

The indexer compares each credit with the trade in the same transaction. A credit at a rate other than `rateBps`, or with no trade on the project's pool in that transaction, earns no points.

### Who decides today

The repository owner. Every change to the list is public in the git history: who was listed, when, and with which numbers.

## Later: the ProjectRegistry, decided by an IMD panel

When more than one or two projects want in, the list file is replaced by a small on-chain contract with **no owner**, so nobody decides alone. **The Stacker is never redeployed:** it doesn't know about listings, so the site and the indexer simply read the registry instead of the file. The design, with Intake v2's failure callback, is in [design.md](design.md#the-projectregistry). Its first trial runs on Sepolia, with PLEA as the first project to apply.
