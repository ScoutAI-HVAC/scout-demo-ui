import { Banknote } from "lucide-react";
export default function ReceivablesPage() {
  return (
    <div className="mx-auto max-w-2xl pt-[8vh] text-center">
      <p className="text-label font-bold tracking-[0.14em] uppercase text-ink-3">Owed to you</p>
      <h1 className="greeting mt-3 mb-2">
        Money, <em>chased for you.</em>
      </h1>
      <p className="mx-auto max-w-md text-body-lg text-ink-3">
        Open invoices and aging will live here. The chasing itself is live:{" "}
        <a href="/flows" className="font-semibold text-ink underline">
          build and review flows
        </a>{" "}
        that follow up on what you&apos;re owed.
      </p>
      <div className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-tan-soft bg-paper px-6 py-4 text-left shadow-soft">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-sage-tint text-sage">
          <Banknote size={18} />
        </span>
        <p className="text-body text-ink-2">
          Ask Scout <span className="font-semibold text-ink">&quot;who owes us money?&quot;</span>{" "}
          in the meantime - it can already pull that from your books.
        </p>
      </div>
    </div>
  );
}
