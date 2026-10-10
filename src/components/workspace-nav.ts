import { Banknote, MessageSquare, Phone, Zap } from "lucide-react";
import ScoutMark from "@/components/scout-mark";
export function workspaceNav(speedToLead: boolean) {
  return [
    { href: "/chat", label: "Chat", icon: ScoutMark },
    { href: "/flows", label: "Campaigns", icon: Banknote },
    { href: "/inbox", label: "Messaging", icon: MessageSquare },
    { href: "/calls", label: "Phone", icon: Phone },
    ...(speedToLead ? [{ href: "/speed-to-lead", label: "Speed to Lead", icon: Zap }] : []),
  ];
}
