import { notFound } from "next/navigation";
import { LeadWorkspace, type View } from "@/components/speed-to-lead/workspace";
const VIEWS: View[] = ["analytics", "history", "inbox", "partners", "voice"];
export default async function SpeedToLeadView({
  params,
}: {
  params: Promise<{
    view: string;
  }>;
}) {
  const { view } = await params;
  if (!VIEWS.includes(view as View)) {
    notFound();
  }
  return <LeadWorkspace view={view as View} />;
}
