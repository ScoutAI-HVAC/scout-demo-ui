"use client";
import { Coins } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/button";
import Card from "@/components/card";
export type CoinPackId = "p25" | "p50" | "p100";
export const COIN_PACKS: {
  id: CoinPackId;
  coins: number;
  dollars: number;
  bonus?: string;
}[] = [
  { id: "p25", coins: 2500, dollars: 25 },
  { id: "p50", coins: 5500, dollars: 50, bonus: "10% bonus" },
  { id: "p100", coins: 12000, dollars: 100, bonus: "20% bonus" },
];
export const COIN_RATES = {
  voiceFastPerMinute: 25,
  voiceAdvancedPerMinute: 40,
  smsPerSegment: 2,
} as const;
export const CHECKOUT_SUCCESS_REFETCH_MS = 10000;
export interface CoinsCycle {
  since: string | null;
  voiceSeconds: {
    fast: number;
    advanced: number;
  };
  smsSegments: number;
  coinsCharged: {
    voice_fast: number;
    voice_advanced: number;
    sms_outbound: number;
  };
}
export interface CoinsPlan {
  id: string;
  displayName: string;
  monthlyGrantCoins: number;
  rates: {
    voice_fast: number;
    voice_advanced: number;
    sms_outbound: number;
  };
}
export interface CoinsSnapshot {
  balance: {
    included: number;
    purchased: number;
    total: number;
  };
  state: "ok" | "warn" | "exhausted";
  cycle: CoinsCycle | null;
  plan?: CoinsPlan | null;
}
export type CheckoutOutcome = "success" | "cancel";
interface CoinsCardProps {
  checkout?: CheckoutOutcome | null;
}
type LoadState =
  | {
      kind: "loading";
    }
  | {
      kind: "disabled";
    }
  | {
      kind: "client-disabled";
    }
  | {
      kind: "error";
    }
  | {
      kind: "ready";
      snapshot: CoinsSnapshot;
    };
const DAY_MS = 24 * 60 * 60 * 1000;
function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
export function ratesOf(snapshot: CoinsSnapshot): {
  voiceFastPerMinute: number;
  voiceAdvancedPerMinute: number;
  smsPerSegment: number;
} {
  const r = snapshot.plan?.rates;
  if (!r || !isAmount(r.voice_fast) || !isAmount(r.voice_advanced) || !isAmount(r.sms_outbound)) {
    return COIN_RATES;
  }
  return {
    voiceFastPerMinute: r.voice_fast,
    voiceAdvancedPerMinute: r.voice_advanced,
    smsPerSegment: r.sms_outbound,
  };
}
function isCycle(value: unknown): value is CoinsCycle {
  const c = value as Partial<CoinsCycle> | null;
  return (
    !!c &&
    typeof c === "object" &&
    (c.since === null || typeof c.since === "string") &&
    typeof c.voiceSeconds === "object" &&
    c.voiceSeconds !== null &&
    Number.isFinite(c.voiceSeconds.fast) &&
    Number.isFinite(c.voiceSeconds.advanced) &&
    Number.isFinite(c.smsSegments) &&
    typeof c.coinsCharged === "object" &&
    c.coinsCharged !== null &&
    Number.isFinite(c.coinsCharged.voice_fast) &&
    Number.isFinite(c.coinsCharged.voice_advanced) &&
    Number.isFinite(c.coinsCharged.sms_outbound)
  );
}
function isSnapshot(value: unknown): value is CoinsSnapshot {
  const v = value as Partial<CoinsSnapshot> | null;
  return (
    !!v &&
    typeof v === "object" &&
    typeof v.balance === "object" &&
    v.balance !== null &&
    Number.isFinite(v.balance.included) &&
    Number.isFinite(v.balance.purchased) &&
    Number.isFinite(v.balance.total) &&
    (v.state === "ok" || v.state === "warn" || v.state === "exhausted") &&
    (v.cycle === null || v.cycle === undefined || isCycle(v.cycle))
  );
}
export function formatCoins(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
export function formatMinutes(seconds: number): string {
  return (Math.max(0, seconds) / 60).toFixed(1);
}
export function projectDaysLeft(snapshot: CoinsSnapshot, now: number = Date.now()): number | null {
  const cycle = snapshot.cycle;
  if (!cycle?.since) return null;
  const sinceMs = Date.parse(cycle.since);
  if (!Number.isFinite(sinceMs)) return null;
  const daysElapsed = (now - sinceMs) / DAY_MS;
  if (daysElapsed < 1) return null;
  const charged = cycle.coinsCharged;
  const used = charged.voice_fast + charged.voice_advanced + charged.sms_outbound;
  if (used <= 0) return null;
  return snapshot.balance.total / (used / daysElapsed);
}
export function describeDaysLeft(days: number): string {
  if (days < 1) return "Less than a day left at this pace";
  if (days > 365) return "More than a year left at this pace";
  const rounded = Math.round(days);
  return `About ${rounded} ${rounded === 1 ? "day" : "days"} left at this pace`;
}
const CLIENT_DISABLED_COPY = "This account can't buy Coins right now - contact Scout support";
export function checkoutErrorCopy(status: number): string {
  if (status === 409 || status === 503) {
    return "Top-ups aren't set up for this account yet - contact Scout support";
  }
  if (status === 403) return CLIENT_DISABLED_COPY;
  return "Couldn't start checkout. Try again in a moment.";
}
export default function CoinsCard({ checkout = null }: CoinsCardProps) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [buying, setBuying] = useState<CoinPackId | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/coins", { cache: "no-store" });
      if (res.status === 404) {
        setLoad({ kind: "disabled" });
        return;
      }
      if (res.status === 403) {
        setLoad({ kind: "client-disabled" });
        return;
      }
      const body = res.ok ? await res.json().catch(() => null) : null;
      setLoad(isSnapshot(body) ? { kind: "ready", snapshot: body } : { kind: "error" });
    } catch {
      setLoad({ kind: "error" });
    }
  }, []);
  useEffect(() => {
    void fetchBalance();
    if (checkout !== "success") return;
    const timer = setTimeout(() => void fetchBalance(), CHECKOUT_SUCCESS_REFETCH_MS);
    return () => clearTimeout(timer);
  }, [fetchBalance, checkout]);
  const buy = async (pack: CoinPackId) => {
    setBuying(pack);
    setBuyError(null);
    try {
      const res = await fetch("/api/coins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const body = (await res.json().catch(() => null)) as {
        url?: string;
      } | null;
      if (res.ok && typeof body?.url === "string") {
        window.location.assign(body.url);
        return;
      }
      setBuyError(checkoutErrorCopy(res.status));
    } catch {
      setBuyError("Couldn't start checkout. Try again in a moment.");
    }
    setBuying(null);
  };
  if (load.kind === "disabled") return null;
  if (load.kind === "loading") return null;
  if (load.kind === "client-disabled") {
    return (
      <Card as="section">
        <p className="text-body text-ink-2">{CLIENT_DISABLED_COPY}</p>
      </Card>
    );
  }
  if (load.kind === "error") {
    return (
      <Card as="section" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-2">Couldn&apos;t load your Coins balance.</p>
        <Button size="sm" onClick={() => void fetchBalance()}>
          Try again
        </Button>
      </Card>
    );
  }
  const { snapshot } = load;
  const { balance, state, cycle } = snapshot;
  const rates = ratesOf(snapshot);
  const daysLeft = projectDaysLeft(snapshot);
  return (
    <Card as="section" className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-golden-tint text-copper">
          <Coins size={18} />
        </span>
        <h3 className="text-body font-semibold text-ink">Coins</h3>
      </div>

      {checkout === "success" && (
        <p
          role="status"
          className="rounded-lg border border-sage-soft bg-sage-tint px-3 py-2 text-body text-sage-deep"
        >
          Payment received - Coins will appear within a minute
        </p>
      )}
      {checkout === "cancel" && (
        <p
          role="status"
          className="rounded-lg border border-tan-soft bg-cream px-3 py-2 text-body text-ink-2"
        >
          Checkout cancelled
        </p>
      )}

      {state === "warn" && (
        <p
          role="status"
          className="rounded-lg border border-golden-soft bg-golden-tint px-3 py-2 text-body font-medium text-copper"
        >
          Running low - {formatCoins(balance.total)} Coins left
        </p>
      )}
      {state === "exhausted" && (
        <p
          role="alert"
          className="rounded-lg border border-alarm-soft bg-alarm-tint px-3 py-2 text-body font-medium text-alarm"
        >
          Coins are used up. Calls are still answered (Fast brain); outbound campaigns are paused.
          Top up to restore.
        </p>
      )}

      <div>
        <p className="font-display font-tabular text-display font-medium leading-none text-ink">
          {formatCoins(balance.total)}{" "}
          <span className="font-sans text-body font-medium text-ink-3">Coins</span>
        </p>
        <p className="mt-1.5 text-label text-ink-3">
          {formatCoins(balance.included)} included · {formatCoins(balance.purchased)} purchased
        </p>
        {daysLeft !== null && (
          <p className="mt-1 text-label text-ink-3">{describeDaysLeft(daysLeft)}</p>
        )}
      </div>

      {cycle && (
        <div>
          <p className="mb-1.5 text-body font-medium text-ink-2">Used this cycle</p>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Fast voice", value: `${formatMinutes(cycle.voiceSeconds.fast)} min` },
              {
                label: "Advanced voice",
                value: `${formatMinutes(cycle.voiceSeconds.advanced)} min`,
              },
              { label: "Texts", value: formatCoins(cycle.smsSegments) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-tan-soft bg-cream/60 px-3 py-2"
              >
                <dt className="text-micro font-semibold uppercase tracking-wide text-ink-4">
                  {item.label}
                </dt>
                <dd className="font-tabular text-body font-medium text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="space-y-2 border-t border-tan-soft pt-4">
        <p className="text-body font-medium text-ink-2">Buy Coins</p>
        <p className="text-label text-ink-3">
          Fast voice {rates.voiceFastPerMinute} Coins a minute · Advanced voice{" "}
          {rates.voiceAdvancedPerMinute} a minute · texts {rates.smsPerSegment} a segment. Purchased
          Coins never expire.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {COIN_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              disabled={buying !== null}
              aria-label={`Buy ${formatCoins(pack.coins)} Coins for $${pack.dollars}`}
              onClick={() => void buy(pack.id)}
              className="rounded-lg border border-tan-soft px-3 py-2.5 text-left transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="font-tabular text-body font-medium text-ink">
                {formatCoins(pack.coins)} Coins
              </p>
              <p className="text-label text-ink-3">
                ${pack.dollars}
                {pack.bonus ? ` · ${pack.bonus}` : ""}
              </p>
            </button>
          ))}
        </div>
        {buying !== null && (
          <p className="text-label text-ink-3" role="status">
            Opening checkout…
          </p>
        )}
        {buyError && (
          <p className="text-label text-alarm" role="alert">
            {buyError}
          </p>
        )}
      </div>
    </Card>
  );
}
