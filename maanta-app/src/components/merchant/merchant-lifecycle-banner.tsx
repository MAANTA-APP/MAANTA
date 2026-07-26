import Link from "next/link";
import {
  getMerchantLifecycleInfo,
  getMerchantLifecycleStats,
  type MerchantLifecycleInfo,
} from "@/lib/merchant-lifecycle";

const TONE_CLASS: Record<MerchantLifecycleInfo["tone"], string> = {
  neutral: "border-line bg-cream text-ink",
  positive: "border-verified/30 bg-verified/5 text-ink",
  warning: "border-rust/30 bg-rust/5 text-ink",
  urgent: "border-rust/40 bg-rust/10 text-ink",
};

const LABEL_CLASS: Record<MerchantLifecycleInfo["tone"], string> = {
  neutral: "bg-cream-dark text-secondary",
  positive: "bg-verified/15 text-verified",
  warning: "bg-rust/15 text-rust",
  urgent: "bg-rust/20 text-rust",
};

type Props = {
  merchant: {
    status: string;
    onboarded_at: string | null;
    node: string;
    merchant_name: string;
  };
  deals: { expires_at: string | null; is_active?: boolean | null }[];
};

export function MerchantLifecycleBanner({ merchant, deals }: Props) {
  const stats = getMerchantLifecycleStats(deals);
  const info = getMerchantLifecycleInfo(merchant, stats);
  const showSupport =
    info.stage === "churn_risk" ||
    info.stage === "suspended" ||
    info.stage === "inactive";

  return (
    <div className={`border-b px-4 py-2.5 text-xs ${TONE_CLASS[info.tone]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${LABEL_CLASS[info.tone]}`}
        >
          {info.label}
        </span>
        <span className="font-semibold">{info.message}</span>
      </div>
      {showSupport ? (
        <p className="mt-1.5 text-[11px] text-secondary">
          <Link href="/merchant/support" className="font-semibold underline">
            Contact support
          </Link>
          {info.stage === "churn_risk" ? (
            <>
              {" "}
              ·{" "}
              <Link href="/merchant/deals/new" className="font-semibold underline">
                Create a new deal
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
