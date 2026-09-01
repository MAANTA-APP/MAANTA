export type QueueCallNotificationState = {
  presentationId: string | null;
  expiresAt: string | null;
  presentationStatus: string | null;
  redemptionStatus: string | null;
};

/**
 * Whether a durable notification is still an actionable queue call.
 *
 * Queue-call rows carry an expiry snapshot. If their ephemeral presentation
 * has been deleted, the database record stays for evidence but the shopper
 * must not keep seeing an instruction whose authority has disappeared.
 * Notifications without a queue expiry are older generic inbox records and
 * are unaffected by this rule.
 */
export function isActionableQueueCallNotification(
  state: QueueCallNotificationState
): boolean {
  if (state.expiresAt && !state.presentationId) return false;
  if (!state.presentationId) return true;
  return (
    state.presentationStatus === "called" &&
    state.redemptionStatus === "pending"
  );
}
