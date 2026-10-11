import type { Snapshot } from "./chain";
import { ContractAddresses } from "./App";
import { CodeBlock, DataMessage, Table } from "./ui";
import { duration, units } from "./model";
import { integrationCode } from "./integration";
import agentGuide from "../public/llms.txt?raw";

const contents = [
  ["what-it-is", "What it is"],
  ["how-it-works", "How it works"],
  ["addresses", "Addresses"],
  ["integrate", "Integrate a project"],
  ["get-listed", "Get listed"],
  ["points", "Points"],
  ["for-agents", "For agents"],
];
export function Docs({
  data,
  error,
  loading,
  refresh,
}: {
  data?: Snapshot;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  return (
    <main className="container" id="docs-main">
      <div className="page-heading">
        <h1 id="docs-heading" tabIndex={-1}>
          Documentation
        </h1>
        <p>Using and integrating imd/acc on Sepolia.</p>
      </div>
      <div className="docs-layout">
        <nav className="contents" aria-label="Contents">
          <h2>Contents</h2>
          <ul>
            {contents.map(([id, title]) => (
              <li key={id}>
                <a href={`#/docs/${id}`}>{title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="docs-content">
          <section id="what-it-is" tabIndex={-1}>
            <h2>What it is</h2>
            <p>
              imd/acc pays trading cashback as staked IMD. A participating
              project takes 0.25%–1% of the IMD side of a trade from its
              existing fee and deposits it for the trader in the staking vault.
            </p>
            <p>
              The Stacker has no owner, admin, fee, pause or upgrade. Listing is
              decided by an IdentityMD oracle panel through the ProjectRegistry.
              Listing decides whether cashback also earns points.
            </p>
            <p className="secondary">
              This is Sepolia test run 2. TestIMD is the staking asset and tsIMD
              is the TestSIMD vault share. The oracle uses a separate test IMD
              payment token.
            </p>
          </section>
          <section id="how-it-works" tabIndex={-1}>
            <h2>How it works</h2>
            <p className="flow">
              Trade → credit → vault deposit → Stacked → points
            </p>
            <ul>
              <li>
                A trader trades in a participating project. The project
                calculates cashback at its chosen rate on the IMD side of the
                trade.
              </li>
              <li>
                The trading contract calls{" "}
                <code>Stacker.credit(trader, amount)</code>. The Stacker pulls
                IMD from the caller.
              </li>
              <li>
                The Stacker deposits into the vault with the trader as receiver.
                The vault mints shares directly to that trader.
              </li>
              <li>
                A <code>Stacked(project, trader, imd, shares)</code> event
                records the cashback. The project is the caller of credit.
              </li>
              <li>
                The app adds up these events. Credits inside a listing period
                earn one point per IMD. Other credits are direct, with no
                points.
              </li>
            </ul>
            <p>
              If the vault refuses a deposit, the Stacker reverts. Integrating
              projects catch the failure and pay plain IMD. New vault shares
              have a one-block hold before redemption.
            </p>
          </section>
          <section id="addresses" tabIndex={-1}>
            <h2>Addresses</h2>
            <p className="secondary">
              Sepolia, chain 11155111. Scan Stacker and ProjectRegistry events
              from deployment block 11,891,109.
            </p>
            <ContractAddresses />
            <p className="hint">
              TestSIMD has an external owner who can pause the vault and sweep
              assets, including staked IMD.
            </p>
          </section>
          <section id="integrate" tabIndex={-1}>
            <h2>Integrate a project</h2>
            <p>The README’s integration example:</p>
            <CodeBlock code={integrationCode} />
            <p className="secondary">
              Use the gas check described below before the call, and skip the
              call for zero cashback.
            </p>
            <ul className="plain-list">
              <li>
                <strong>Fund it from your fee.</strong> Pick a rate from 0.25%
                to 1% on the IMD side, taken from the fee you already charge.
                The fee portion that permanently leaves the project must be at
                least the cashback.
              </li>
              <li>
                <strong>Keep trades working when credit fails.</strong> Wrap{" "}
                <code>credit</code> in try/catch and pay plain IMD in the catch
                branch.
              </li>
              <li>
                <strong>Pay the real trader.</strong> Read the trader from the
                router’s <code>hookData</code>, fall back to <code>sender</code>
                , and never use <code>tx.origin</code>.
              </li>
              <li>
                <strong>Check gas before the call.</strong> Require enough gas
                for credit up front and revert if it is short. Otherwise a
                wallet may estimate the cheaper path without cashback, leaving
                traders with plain IMD.
              </li>
              <li>
                <strong>Budget the gas.</strong> The README’s measured
                whole-transaction costs are below. Wallets should send estimates
                ×1.3.
              </li>
              <li>
                <strong>For Uniswap v4 hooks,</strong> include the afterSwap
                logic expected by frontend whitelisting, support the router’s{" "}
                <code>msgSender</code>, and warn users about copycat v2/v3
                pools.
              </li>
              <li>
                <strong>Test the failure path on Sepolia.</strong> TestSIMD’s
                owner can pause it. The hook should then pay plain IMD.
              </li>
            </ul>
            <Table label="Gas measurements from the README">
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th className="num">New trader</th>
                  <th className="num">Repeat</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Mainnet fork, this Stacker</td>
                  <td className="num">130k</td>
                  <td className="num">96k</td>
                </tr>
                <tr>
                  <td>Sepolia, launch #1129 Stacker</td>
                  <td className="num">0.7M–1.2M</td>
                  <td className="num">About 0.2M</td>
                </tr>
              </tbody>
            </Table>
            <p className="hint">
              The older Sepolia measurements are not benchmarks for test run 2.
              Measure your complete integration, including the first credit.
            </p>
          </section>
          <section id="get-listed" tabIndex={-1}>
            <h2>Get listed</h2>
            <p>
              Integrate the Stacker and verify your trading contract’s source on
              the explorer. Anyone can apply with{" "}
              <code>
                applyListing(project, name, sourceUrl, rateBps, beneficiary)
              </code>
              , paying the live oracle fee.
            </p>
            <p>
              The project must have code, have no open question and not already
              be listed. Choose 25–100 basis points and a nonzero beneficiary.
              Names use 1–48 characters; source URLs use 12–200 and start with
              https://. Text must be printable ASCII without double quotes,
              backslashes or square brackets.
            </p>
            <p>
              The panel answers in a few minutes. Yes lists the project from
              that block. No rejects it and it may apply again. A refused or
              unanswered question is cleared without a listing.
            </p>
            <h3>What the panel checks</h3>
            <ul>
              <li>The source is verified and readable on the explorer.</li>
              <li>
                The project calls credit only inside real trades, for those
                trades’ traders. It never credits wallets it chooses outside a
                trade.
              </li>
              <li>
                Cashback matches the stated rate between 25 and 100 basis
                points. Rate or fee changes remain within the allowed range and
                fee guard.
              </li>
              <li>
                The fee guard holds. The beneficiary is the owner, or a wallet
                the verified source or official site names as the team or
                treasury.
              </li>
              <li>
                The real trader comes from router hookData, else sender, never
                tx.origin.
              </li>
              <li>
                A failed credit pays plain IMD, and an up-front gas check
                prevents gas estimation from choosing a cheaper fallback path.
              </li>
            </ul>
            <h3>The fee guard</h3>
            <p>
              Split the fee into cashback, the part returned to the owner or
              team, and the part that permanently leaves them. The part that
              leaves must be at least as large as the cashback.
            </p>
            <Table label="Fee guard categories">
              <thead>
                <tr>
                  <th>Fee portion</th>
                  <th>Counts as leaving?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Trader cashback</td>
                  <td>No</td>
                </tr>
                <tr>
                  <td>
                    Owner share, team treasury, withdrawable owner liquidity
                  </td>
                  <td>No</td>
                </tr>
                <tr>
                  <td>
                    Burns, forever-locked liquidity, prizes to others,
                    third-party fees
                  </td>
                  <td>Yes</td>
                </tr>
              </tbody>
            </Table>
            <h3>Live registry terms</h3>
            {!data || error ? (
              <DataMessage
                error={error}
                loading={loading}
                onRetry={() => void refresh()}
              />
            ) : (
              <>
                <dl className="details-list">
                  <div>
                    <dt>Oracle fee</dt>
                    <dd>{units(data.fee)} oracle test IMD</dd>
                  </div>
                  <div>
                    <dt>Challenge bond</dt>
                    <dd>{units(data.bond)} oracle test IMD</dd>
                  </div>
                  <div>
                    <dt>Listing cooldown</dt>
                    <dd>{duration(Number(data.cooldown))}</dd>
                  </div>
                  <div>
                    <dt>Pending expiry</dt>
                    <dd>{duration(Number(data.expiry))}</dd>
                  </div>
                </dl>
                <p className="hint">
                  Read from the registry at block {data.block.toLocaleString()}.
                  Approve exactly the live fee, plus the bond for a challenge.
                </p>
              </>
            )}
            <h3>Challenges and expiry</h3>
            <p>
              After the listing cooldown, anyone can challenge a listed project
              with no open question. Call <code>challengeForBeneficiary</code>{" "}
              with a reason and the beneficiary you reviewed. A beneficiary
              change before inclusion reverts before payment. It cannot change
              while a question is open.
            </p>
            <p>
              If the project still meets the rules, it stays listed and the bond
              goes to its beneficiary. If it does not, it is delisted from that
              block and the challenger’s bond returns. Earlier points stay. A
              defended challenge does not restart the cooldown.
            </p>
            <p>
              Challenges check the current rate within 25–100 basis points. The
              application rate is historical and may differ. A question can
              expire once it is older than PENDING_EXPIRY, or when
              Intake.requests(id).completed is true. Clearing an unanswered
              challenge returns its bond.
            </p>
            <p>
              <a href="#/">Open the app to apply or challenge ↗</a>
            </p>
          </section>
          <section id="points" tabIndex={-1}>
            <h2>Points</h2>
            <p>
              One IMD stacked for a trader earns one point when the project is
              listed at the event’s block. Periods include fromBlock and exclude
              toBlock: <code>fromBlock ≤ block &lt; toBlock</code>. Open periods
              have no end block.
            </p>
            <p>
              Credits before listing, after delisting, and from unlisted callers
              are direct, with no points. Relisting starts a new period; it
              never backdates points. Project totals count the IMD stacked
              inside these periods.
            </p>
            <p>
              Cashback received and points come from events. tsIMD held comes
              from the wallet’s vault balance. Worth now converts the event
              shares to IMD through the vault’s convertToAssets. Earned on top
              is worth now minus cashback received, and can be negative.
            </p>
            <p>
              The repository also describes an indexer that reconciles credits
              to trades at the rate in force. This test page uses listing
              periods and Stacked events as specified for test run 2.
            </p>
            <p>
              Points may form the basis of a later airdrop. Nothing is promised.
            </p>
          </section>
          <section id="for-agents" tabIndex={-1}>
            <h2>For agents</h2>
            <p>
              Copy the integration context below for an agent writing a trading
              contract. The same text is available as{" "}
              <a href="./llms.txt">llms.txt</a>.
            </p>
            <CodeBlock code={agentGuide} label="Copy agent guide" />
          </section>
        </div>
      </div>
    </main>
  );
}
