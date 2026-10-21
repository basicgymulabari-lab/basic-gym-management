export type StripeRefundEntry = {
  id?: string;
  amount?: number;
  created?: number;
};

export type StripeChargeRefunds = {
  created?: number;
  amount_refunded?: number;
  refunds?: { data?: StripeRefundEntry[] };
};

/** Return every usable refund from the charge; fall back to its aggregate only when absent. */
export function stripeRefundEntries(charge: StripeChargeRefunds): StripeRefundEntry[] {
  const entries = (charge.refunds?.data ?? []).filter(
    (refund) =>
      typeof refund.amount === "number" && Number.isSafeInteger(refund.amount) && refund.amount > 0,
  );
  if (entries.length > 0) return entries;

  const totalRefunded = charge.amount_refunded;
  if (
    typeof totalRefunded === "number" &&
    Number.isSafeInteger(totalRefunded) &&
    totalRefunded > 0
  ) {
    return [{ amount: totalRefunded, created: charge.created }];
  }
  return [];
}
