"use client";
import { useEffect, useState } from "react";
type Mapping = {
  name: string;
  phone: string;
  service: string;
  request: string;
  permission: {
    field: string;
    acceptedValue: string;
  };
};
type Question = {
  key: string;
  label: string;
  options?: {
    key: string;
    value: string;
  }[];
};
type Status = {
  configured: boolean;
  authorized: boolean;
  pages: {
    id: string;
    name: string;
  }[];
  connection: {
    pageId: string;
    pageName: string;
    formId: string;
    mapping: Mapping;
    enabled: boolean;
    paused: boolean;
    verifiedAt: number;
  } | null;
};
const endpoint = "/api/integrations/meta";
const fieldClass = "field mt-1.5 w-full py-2";
const buttonClass =
  "min-h-10 rounded-xl bg-terracotta px-4 text-body font-semibold text-on-accent disabled:opacity-40";
const blankMapping: Mapping = {
  name: "",
  phone: "",
  service: "",
  request: "",
  permission: { field: "", acceptedValue: "" },
};
const errors: Record<string, string> = {
  meta_platform_setup_required:
    "Scout's Meta app needs to be configured before this shop can connect.",
  meta_webhook_route_not_configured_for_this_shop:
    "Scout's Meta webhook is not configured for this shop yet. Contact your Scout administrator before connecting.",
  meta_page_permissions_missing:
    "Meta has not granted all required permissions for this Page. Reconnect and approve access to this Page.",
  meta_no_authorized_pages:
    "No Pages were authorized. Reconnect and select the Page that owns your lead form.",
  meta_too_many_pages:
    "Too many Pages were selected. Reconnect and grant access only to this shop's Page.",
  meta_access_needs_attention: "Meta could not verify access. Reconnect the Page and try again.",
  choose_active_form_for_page: "Choose an active form belonging to the selected Page.",
  map_required_form_fields:
    "Select the phone and SMS consent fields, and the exact value that means consent was granted.",
};
async function request(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...values }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      errors[data.error] ?? "Could not update the Meta connection. Please try again.",
    );
  return data;
}
export function MetaSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pageId, setPageId] = useState("");
  const [formId, setFormId] = useState("");
  const [forms, setForms] = useState<
    {
      id: string;
      name: string;
    }[]
  >([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mapping, setMapping] = useState<Mapping>(blankMapping);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("meta_connection");
    if (result) {
      setMessage(
        result === "connected"
          ? "Facebook access connected. Choose your Page and form, then enable lead intake."
          : "Facebook connection did not finish. Your existing connection was preserved. Please try again.",
      );
      url.searchParams.delete("meta_connection");
      window.history.replaceState(null, "", url);
    }
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Status>;
      })
      .then((data) => {
        if (!active) return;
        setStatus(data);
        setPageId(data.connection?.pageId ?? data.pages[0]?.id ?? "");
        setFormId(data.connection?.formId ?? "");
        setMapping(data.connection?.mapping ?? blankMapping);
      })
      .catch(() => {
        if (active)
          setMessage("Meta connection settings are unavailable. Check that Scout is running.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(action: "start" | "forms" | "form" | "save" | "test" | "pause") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await request(action, {
        pageId,
        formId,
        ...(action === "save" ? { mapping } : {}),
      });
      if (action === "start") {
        window.location.assign(data.url);
        return;
      }
      if (action === "forms") {
        setForms(data.forms);
        setMessage(
          data.moreAvailable
            ? "Showing the first 100 active forms. You can enter another form ID below."
            : data.forms.length
              ? "Choose a form below."
              : "No active lead forms were found on this Page.",
        );
        return;
      }
      if (action === "form") {
        setQuestions(data.questions);
        setMessage(
          "Match the fields below. Choose the answer that explicitly authorizes automated SMS.",
        );
        return;
      }
      setStatus(data);
      setMessage(
        action === "test"
          ? "Page, form, and webhook access verified. Submit a test lead to verify SMS and booking."
          : action === "pause"
            ? "Meta lead intake paused."
            : data.connection?.paused
              ? "Saved. This source is paused by your Scout administrator."
              : "Meta lead intake enabled. Scout will use this shop's existing CRM and booking settings.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect Meta.");
    } finally {
      setBusy(false);
    }
  }
  const consent = questions.find((q) => q.key === mapping.permission.field);
  const canSave = Boolean(
    pageId &&
    formId &&
    questions.length &&
    mapping.phone &&
    mapping.permission.field &&
    mapping.permission.acceptedValue,
  );
  return (
    <section className="space-y-5" aria-label="Meta lead connection">
      <h2 className="text-title font-semibold text-ink">Facebook & Instagram leads</h2>
      <p className="text-body text-ink-2">
        Connect the Facebook Page that owns your lead form. Scout uses your existing shop, CRM, and
        booking settings.
      </p>
      <p role="status">
        {status?.connection?.enabled
          ? "Meta lead intake enabled"
          : status?.connection
            ? "Meta lead intake paused"
            : "Meta not connected"}
      </p>
      {status && !status.configured && (
        <p className="text-body text-ink-2">
          Your Scout administrator needs to finish the Meta app setup for this shop.
        </p>
      )}
      <button
        className={buttonClass}
        disabled={busy || !status?.configured}
        onClick={() => void act("start")}
      >
        {status?.authorized ? "Reconnect with Facebook" : "Connect with Facebook"}
      </button>
      {!!status?.pages.length && (
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-body font-medium text-ink-2">
            Facebook Page
            <select
              aria-label="Facebook Page"
              className={fieldClass}
              value={pageId}
              onChange={(event) => {
                setPageId(event.target.value);
                setFormId("");
                setForms([]);
                setQuestions([]);
                setMapping(blankMapping);
              }}
            >
              <option value="">Choose a Page</option>
              {status.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass} disabled={!pageId} onClick={() => void act("forms")}>
            Find lead forms
          </button>
          {!!forms.length && (
            <label className="block text-body font-medium text-ink-2">
              Lead form
              <select
                aria-label="Lead form"
                className={fieldClass}
                value={formId}
                onChange={(event) => {
                  setFormId(event.target.value);
                  setQuestions([]);
                  setMapping(blankMapping);
                }}
              >
                <option value="">Choose a form</option>
                {forms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-body font-medium text-ink-2">
            Form ID
            <input
              className={fieldClass}
              value={formId}
              inputMode="numeric"
              onChange={(event) => {
                setFormId(event.target.value);
                setQuestions([]);
                setMapping(blankMapping);
              }}
            />
          </label>
          <button
            className={buttonClass}
            disabled={!/^\d+$/.test(formId)}
            onClick={() => void act("form")}
          >
            Load form fields
          </button>
          {!!questions.length && (
            <>
              {(
                [
                  ["name", "Name (optional)"],
                  ["phone", "Phone number"],
                  ["service", "Service requested (optional)"],
                  ["request", "Problem description (optional)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-body font-medium text-ink-2">
                  {label}
                  <select
                    className={fieldClass}
                    value={mapping[key]}
                    onChange={(event) => setMapping({ ...mapping, [key]: event.target.value })}
                  >
                    <option value="">
                      {key === "phone" ? "Choose phone field" : "Not collected"}
                    </option>
                    {questions.map((question) => (
                      <option key={question.key} value={question.key}>
                        {question.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="block text-body font-medium text-ink-2">
                SMS consent question
                <select
                  className={fieldClass}
                  value={mapping.permission.field}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      permission: { field: event.target.value, acceptedValue: "" },
                    })
                  }
                >
                  <option value="">Choose the SMS consent question</option>
                  {questions.map((question) => (
                    <option key={question.key} value={question.key}>
                      {question.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-body font-medium text-ink-2">
                Answer that grants automated SMS consent
                {consent?.options?.length ? (
                  <select
                    className={fieldClass}
                    value={mapping.permission.acceptedValue}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        permission: { ...mapping.permission, acceptedValue: event.target.value },
                      })
                    }
                  >
                    <option value="">Choose the explicit consent answer</option>
                    {consent.options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={fieldClass}
                    value={mapping.permission.acceptedValue}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        permission: { ...mapping.permission, acceptedValue: event.target.value },
                      })
                    }
                  />
                )}
              </label>
              <p className="text-body text-ink-2">
                Scout only texts leads whose answer matches this consent value. A phone number alone
                does not enable texting.
              </p>
            </>
          )}
          <button className={buttonClass} disabled={!canSave} onClick={() => void act("save")}>
            Save and enable lead intake
          </button>
        </fieldset>
      )}
      {status?.connection && (
        <div className="flex gap-3">
          <button className={buttonClass} disabled={busy} onClick={() => void act("test")}>
            Test connection
          </button>
          <button
            className={buttonClass}
            disabled={busy || !status.connection.enabled}
            onClick={() => void act("pause")}
          >
            Pause Meta leads
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="text-body">
          {message}
        </p>
      )}
    </section>
  );
}
