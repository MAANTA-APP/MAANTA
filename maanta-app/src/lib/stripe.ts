import Stripe from "stripe";

let stripeClient: Stripe | null = null;

// "live" to allow real charges, anything else (incl. unset) requires a test
// key — mirrors INTASEND_ENV's sandbox/live switch. This guards against a
// live secret key accidentally being used while STRIPE_ENV wasn't
// deliberately flipped to "live" (or vice versa).
export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");

  const stripeEnv = process.env.STRIPE_ENV === "live" ? "live" : "test";
  const isLiveKey = secretKey.startsWith("sk_live_");

  if (stripeEnv === "test" && isLiveKey) {
    throw new Error(
      "STRIPE_ENV is not \"live\" but STRIPE_SECRET_KEY is a live key. Refusing to start to avoid accidental real charges."
    );
  }
  if (stripeEnv === "live" && !isLiveKey) {
    throw new Error(
      "STRIPE_ENV is \"live\" but STRIPE_SECRET_KEY is not a live key."
    );
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}
