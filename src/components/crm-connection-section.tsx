"use client";
import { AlertCircle, CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "@/components/button";
import { humanizeToken } from "@/lib/pro-case";
export type ProviderId = "servicetitan" | "housecallpro" | "fieldedge";
type FieldSpec = {
  field: string;
  label: string;
  secret: boolean;
  optional?: boolean;
};
const PROVIDER_FIELDS: Record<ProviderId, FieldSpec[]> = {
  servicetitan: [
    { field: "clientId", label: "Client ID", secret: false },
    { field: "clientSecret", label: "Client Secret", secret: true },
    { field: "apiKey", label: "App Key", secret: true },
    { field: "tenantId", label: "Tenant ID", secret: false },
  ],
  housecallpro: [
    { field: "apiKey", label: "API Key", secret: true },
    { field: "companyId", label: "Company ID (optional)", secret: false, optional: true },
  ],
  fieldedge: [
    { field: "clientId", label: "Client ID", secret: false },
    { field: "apiKey", label: "API Key", secret: true },
    { field: "tenantId", label: "Target ID", secret: false },
  ],
};
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  servicetitan: "ServiceTitan",
  housecallpro: "Housecall Pro",
  fieldedge: "FieldEdge",
};
interface CrmStatus {
  provider: string | null;
  fields: Record<string, boolean>;
  gateway: {
    adapter: string;
    available: boolean;
    mode?: string;
    message: string;
  } | null;
}
type Verdict = {
  ok: boolean;
  message: string;
} | null;
export default function CrmConnectionSection() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [provider, setProvider] = useState<ProviderId>("servicetitan");
  const [values, setValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/crm");
        if (!res.ok) return;
        const body: CrmStatus = await res.json();
        if (cancelled) return;
        setStatus(body);
        if (body.provider && body.provider in PROVIDER_FIELDS) {
          setProvider(body.provider as ProviderId);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const fields = PROVIDER_FIELDS[provider];
  const storedProviderMatches = status?.provider === provider;
  function payload(): Record<string, string> {
    const body: Record<string, string> = { provider };
    for (const { field } of fields) {
      const value = values[field]?.trim();
      if (value) body[field] = value;
    }
    return body;
  }
  async function testConnection() {
    setTesting(true);
    setVerdict(null);
    setSaveNote(null);
    try {
      const res = await fetch("/api/settings/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await res.json();
      setVerdict({
        ok: body.ok === true,
        message: String(body.message ?? (body.ok ? "Connected." : "Connection test failed.")),
      });
    } catch {
      setVerdict({ ok: false, message: "Connection test failed. Is Scout running?" });
    } finally {
      setTesting(false);
    }
  }
  async function saveConnection() {
    setSaving(true);
    setSaveNote(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings/crm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await res.json();
      if (!res.ok || body.success !== true) {
        setSaveError(String(body.error ?? "Save failed."));
        return;
      }
      setSaveNote(
        body.restartRequired
          ? "Saved. Scout switches to this connection on its next restart, then begins ingesting the book automatically."
          : "Saved.",
      );
    } catch {
      setSaveError("Save failed. Is Scout running?");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="sm:pr-10">
        <h2 className="text-title font-semibold text-ink">CRM Connection</h2>
        <p className="mt-1 text-body text-ink-3">
          Connect the shop&apos;s CRM and Scout ingests the whole book (customers, jobs, invoices,
          equipment, notes) and keeps it fresh on its own.
        </p>
      </div>

      {status?.gateway &&
        (status.gateway.mode !== "external" ? (
          <div className="flex items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
            <AlertCircle size={18} className="shrink-0 text-copper" />
            <p className="text-body text-ink">
              No CRM connected. Dropdowns and Booking Map job types are not live shop data until an
              external CRM is connected and the gateway restarts.
            </p>
          </div>
        ) : (
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              status.gateway.available
                ? "border-sage-soft bg-sage-tint"
                : "border-golden-soft bg-golden-tint"
            }`}
          >
            {status.gateway.available ? (
              <CheckCircle2 size={18} className="shrink-0 text-sage-deep" />
            ) : (
              <AlertCircle size={18} className="shrink-0 text-copper" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">
                Live now:{" "}
                {PROVIDER_LABELS[status.gateway.adapter as ProviderId] ??
                  humanizeToken(status.gateway.adapter)}
              </p>
              <p className="truncate text-label text-ink-2">{status.gateway.message}</p>
            </div>
          </div>
        ))}

      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label htmlFor="crm-provider" className="text-body font-medium text-ink-2">
            CRM provider
          </label>
          <select
            id="crm-provider"
            aria-label="CRM provider"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ProviderId);
              setValues({});
              setVerdict(null);
              setSaveNote(null);
              setSaveError(null);
            }}
            className="field w-full"
          >
            <option value="servicetitan">ServiceTitan</option>
            <option value="housecallpro">Housecall Pro</option>
            <option value="fieldedge">FieldEdge</option>
            <option value="jobber" disabled>
              Jobber (coming soon)
            </option>
          </select>
        </div>

        {fields.map(({ field, label, secret }) => {
          const saved = storedProviderMatches && status?.fields?.[field] === true;
          return (
            <div key={field} className="space-y-1.5">
              <label htmlFor={`crm-${field}`} className="text-body font-medium text-ink-2">
                {label}
              </label>
              <input
                id={`crm-${field}`}
                aria-label={label}
                type={secret ? "password" : "text"}
                autoComplete="off"
                value={values[field] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
                placeholder={saved ? "•••• saved · leave blank to keep" : ""}
                className="field w-full"
              />
            </div>
          );
        })}

        {verdict && (
          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${verdict.ok ? "bg-sage-tint" : "bg-terracotta-tint"}`}
          >
            {verdict.ok ? (
              <CheckCircle2 size={18} className="shrink-0 text-sage-deep" />
            ) : (
              <AlertCircle size={18} className="shrink-0 text-terracotta-deep" />
            )}
            <p className="text-body text-ink">{verdict.message}</p>
          </div>
        )}

        {saveNote && (
          <div className="flex items-center gap-3 rounded-2xl bg-sage-tint px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-sage-deep" />
            <p className="text-body text-ink">{saveNote}</p>
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-3 rounded-2xl bg-terracotta-tint px-4 py-3">
            <AlertCircle size={18} className="shrink-0 text-terracotta-deep" />
            <p className="text-body text-ink">{saveError}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="secondary"
            size="md"
            onClick={testConnection}
            disabled={testing || saving}
            icon={testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
          >
            Test connection
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={saveConnection}
            disabled={saving || testing}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Save connection
          </Button>
        </div>

        <p className="text-label text-ink-3">
          Keys are stored on this instance only and are never shown back once saved. Test uses
          exactly what you typed here, so a green check means these keys work.
        </p>
      </div>
    </div>
  );
}
