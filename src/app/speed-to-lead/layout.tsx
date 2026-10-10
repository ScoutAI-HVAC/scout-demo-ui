import { notFound } from "next/navigation";
import { DemoProvider } from "@/components/speed-to-lead/demo-provider";
import { speedToLeadDemoEnabled, speedToLeadUiEnabled } from "@/lib/speed-to-lead/demo-access";
export const dynamic = "force-dynamic";
export default function SpeedToLeadLayout({ children }: { children: React.ReactNode }) {
  if (!speedToLeadUiEnabled()) notFound();
  return (
    <DemoProvider startedAt={Date.now()} isDemo={speedToLeadDemoEnabled()}>
      {children}
    </DemoProvider>
  );
}
