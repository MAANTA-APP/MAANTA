/**
 * Whether anything in MAANTA can actually send a shopper a push notification.
 *
 * ## Why a constant and not a feature flag
 *
 * This is not a product decision that an operator toggles. It is a **statement
 * about the codebase**, and it is false today: the only caller of
 * `sendPushNotification` is `@/lib/notify-merchant`, whose five call sites are
 * all Stripe and IntaSend payment webhooks addressed to a **merchant**. No code
 * path pushes to a shopper.
 *
 * Until one exists, the feed must not ask a shopper for notification
 * permission. Drift **D234**.
 *
 * ## Why asking early is worse than not asking
 *
 * Browser push permission is effectively one-shot. A shopper who taps "Allow"
 * receives nothing, ever — the prompt promises "new deals near you" and there
 * is no sender behind it. A shopper who taps the browser's own "Block" is
 * **stuck**: the permission is sticky per origin, the site cannot re-prompt,
 * and recovering it means talking someone through browser settings. So the
 * current behaviour spends a scarce, non-renewable grant for no delivery, on
 * the exact Node 0 cohort whose engagement is being measured.
 *
 * That is why this gates the sheet rather than only the copy. Rewording the
 * prompt would still burn the grant.
 *
 * ## Nothing is being deleted
 *
 * The subscribe path in `notification-opt-in.tsx` — service worker
 * registration, `pushManager.subscribe`, `POST /api/push/subscribe` — is
 * correct and stays. `users.push_subscription` is written by that route and
 * read by `notify-merchant`, so a shopper sender written tomorrow inherits
 * working plumbing. Only the *asking* is held.
 *
 * ## Flipping it
 *
 * Set this to `true` in the same change that ships a shopper-facing sender —
 * the favourite-merchant notification of **D232**, or any other. Not before,
 * and not on its own: `shopper-push-gate.test.ts` fails if this is `true` while
 * `sendPushNotification` still has no caller outside `notify-merchant.ts`, so
 * the flag cannot drift ahead of the code it describes.
 *
 * Sequencing note worth keeping: **D234 gates D232, not the reverse.** A
 * shopper who has already been asked and declined cannot be asked again when
 * the feature finally ships.
 *
 * Typed `boolean` rather than left as the literal `false` on purpose — the
 * narrowed literal type would make every guard below it read as dead code to
 * the compiler and to a reviewer, when it is in fact the switch.
 */
export const SHOPPER_PUSH_SENDER_EXISTS: boolean = false;
