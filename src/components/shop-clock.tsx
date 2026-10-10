"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeTimeZone, viewerTimeZone, type ShopClock } from "@/lib/shop-time";
const ShopClockContext = createContext<ShopClock>({});
export function ShopClockProvider({
  timeZone,
  viewerTimeZone: viewerOverride,
  children,
}: {
  timeZone?: string | null;
  viewerTimeZone?: string;
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState<string | undefined>(safeTimeZone(viewerOverride));
  useEffect(() => {
    setViewer(safeTimeZone(viewerOverride) ?? viewerTimeZone());
  }, [viewerOverride]);
  const value = useMemo<ShopClock>(
    () => ({ shop: safeTimeZone(timeZone), viewer }),
    [timeZone, viewer],
  );
  return <ShopClockContext.Provider value={value}>{children}</ShopClockContext.Provider>;
}
export function useShopClock(): ShopClock {
  return useContext(ShopClockContext);
}
