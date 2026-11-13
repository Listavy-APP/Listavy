import { es } from "@/lib/i18n/es";

export const metadata = { title: es.payments.title };

/** Static explainer of the money flow. Facts match the commission module and migrations 0017, 0018, 0027. */
export default function PaymentsPage() {
  return (
    <section className="stack">
      <h1>{es.payments.title}</h1>
      <p className="lead">{es.payments.intro}</p>

      <h2>{es.payments.clientTitle}</h2>
      <p>{es.payments.clientBody}</p>

      <h2>{es.payments.proTitle}</h2>
      <p>{es.payments.proBody}</p>
      <ul className="muted">
        <li>{es.payments.commissionFree}</li>
        <li>{es.payments.commissionPro}</li>
        <li>{es.payments.commissionDiagnostic}</li>
        <li>{es.payments.commissionTips}</li>
      </ul>
      <p className="muted">{es.payments.stripeFees}</p>

      <h2>{es.payments.diagnosticTitle}</h2>
      <p>{es.payments.diagnosticBody}</p>

      <h2>{es.payments.refundsTitle}</h2>
      <ul className="muted">
        <li>{es.payments.refundCancel}</li>
        <li>{es.payments.refundDispute}</li>
      </ul>
      <p className="muted">{es.payments.disputeWindow}</p>
    </section>
  );
}
