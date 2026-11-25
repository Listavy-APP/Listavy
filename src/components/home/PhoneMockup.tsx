/**
 * Decorative phone frame for the landing hero. Shows the job-quotes view with illustrative data.
 * It is not a screenshot and it is hidden from assistive tech. The real search stays the interactive element.
 */
import { es } from "@/lib/i18n/es";

const QUOTES = [
  { name: "Eduardo", price: "RD$1,800", rating: "4.9", chosen: true },
  { name: "Luis", price: "RD$1,650", rating: "4.8", chosen: false },
  { name: "Carlos", price: "RD$2,000", rating: "4.7", chosen: false },
] as const;

export function PhoneMockup() {
  return (
    <div className="landing-mockup" aria-hidden="true">
      <div className="phone">
        <div className="phone-screen">
          <p className="phone-job">{es.discover.mockupJob}</p>
          <ul className="phone-quotes">
            {QUOTES.map((q) => (
              <li key={q.name} className={q.chosen ? "phone-quote is-chosen" : "phone-quote"}>
                <span className="phone-avatar" />
                <span className="phone-quote-main">
                  <strong>{q.name}</strong>
                  <span>Plomero</span>
                </span>
                <span className="phone-quote-side">
                  <strong>{q.price}</strong>
                  <span>★ {q.rating}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="landing-mockup-caption">{es.discover.mockupLabel}</p>
    </div>
  );
}
