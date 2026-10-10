import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { cookies } from "next/headers";
import AppUpdate from "@/components/app-update";
import { CampaignPhonePrivacyProvider } from "@/components/campaign-phone-privacy";
import Dock from "@/components/dock";
import ServiceStatus from "@/components/service-status";
import SettingsModal from "@/components/settings-modal";
import { ShopClockProvider } from "@/components/shop-clock";
import SideDock from "@/components/side-dock";
import TopStrip from "@/components/top-strip";
import {
  SESSION_COOKIE_NAME,
  TECH_SESSION_COOKIE_NAME,
  verifySession,
  verifyTechSession,
} from "@/lib/auth";
import { getCompanyName, readScoutConfig } from "@/lib/scouthvac-config";
import { normalizeShopTrade } from "@/lib/shop-trades";
import { speedToLeadUiEnabled } from "@/lib/speed-to-lead/demo-access";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
export const dynamic = "force-dynamic";
function resolveCompanyName(config: unknown): string {
  const name = getCompanyName(config);
  const trade = normalizeShopTrade(
    (
      config as {
        company?: {
          trade?: unknown;
        };
      } | null
    )?.company?.trade,
  );
  const fallback = trade === "hvac" ? "your HVAC company" : "your service company";
  return name === fallback ? "" : name;
}
export const metadata: Metadata = {
  title: "Scout - AI Front Office for Service Businesses",
  applicationName: "Scout",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Scout", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/scout-brand-v1/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icons/scout-brand-v1/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/scout-brand-v1/apple-touch-icon-180.png",
  },
  description:
    "Scout runs your service business 24/7 - answers calls, follows up on estimates, processes paperwork, supports techs in the field, and briefs you every morning.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await readScoutConfig();
  const companyName = resolveCompanyName(config);
  const shopTimeZone = (
    config as {
      company?: {
        businessHours?: {
          timezone?: unknown;
        };
      };
    } | null
  )?.company?.businessHours?.timezone;
  const cookieStore = await cookies();
  const ownerOk = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const isTech =
    !ownerOk && verifyTechSession(cookieStore.get(TECH_SESSION_COOKIE_NAME)?.value) !== null;
  const speedToLead = speedToLeadUiEnabled();
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="scene-atmosphere min-h-full bg-cream text-ink">
        <AppUpdate />
        <CampaignPhonePrivacyProvider enabled={config?.dashboard?.campaignPhonePrivacy === true}>
          <ShopClockProvider timeZone={typeof shopTimeZone === "string" ? shopTimeZone : undefined}>
            <div className="sm:hidden">
              <TopStrip companyName={companyName} isTech={isTech} speedToLead={speedToLead} />
            </div>
            {!isTech && <SideDock companyName={companyName} speedToLead={speedToLead} />}
            <SettingsModal speedToLead={speedToLead} />

            <main className="min-h-screen overflow-x-clip pt-[calc(5.5rem+var(--safe-t))] pb-[var(--dock-clearance,8.5rem)] sm:pt-10 sm:pl-[var(--shell-left,0px)] sm:transition-[padding-left] sm:duration-200">
              <div className="animate-pageEnter mx-auto w-full max-w-[1600px] px-4 sm:px-8 xl:px-12">
                {ownerOk && <ServiceStatus />}
                {children}
              </div>
            </main>
            {!isTech && (
              <div className="sm:hidden">
                <Dock speedToLead={speedToLead} />
              </div>
            )}
          </ShopClockProvider>
        </CampaignPhonePrivacyProvider>
      </body>
    </html>
  );
}
