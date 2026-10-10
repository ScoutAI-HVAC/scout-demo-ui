"use client";
import { useEffect, useState } from "react";
export default function ChatGreeting({ dayPart }: { dayPart?: string }) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    void fetch("/api/settings")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!stopped && typeof body?.profile?.displayName === "string") {
          setName(body.profile.displayName);
        }
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: { displayName: draft.trim() } }),
      });
      if (!response.ok) {
        throw new Error("Your name couldn't be saved. Please try again.");
      }
      setName(draft.trim());
      setEditing(false);
    } catch {
      setError("Your name couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <h1
        className={
          dayPart
            ? "greeting animate-fadeIn stagger-2 text-ink"
            : "text-[30px] font-semibold tracking-tight text-ink"
        }
      >
        <button
          type="button"
          aria-label="Personalize your greeting"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="min-h-11 max-w-full break-words rounded-lg focus-visible:outline-2 focus-visible:outline-terracotta"
        >
          {dayPart ? `${dayPart}${name ? `, ${name}` : ""}.` : name ? `Hi, ${name}.` : "Hi there."}
        </button>
      </h1>
      {!name && !editing && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          className="mt-2 min-h-11 rounded-full px-3 text-body text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-terracotta"
        >
          Add your name
        </button>
      )}
      {editing && (
        <form onSubmit={(event) => void save(event)} className="mx-auto mt-3 max-w-xs text-left">
          <label htmlFor="greeting-name" className="px-1 text-body text-ink-2">
            What should Scout call you?
          </label>
          <input
            id="greeting-name"
            autoFocus
            maxLength={60}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-full bg-paper-2 px-4 text-base text-ink outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="secondary-control"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="secondary-control">
              {saving ? "Saving…" : "Save name"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 px-1 text-label text-alarm">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
