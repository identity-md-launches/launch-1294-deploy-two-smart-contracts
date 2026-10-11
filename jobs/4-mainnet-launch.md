Launch imd/acc on Ethereum mainnet: deploy only the Stacker from this repository, against the real IMD and the real staked-IMD vault. imd/acc pays 0.5% trading cashback to traders as staked IMD (sIMD), funded from a project's existing fees; the Stacker is the shared, ownerless funnel every project calls. Its logic ran live on Sepolia (launch #1129) and is not to change.

DEPLOY (Ethereum mainnet, one contract):
- Stacker(imd, sImd) with imd = 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 (IMD) and sImd = 0x9efa934d9fad4ae28c998a40195646b965a97247 (StakedIMD, sIMD).
- launch.json lists only Stacker with those two static addresses. TestIMD and TestSIMD stay in the repository for the tests but are not deployed.
- src/Stacker.sol stays as it is: no owner, admin, fee, pause or upgrade; immutable IMD and SIMD; the constructor checks sIMD.asset() == IMD and approves the vault once; credit(trader, imdAmount) pulls IMD from msg.sender and calls sIMD.deposit(imdAmount, trader); totals per trader, per project and per project+trader; event Stacked(project, trader, imd, shares). Keep foundry.toml as it is (solc 0.8.26, cancun, 10,000 runs, bytecode_hash none).

FACTS (read on chain 2026-10-11, block 26,166,812):
- IMD is a LayerZero OFT: a standard 18-decimal ERC-20 with no transfer fee, no pause and no rebasing.
- sIMD: ERC-4626 over IMD, decimals 24 (offset 6), owner() = 0x0 (renounced, so nobody can pause or rescue), paused() = false, about 1.82M IMD staked. One-block hold: any positive mint stamps lastDepositBlock[receiver], and the receiver cannot withdraw or redeem in that block.
- Measured on a mainnet fork with this exact Stacker: deploy 528,591 gas; credit to a new trader 197k–249k gas, a repeat credit 112k (whole transactions); the Stacker held 0 IMD and 0 sIMD after each.

TESTS: the existing suite passes unchanged. Add a test that the launch manifest deploys only Stacker with exactly the two mainnet addresses above.

README: a mainnet section (the Stacker address once live, the IMD and sIMD addresses, the facts above), and an integration guide for projects: approve the Stacker once; compute 0.5% in IMD; call credit inside try/catch and pay plain IMD to the trader on failure, so a trade never reverts because of imd/acc; pass the real trader (router hookData, else sender, never tx.origin); check gasleft() before the call instead of letting a wallet's gas estimate pick a path without cashback; a credit mints sIMD to the trader, so the trader cannot redeem sIMD in that same block.
