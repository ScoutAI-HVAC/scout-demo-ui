"use client";
import { useEffect, useState } from "react";
import { useShopClock } from "@/components/shop-clock";
import { shopStamp } from "@/lib/shop-time";
type Status = {
  configured: boolean;
  authorized: boolean;
  accountId: string;
  loginCustomerId: string;
  clientId: string;
  clientSecretSet: boolean;
  redirectUri: string;
  verifiedAt: number | null;
  responsesEnabled: boolean;
  leadSampleCount?: number;
  sync?: {
    lastSuccess: number | null;
    nextAttempt: number;
    error: string | null;
  } | null;
};
const endpoint = "/api/integrations/google-lsa";
const field = "field mt-1.5 w-full py-2";
export function GoogleLsaSettings() {
  const clock = useShopClock();
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState({
    accountId: "",
    loginCustomerId: "",
    clientId: "",
    clientSecret: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google_lsa");
    if (result) {
      setMessage(
        result === "connected"
          ? "Google connected. Check lead access below."
          : "Google connection did not finish. Check that the customer ID belongs to your Local Services account, then authorize again.",
      );
      url.searchParams.delete("google_lsa");
      window.history.replaceState(null, "", url);
    }
    fetch(endpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Status>;
      })
      .then((data) => {
        if (!active) return;
        setStatus(data);
        setDraft({
          accountId: data.accountId,
          loginCustomerId: data.loginCustomerId,
          clientId: data.clientId,
          clientSecret: "",
        });
      })
      .catch(() => {
        if (active)
          setMessage("Google connection settings are unavailable. Check that Scout is running.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(action: "save" | "start" | "test" | "sync" | "disconnect") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "save" ? { action, ...draft } : { action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(
          `Connection needs attention: ${String(data.error ?? "request_failed").replaceAll("_", " ")}.`,
        );
        return;
      }
      if (action === "start") {
        window.location.assign(data.url);
        return;
      }
      setStatus((current) =>
        action === "sync" && current ? { ...current, sync: data.sync } : data,
      );
      setDraft((current) => ({ ...current, clientSecret: "" }));
      setMessage(
        action === "test"
          ? `Google access verified. ${data.leadSampleCount} leads in the test sample. No messages sent.`
          : action === "sync"
            ? data.sync?.error
              ? "Google sync needs attention."
              : "Lead sync checked. Scout handles new inquiries automatically when enabled."
            : action === "disconnect"
              ? "Google disconnected. Saved leads remain available after reconnecting."
              : "Saved securely. Authorize Google to verify this account.",
      );
    } catch {
      setMessage("Could not reach Scout. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5" aria-label="Google LSA connection">
      <h2 className="text-title font-semibold text-ink">Google Local Services Ads</h2>
      <p className="text-body text-ink-2">
        Connect the Google account that owns your Local Services campaign. Your CRM connection and
        booking settings are configured separately in Settings.
      </p>
      <p role="status">
        {status?.authorized ? "Google account authorized" : "Google account not connected"}
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void act("save");
        }}
      >
        {(
          [
            ["accountId", "Google Ads customer ID"],
            ["loginCustomerId", "Manager customer ID (optional)"],
            ["clientId", "Google OAuth client ID"],
            ["clientSecret", "Google OAuth client secret"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block text-body font-medium text-ink-2">
            {label}
            <input
              className={field}
              type={name === "clientSecret" ? "password" : "text"}
              autoComplete="off"
              value={draft[name]}
              required={
                name === "accountId" ||
                name === "clientId" ||
                (name === "clientSecret" && !status?.clientSecretSet)
              }
              placeholder={
                name === "clientSecret" && status?.clientSecretSet
                  ? "Saved securely; leave blank to keep"
                  : undefined
              }
              onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
            />
          </label>
        ))}
        <p className="text-label text-ink-3">
          Use a Web application OAuth client with this authorized redirect URI:
        </p>
        <code className="block break-all rounded-xl bg-paper-2 px-3 py-2 text-label">
          {status?.redirectUri ?? "Loading…"}
        </code>
        <p className="text-label text-ink-3">
          Enable Google Ads API in the OAuth client’s Cloud project and obtain Explorer access or
          higher. Credentials stay on your Scout server.
        </p>
        <button className="secondary-control" disabled={busy} type="submit">
          Save Google settings
        </button>
      </form>
      <div className="flex flex-wrap gap-3">
        <button
          className="secondary-control"
          disabled={busy || !status?.configured}
          onClick={() => void act("start")}
        >
          Authorize Google
        </button>
        <button
          className="secondary-control"
          disabled={busy || !status?.authorized}
          onClick={() => void act("test")}
        >
          Test lead access
        </button>
      </div>
      {status?.authorized && (
        <div className="space-y-2 text-body">
          <p>
            {status.sync?.lastSuccess
              ? `Last lead sync: ${shopStamp(status.sync.lastSuccess, clock)}`
              : "Waiting for the first lead sync."}
          </p>
          {status.sync?.error && (
            <p role="alert">Google sync needs attention. Recheck access or try again later.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="secondary-control" disabled={busy} onClick={() => void act("sync")}>
              Sync leads
            </button>
            <button
              className="secondary-control"
              disabled={busy}
              onClick={() => void act("disconnect")}
            >
              Disconnect Google
            </button>
          </div>
          <p className="text-label text-ink-3">
            Scout checks for leads about every two minutes. Existing leads import without outreach.
            Reply to message leads through Google in the Speed to Lead inbox.
          </p>
        </div>
      )}
      <p role="status" className="text-body">
        {message}
      </p>
      <div className="rounded-2xl bg-golden-tint p-4 text-body">
        <strong>
          {status?.responsesEnabled
            ? "Scout replies to new Google message leads."
            : "Automatic responses are not enabled."}
        </strong>
        <p>
          {status?.responsesEnabled
            ? "Watch conversations in Speed to Lead. Scout checks availability and books after the customer confirms. You can take over any conversation."
            : "Connect Google and enable this source to let Scout respond. Existing leads import without outreach."}
        </p>
      </div>
    </section>
  );
}
