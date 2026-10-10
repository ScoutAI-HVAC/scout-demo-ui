import { Database, PhoneIncoming, UserPlus } from "lucide-react";
export type CustomerProvenance = "in_crm" | "new_from_call" | "captured";
export function provenanceOf(matchStatus: string | undefined): CustomerProvenance {
  if (matchStatus === "exact_phone" || matchStatus === "matched") return "in_crm";
  if (matchStatus === "created") return "new_from_call";
  return "captured";
}
const CONFIG: Record<
  CustomerProvenance,
  {
    label: string;
    icon: typeof Database;
    dot: string;
    text: string;
    ring: string;
  }
> = {
  in_crm: {
    label: "Existing customer",
    icon: Database,
    dot: "bg-skyblue",
    text: "text-skyblue",
    ring: "ring-2 ring-skyblue/50 ring-offset-1 ring-offset-paper",
  },
  new_from_call: {
    label: "New customer",
    icon: UserPlus,
    dot: "bg-terracotta",
    text: "text-terracotta-deep",
    ring: "",
  },
  captured: {
    label: "No customer data",
    icon: PhoneIncoming,
    dot: "bg-ink/25",
    text: "text-ink-4",
    ring: "",
  },
};
export function provenanceRing(p: CustomerProvenance): string {
  return CONFIG[p].ring;
}
export function CustomerProvenanceTag({
  provenance,
  className = "",
}: {
  provenance: CustomerProvenance;
  className?: string;
}) {
  const c = CONFIG[provenance];
  return (
    <span
      className={`inline-flex items-center gap-1 text-caption font-medium ${c.text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
export function CustomerProvenanceBanner({ provenance }: { provenance: CustomerProvenance }) {
  const c = CONFIG[provenance];
  const Icon = c.icon;
  const note =
    provenance === "in_crm"
      ? "Matched to a record already in the CRM."
      : provenance === "new_from_call"
        ? "Scout created this record from the call - details are unverified."
        : "No CRM record matched; details are only what was heard on the call.";
  const heading =
    provenance === "in_crm"
      ? "Existing customer"
      : provenance === "new_from_call"
        ? "New customer"
        : "No customer data";
  return (
    <div className={`mb-2 flex items-center gap-1.5 text-label font-semibold ${c.text}`}>
      <Icon size={13} />
      <span className="uppercase tracking-wide">{heading}</span>
      <span className="font-normal normal-case text-ink-4">· {note}</span>
    </div>
  );
}
