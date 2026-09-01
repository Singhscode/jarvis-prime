// Communication email delivery is deliberately disabled in this checkpoint.
// The existing Resend adapter does not propagate an HTTP Idempotency-Key or provide
// stable reconciliation, so invoking it could violate the no-duplicate guarantee.

export const communicationEmailDeliveryEnabled = false;

export async function processDueDeliveries() {
  return { processed: 0, disabled: true };
}
