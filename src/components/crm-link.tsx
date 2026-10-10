"use client";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
const CRM_HOMES: Record<
  string,
  {
    label: string;
    url: (id: string) => string | null;
  }
> = {
  servicetitan: {
    label: "ServiceTitan",
    url: (id) => `https://go.servicetitan.com/#/Customer/${encodeURIComponent(id)}`,
  },
  housecallpro: {
    label: "Housecall Pro",
    url: (id) => `https://pro.housecallpro.com/app/customers/${encodeURIComponent(id)}`,
  },
  jobber: { label: "Jobber", url: jobberClientUrl },
};
function jobberClientUrl(id: string): string | null {
  let decoded: string;
  try {
    decoded = atob(id);
  } catch {
    return null;
  }
  const match = /^gid:\/\/Jobber\/Client\/(\d+)$/.exec(decoded);
  return match ? `https://secure.getjobber.com/clients/${match[1]}` : null;
}
const CRM_NAMES: Record<string, string> = {
  servicetitan: "ServiceTitan",
  housecallpro: "Housecall Pro",
  fieldedge: "FieldEdge",
  jobber: "Jobber",
};
export function useCrmName(): string {
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/settings/crm")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            provider?: unknown;
          } | null,
        ) => {
          if (live && body && typeof body.provider === "string") {
            setProvider(body.provider);
          }
        },
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (provider && CRM_NAMES[provider]) || "your CRM";
}
export function CrmCustomerLink({
  customerId,
  className = "",
  labelClassName,
}: {
  customerId: string | null | undefined;
  className?: string;
  labelClassName?: string;
}) {
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/settings/crm")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            provider?: unknown;
          } | null,
        ) => {
          if (live && body && typeof body.provider === "string") {
            setProvider(body.provider);
          }
        },
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const home = provider ? CRM_HOMES[provider] : undefined;
  const href = customerId && home ? home.url(customerId) : null;
  if (!href || !home) {
    return null;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...(labelClassName
        ? { "aria-label": `Open in ${home.label}`, title: `Open in ${home.label}` }
        : { title: `Open this customer in ${home.label}` })}
      className={`secondary-control ${className}`}
    >
      <ArrowUpRight size={16} aria-hidden="true" />
      <span className={labelClassName}>{home.label}</span>
    </a>
  );
}
