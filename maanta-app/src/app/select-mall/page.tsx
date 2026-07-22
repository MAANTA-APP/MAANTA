"use client";

import { useRouter } from "next/navigation";
import { NODES, NODE_COOKIE } from "@/lib/nodes";
import { NodeCard } from "@/components/ui/cards";
import { IconArrowLeft } from "@/components/ui/icons";

/** 8e Node select — "Choose a mall". */
export default function SelectMallPage() {
  const router = useRouter();

  function choose(id: string) {
    document.cookie = `${NODE_COOKIE}=${encodeURIComponent(id)};path=/;max-age=31536000`;
    router.push("/feed");
    router.refresh();
  }

  // S2 — this screen sits outside (shopper)/ so it has no tab bar; without a
  // back affordance a shopper who lands here is stranded. Ink (never amber),
  // returns to the previous surface, falling back to the feed.
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/feed");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col bg-paper px-5 pt-12">
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="-ml-1 mb-4 flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-cream"
      >
        <IconArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-2xl font-bold text-ink">Choose a mall</h1>
      <div className="mt-8 space-y-3">
        {NODES.map((n) => (
          <NodeCard
            key={n.id}
            name={n.label}
            live={n.live}
            onClick={() => choose(n.id)}
          />
        ))}
      </div>
    </main>
  );
}
