"use client";

import { useRouter } from "next/navigation";
import { NODES, NODE_COOKIE } from "@/lib/nodes";
import { NodeCard } from "@/components/ui/cards";

/** 8e Node select — "Choose a mall". */
export default function SelectMallPage() {
  const router = useRouter();

  function choose(id: string) {
    document.cookie = `${NODE_COOKIE}=${encodeURIComponent(id)};path=/;max-age=31536000`;
    router.push("/feed");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col bg-paper px-5 pt-12">
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
