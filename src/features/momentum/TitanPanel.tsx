import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { membershipEstimate, titan } from "./titan";
import type { ReactNode } from "react";
export function Outside({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowRight size={15} />
    </a>
  );
}
/** Public pricing is separated from private attendance. Credit consumption and
 * actual cash outlay must remain different numbers throughout the comparison. */
export function TitanPrices() {
  const [visits, setVisits] = useState(4),
    estimate = membershipEstimate(visits);
  return (
    <section className="mm-price-section">
      <span className="mm-eyebrow">Membership decision · CAD</span>
      <h2>Try it first. Commit later.</h2>
      <p>
        At one class a week, a <strong>$300 ten-class pass</strong> is the best
        starting option <strong>if</strong> it covers your classes and stays
        valid long enough. Confirm both before buying. Try an eligible free
        introduction first if Titan approves it. Still unsure? One or two $50
        drop-ins limit the initial commitment before buying ten credits.
      </p>
      <label className="mm-field">
        <span>Expected visits per billing month</span>
        <input
          type="number"
          min="0"
          max="31"
          value={visits}
          onChange={(e) =>
            setVisits(Math.min(31, Math.max(0, Number(e.target.value))))
          }
        />
      </label>
      <div className="mm-price-comparison">
        <div>
          <span>Pass credits used</span>
          <strong>${estimate.creditValue}</strong>
          <small>{visits} × $30 · $300 paid upfront</small>
        </div>
        <div>
          <span>Unlimited, monthly</span>
          <strong>$210</strong>
          <small>Muay Thai + cardio kickboxing</small>
        </div>
      </div>
      <p className="mm-context">
        {estimate.equal
          ? "Seven visits use $210 of pass credits: equal to the monthly price. Compare expiry and terms."
          : estimate.cheaper === "monthly"
            ? "At eight or more visits per billing month, $210 month-to-month costs less than using $30 pass credits. Switch only if that attendance already fits your life."
            : "Four or five visits use $120-$150 of pass credits, less than $210 monthly. The first cash purchase is still $300."}
      </p>
      <details className="mm-disclosure">
        <summary>Prices, terms & the 90-day example</summary>
        <table>
          <caption>Published base prices · checked October 25, 2026</caption>
          <thead>
            <tr>
              <th>Option</th>
              <th>CAD</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Drop-in", "$50 / class"],
              ["10-class pass", "$300"],
              ["One week unlimited", "$100"],
              ["Muay Thai + cardio · monthly", "$210 / month"],
              [
                "Same plan · six-month term",
                "$180 / month · $1,080 minimum base",
              ],
              ["Same plan · annual term", "$150 / month · $1,800 minimum base"],
              [
                "Add boxing · monthly / six-month / annual",
                "$235 / $200 / $165 per month",
              ],
            ].map(([name, price]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{price}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Thirteen weekly Wednesdays fit in 90 days. If all run and the first is
          free, twelve paid visits could cost $400: one $300 pass plus two $50
          drop-ins. Two passes cost $600 cash with eight credits remaining, not
          $360 cash. Three monthly billing cycles cost $630 base. Closures,
          billing dates and eligibility can change this comparison.
        </p>
        <p>
          A six- or twelve-month commitment extends beyond this experiment. Do
          not attend more just to justify a membership.
        </p>
        <p>
          Not verified: pass expiry, eligible classes, taxes, registration/gear
          fees, cancellation, freeze or renewal terms. Ask Titan before paying.
        </p>
      </details>
      <div className="mm-link-list">
        <Outside href={titan.pricing}>Official price PDF</Outside>
        <Outside href={titan.catalogue}>Enrollment catalogue</Outside>
      </div>
    </section>
  );
}
export function TitanIntro() {
  return (
    <>
      <p>
        <MapPin size={16} /> {titan.address}
      </p>
      <Outside href={titan.schedule}>Official class schedule</Outside>
      <details className="mm-disclosure">
        <summary>Before your first class</summary>
        <ol>
          <li>
            Confirm your place and ask whether you qualify for the advertised
            free trial.
          </li>
          <li>
            Wear comfortable training clothes. Titan says first-session gloves
            are provided; ask what other equipment is needed.
          </li>
          <li>
            Eat a familiar meal or snack, bring water and arrive early enough to
            find the room confirmed by the coach.
          </li>
          <li>
            Ask the instructor for a manageable introduction, with breaks or
            observation when needed.
          </li>
        </ol>
      </details>
    </>
  );
}
