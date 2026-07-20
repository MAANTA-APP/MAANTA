import { getSuccessFee } from "@/lib/data";
import { OnboardWizard } from "./onboard-wizard";

export const dynamic = "force-dynamic";

/** 9b–9j Merchant onboarding — server shell fetches the canonical success fee
 * and hands it to the client wizard so the wallet step shows the real charge. */
export default async function MerchantOnboardPage() {
  const successFee = await getSuccessFee();
  return <OnboardWizard successFee={successFee} />;
}
