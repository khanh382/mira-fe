"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslation, useLang } from "@/lang";
import type { LangCodes } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import {
  createConnectWebhookKey,
  deleteConnectWebhookKey,
  getConnectWebhookUsageEvents,
  getConnectWebhookUsageSummary,
  listConnectWebhookKeys,
  patchConnectWebhookKey,
  refreshConnectWebhookKey,
  type ConnectWebhookRow,
  type CwStatus,
  type UsageEventsResponse,
  type UsageSummary,
} from "@/services/ConnectWebhookService";

function PageChrome({ children }: { children: React.ReactNode }) {
  return <div className="w-full space-y-4 p-4">{children}</div>;
}

export default function WebhooksPage() {
  const router = useRouter();
  const { user, isChecking } = useAuth();
  const { t, lang } = useLang();

  /** `useLang().t` is a new function every render — never use it inside useCallback/reloadKeys deps or effects re-run forever. */
  const tRef = useRef(getTranslation(lang as LangCodes));
  useEffect(() => {
    tRef.current = getTranslation(lang as LangCodes);
  }, [lang]);

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const [loading, setLoading] = useState(false);
  const [hasListed, setHasListed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [items, setItems] = useState<ConnectWebhookRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createDomain, setCreateDomain] = useState("");

  const [revealedKey, setRevealedKey] = useState<{ title: string; apiKey: string } | null>(null);

  const [configureRow, setConfigureRow] = useState<ConnectWebhookRow | null>(null);
  const [cfgSubdomains, setCfgSubdomains] = useState(false);
  const [cfgStatus, setCfgStatus] = useState<CwStatus>("active");
  const [guideOpen, setGuideOpen] = useState(false);

  const [usageFor, setUsageFor] = useState<ConnectWebhookRow | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEventsResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageErr, setUsageErr] = useState("");
  const [eventsOffset, setEventsOffset] = useState(0);
  /** Active filter for summary + events (ISO strings); empty = server default 30d */
  const [usageRange, setUsageRange] = useState<{ from?: string; to?: string }>({});
  const [usageFromInput, setUsageFromInput] = useState("");
  const [usageToInput, setUsageToInput] = useState("");

  const localToIso = (s: string) => {
    if (!s?.trim()) return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const loadUsage = useCallback(async (row: ConnectWebhookRow, offset: number, range: { from?: string; to?: string }) => {
    setUsageLoading(true);
    setUsageErr("");
    const hasAny = Boolean(range.from || range.to);
    const params = hasAny ? { from: range.from, to: range.to } : undefined;
    try {
      const [summary, events] = await Promise.all([
        getConnectWebhookUsageSummary(row.cwId, params),
        getConnectWebhookUsageEvents(row.cwId, { ...params, limit: 50, offset }),
      ]);
      setUsageSummary(summary);
      setUsageEvents(events);
      setEventsOffset(offset);
      setUsageRange({ ...(params || {}) });
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      const fb = tRef.current("webhooks.usageLoadError");
      setUsageErr(msg || (fb === "webhooks.usageLoadError" ? "Could not load usage." : fb));
      setUsageSummary(null);
      setUsageEvents(null);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const openUsage = (row: ConnectWebhookRow) => {
    setUsageFor(row);
    setUsageFromInput("");
    setUsageToInput("");
    setUsageErr("");
    setUsageSummary(null);
    setUsageEvents(null);
    setEventsOffset(0);
    setUsageRange({});
    void loadUsage(row, 0, {});
  };

  const closeUsage = () => {
    setUsageFor(null);
    setUsageErr("");
  };

  const applyUsageDateFilter = () => {
    if (!usageFor) return;
    if ((usageFromInput && !usageToInput) || (!usageFromInput && usageToInput)) {
      setUsageErr(tr("webhooks.usageRangeBothOrNone", "Set both “from” and “to”, or clear both for the default (last 30 days)."));
      return;
    }
    if (usageFromInput && usageToInput) {
      const f = localToIso(usageFromInput);
      const t = localToIso(usageToInput);
      if (!f || !t) {
        setUsageErr(tr("webhooks.usageRangeInvalid", "Invalid date range."));
        return;
      }
      if (f > t) {
        setUsageErr(tr("webhooks.usageFromBeforeTo", "“From” must be before “to”."));
        return;
      }
      setUsageErr("");
      void loadUsage(usageFor, 0, { from: f, to: t });
    } else {
      setUsageErr("");
      void loadUsage(usageFor, 0, {});
    }
  };

  const reloadKeys = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listConnectWebhookKeys();
      setItems(list);
    } catch (e: unknown) {
      setItems([]);
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      const fb = tRef.current("webhooks.loadError");
      setError(msg || (fb === "webhooks.loadError" ? "Could not load webhook keys." : fb));
    } finally {
      setLoading(false);
      setHasListed(true);
    }
  }, []);

  useEffect(() => {
    if (isChecking) return;
    if (user?.level !== "owner") {
      router.replace("/");
    }
  }, [isChecking, user?.level, router]);

  useEffect(() => {
    if (isChecking || user?.level !== "owner") return;
    void reloadKeys();
  }, [isChecking, user?.level, reloadKeys]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.cwDomain.localeCompare(b.cwDomain)),
    [items],
  );

  const thirdPartyChatUrl = useMemo(() => {
    const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
    if (!base) return "";
    return `${base}/connect-webhooks/v1/chat`;
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(tr("webhooks.copied", "Copied to clipboard."));
    } catch {
      setError(tr("webhooks.copyFailed", "Could not copy."));
    }
  };

  const onCreate = async () => {
    const d = createDomain.trim();
    if (!d) {
      setError(tr("webhooks.validationDomain", "Please enter a domain."));
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await createConnectWebhookKey(d);
      setItems((prev) => {
        const next = prev.filter((x) => x.cwId !== res.row.cwId);
        return [...next, res.row].sort((a, b) => a.cwDomain.localeCompare(b.cwDomain));
      });
      setShowCreate(false);
      setCreateDomain("");
      setRevealedKey({
        title: tr("webhooks.secretTitleCreate", "API key created"),
        apiKey: res.apiKey,
      });
      setMessage(tr("webhooks.created", "Webhook key created. Store the secret safely — it will not be shown again."));
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg || tr("webhooks.createError", "Could not create webhook key."));
    } finally {
      setSaving(false);
    }
  };

  const openConfigure = (row: ConnectWebhookRow) => {
    setConfigureRow(row);
    setCfgSubdomains(row.cwUseSubdomains);
    setCfgStatus(row.cwStatus);
    setError("");
    setMessage("");
  };

  const onSaveConfigure = async () => {
    if (!configureRow) return;
    const payload: { cwUseSubdomains?: boolean; cwStatus?: CwStatus } = {};
    if (cfgSubdomains !== configureRow.cwUseSubdomains) payload.cwUseSubdomains = cfgSubdomains;
    if (cfgStatus !== configureRow.cwStatus) payload.cwStatus = cfgStatus;
    if (Object.keys(payload).length === 0) {
      setConfigureRow(null);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await patchConnectWebhookKey(configureRow.cwId, payload);
      setItems((prev) => prev.map((x) => (x.cwId === updated.cwId ? updated : x)));
      setConfigureRow(null);
      setMessage(tr("webhooks.updated", "Settings updated."));
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg || tr("webhooks.updateError", "Could not update settings."));
    } finally {
      setSaving(false);
    }
  };

  const onRotate = async (row: ConnectWebhookRow) => {
    if (
      !window.confirm(
        tr(
          "webhooks.confirmRotate",
          "Rotate the API key? The old key will stop working immediately after rotation.",
        ),
      )
    ) {
      return;
    }
    setRefreshingId(row.cwId);
    setError("");
    setMessage("");
    try {
      const res = await refreshConnectWebhookKey(row.cwId);
      setItems((prev) => prev.map((x) => (x.cwId === res.row.cwId ? res.row : x)));
      setRevealedKey({
        title: tr("webhooks.secretTitleRotate", "New API key"),
        apiKey: res.apiKey,
      });
      setMessage(tr("webhooks.rotated", "Key rotated. Save the new secret — it will not be shown again."));
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg || tr("webhooks.rotateError", "Could not rotate key."));
    } finally {
      setRefreshingId(null);
    }
  };

  const onDelete = async (row: ConnectWebhookRow) => {
    if (!window.confirm(tr("webhooks.confirmDelete", "Delete this API key? Usage history will be removed."))) {
      return;
    }
    setDeletingId(row.cwId);
    setError("");
    setMessage("");
    try {
      await deleteConnectWebhookKey(row.cwId);
      setItems((prev) => prev.filter((x) => x.cwId !== row.cwId));
      setMessage(tr("webhooks.deleted", "API key deleted."));
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg || tr("webhooks.deleteError", "Could not delete key."));
    } finally {
      setDeletingId(null);
    }
  };

  const tableBusy = loading || !hasListed;

  if (isChecking) {
    return (
      <PageChrome>
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-white p-10">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-[rgb(173,8,8)] border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-zinc-500">{tr("webhooks.authLoading", "Checking session…")}</p>
        </div>
      </PageChrome>
    );
  }

  if (user?.level !== "owner") {
    return (
      <PageChrome>
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-2 rounded-xl border border-red-100 bg-white p-10">
          <p className="text-sm text-zinc-600">{tr("webhooks.ownerOnly", "This page is only available to the owner account.")}</p>
          <p className="text-xs text-zinc-400">{tr("webhooks.redirecting", "Redirecting…")}</p>
        </div>
      </PageChrome>
    );
  }

  return (
    <PageChrome>
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">{tr("webhooks.title", "Connect Webhooks")}</h1>
        <p className="text-sm text-zinc-600">{tr("webhooks.subtitle", "Owner only: issue and manage Bearer API keys per apex domain. Calls to the public Connect Webhook / Smart Router LLM API are made by the partner’s backend from their domain — not from this console.")}</p>

        <div className="mt-5 border-t border-red-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(173,8,8)]">
              {tr("webhooks.guideTitle", "Third-party integration")}
            </h2>
            <button
              type="button"
              onClick={() => setGuideOpen((o) => !o)}
              className="shrink-0 rounded-lg border border-red-200 bg-red-50/80 px-3 py-1.5 text-xs font-medium text-[rgb(173,8,8)] transition hover:border-red-300 hover:bg-red-100/80"
              aria-expanded={guideOpen}
            >
              {guideOpen
                ? tr("webhooks.guideCollapse", "Hide guide")
                : tr("webhooks.guideExpand", "Show guide")}
            </button>
          </div>
          {guideOpen ? (
            <div className="mt-3">
              <p className="text-sm leading-relaxed text-zinc-600">
                {tr("webhooks.guideIntro", "Give each partner one API key tied to their apex domain. They integrate from their own servers — not from this dashboard.")}
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
                <li>{tr("webhooks.guideBullet1", "Keep the Bearer secret on the partner backend only. Do not ship it to browsers or mobile clients.")}</li>
                <li>
                  {tr(
                    "webhooks.guideBullet2",
                    "Send HTTP POST with Content-Type application/json. Body includes messages: an array of { role, content } with role limited to system, user, or assistant (no tools / skill-calling in this API).",
                  )}
                </li>
                <li>
                  {tr(
                    "webhooks.guideBullet3",
                    "Headers: Authorization: Bearer <key>; Origin or Referer must use a host allowed for that key (registered domain, or subdomains if you enabled them). Server-to-server calls should set Origin or Referer to the partner site URL.",
                  )}
                </li>
                <li>{tr("webhooks.guideBullet4", "Optional JSON fields: temperature, maxTokens, model (to pin a specific model instead of router default).")}</li>
                <li>
                  {tr(
                    "webhooks.guideBullet5",
                    "Success responses return model text, token usage, and routing metadata. For browser-side calls you must configure CORS on the API gateway; calling from the partner backend avoids that.",
                  )}
                </li>
              </ul>
              {thirdPartyChatUrl ? (
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-xs font-medium text-zinc-600">
                    {tr("webhooks.guideExampleUrl", "Example chat URL (prepend your configured API host):")}
                  </p>
                  <code className="mt-1 block break-all font-mono text-xs text-zinc-800">{thirdPartyChatUrl}</code>
                  <p className="mt-2 text-xs text-zinc-500">
                    {tr("webhooks.guideUrlNote", "If your deployment mounts routes under another prefix (e.g. /api/v1), adjust the path to match your server.")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-700">{message}</p>
      )}
      {error && <p className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="w-full rounded-xl border border-red-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[rgb(173,8,8)]">{tr("webhooks.list", "API keys by domain")}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reloadKeys()}
              className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
            >
              {tr("webhooks.reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateDomain("");
                setShowCreate(true);
                setError("");
              }}
              className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("webhooks.create", "Add API key")}
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-lg border border-red-200 shadow-sm">
          <table className="w-full min-w-[900px] table-auto divide-y divide-red-200 text-sm">
            <thead className="bg-red-50 text-zinc-700">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.id", "ID")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.domain", "Domain")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.subdomains", "Subdomains")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.expiresAfterRotate", "Key rotation expiry")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.status", "Status")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("webhooks.createdAt", "Created")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">{tr("webhooks.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white">
              {tableBusy ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[rgb(173,8,8)] border-t-transparent"
                        aria-hidden
                      />
                      {tr("webhooks.loading", "Loading...")}
                    </span>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                    {tr("webhooks.empty", "No keys yet. Add one for an apex domain (e.g. partner.com).")}
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  <tr key={row.cwId} className="hover:bg-red-50/40">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600">{row.cwId}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-medium text-zinc-800" title={row.cwDomain}>
                      {row.cwDomain}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.cwUseSubdomains ? (
                        <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {tr("webhooks.subdomainsOn", "Allowed")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">
                          {tr("webhooks.subdomainsOff", "Apex only")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600">{formatDate(row.cwExpired)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                          row.cwStatus === "active"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-zinc-300 bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {row.cwStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDate(row.createAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openUsage(row)}
                          className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                        >
                          {tr("webhooks.stats", "Stats")}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConfigure(row)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-zinc-700 hover:bg-red-50"
                        >
                          {tr("webhooks.configure", "Configure")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onRotate(row)}
                          disabled={refreshingId === row.cwId}
                          className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {refreshingId === row.cwId ? "…" : tr("webhooks.rotate", "Rotate")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(row)}
                          disabled={deletingId === row.cwId}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {tr("webhooks.delete", "Delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">{tr("webhooks.create", "Add API key")}</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("webhooks.close", "Close")}
              >
                ×
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">{tr("webhooks.domain", "Domain")}</label>
            <input
              className="mb-2 w-full rounded border border-red-300 px-3 py-2 text-sm"
              value={createDomain}
              onChange={(e) => setCreateDomain(e.target.value)}
              placeholder="https://Partner.COM"
            />
            <p className="mb-4 text-xs text-zinc-500">{tr("webhooks.domainHint", "Apex domain only, no path. Normalized to hostname; must be unique.")}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("webhooks.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void onCreate()}
                disabled={saving}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:opacity-60"
              >
                {saving ? tr("webhooks.saving", "Saving...") : tr("webhooks.create", "Add API key")}
              </button>
            </div>
          </div>
        </div>
      )}

      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-amber-900">{revealedKey.title}</h3>
            <p className="mt-2 text-sm text-amber-950">{tr("webhooks.secretWarn", "Copy this Bearer token now. It cannot be retrieved later.")}</p>
            <div className="mt-3 flex gap-2">
              <code className="flex-1 break-all rounded border border-amber-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900">
                {revealedKey.apiKey}
              </code>
              <button
                type="button"
                onClick={() => void copyText(revealedKey.apiKey)}
                className="shrink-0 rounded border border-amber-400 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-200"
              >
                {tr("webhooks.copy", "Copy")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="mt-4 w-full rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("webhooks.done", "Done")}
            </button>
          </div>
        </div>
      )}

      {configureRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("webhooks.configure", "Configure")} · {configureRow.cwDomain}
              </h3>
              <button type="button" onClick={() => setConfigureRow(null)} className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100">
                ×
              </button>
            </div>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={cfgSubdomains}
                onChange={(e) => setCfgSubdomains(e.target.checked)}
                className="rounded border-red-300"
              />
              {tr("webhooks.allowSubdomains", "Allow *.domain (subdomains)")}
            </label>
            <label className="mb-1 mt-2 block text-xs font-medium text-zinc-600">{tr("webhooks.status", "Status")}</label>
            <select
              className="mb-4 w-full rounded border border-red-300 px-3 py-2 text-sm"
              value={cfgStatus}
              onChange={(e) => setCfgStatus(e.target.value as CwStatus)}
            >
              <option value="active">{tr("webhooks.statusActive", "active")}</option>
              <option value="inactive">{tr("webhooks.statusInactive", "inactive")}</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfigureRow(null)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("webhooks.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void onSaveConfigure()}
                disabled={saving}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:opacity-60"
              >
                {saving ? tr("webhooks.saving", "Saving...") : tr("webhooks.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {usageFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-red-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">{tr("webhooks.usageTitle", "Usage & tokens")}</h3>
                <p className="text-sm text-zinc-600">{usageFor.cwDomain}</p>
                <p className="mt-1 text-xs text-zinc-500">{tr("webhooks.usageScopeHint", "Per domain. Based on successful webhook calls recorded by the server.")}</p>
              </div>
              <button
                type="button"
                onClick={() => closeUsage()}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("webhooks.close", "Close")}
              >
                ×
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-zinc-600">{tr("webhooks.filterFrom", "From")}</label>
                <input
                  type="datetime-local"
                  className="rounded border border-red-200 bg-white px-2 py-1.5 text-xs"
                  value={usageFromInput}
                  onChange={(e) => setUsageFromInput(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-zinc-600">{tr("webhooks.filterTo", "To")}</label>
                <input
                  type="datetime-local"
                  className="rounded border border-red-200 bg-white px-2 py-1.5 text-xs"
                  value={usageToInput}
                  onChange={(e) => setUsageToInput(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => applyUsageDateFilter()}
                disabled={usageLoading}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-900 disabled:opacity-50"
              >
                {tr("webhooks.filterApply", "Apply range")}
              </button>
              <p className="w-full text-xs text-zinc-500">{tr("webhooks.filterHint", "Empty both = last 30 days. Set both to filter, or use Apply with both empty to reset.")}</p>
            </div>

            {usageErr && <p className="mb-3 text-sm text-red-600">{usageErr}</p>}

            {usageLoading ? (
              <p className="py-10 text-center text-zinc-500">{tr("webhooks.usageLoading", "Loading usage...")}</p>
            ) : usageSummary ? (
              <>
                <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="text-xs text-zinc-600">{tr("webhooks.totalCalls", "Total calls")}</div>
                    <div className="text-lg font-semibold text-zinc-900">{usageSummary.totalCalls}</div>
                  </div>
                  <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="text-xs text-zinc-600">{tr("webhooks.promptTokens", "Prompt tokens")}</div>
                    <div className="text-lg font-semibold text-zinc-900">{usageSummary.promptTokens}</div>
                  </div>
                  <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="text-xs text-zinc-600">{tr("webhooks.completionTokens", "Completion tokens")}</div>
                    <div className="text-lg font-semibold text-zinc-900">{usageSummary.completionTokens}</div>
                  </div>
                  <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="text-xs text-zinc-600">{tr("webhooks.totalTokens", "Total tokens")}</div>
                    <div className="text-lg font-semibold text-zinc-900">{usageSummary.totalTokens}</div>
                  </div>
                </div>
                <p className="mb-3 text-xs text-zinc-500">
                  {tr("webhooks.usageRange", "Range")}: {formatDate(usageSummary.from)} — {formatDate(usageSummary.to)}
                </p>
              </>
            ) : !usageErr ? (
              <p className="py-6 text-center text-sm text-zinc-500">{tr("webhooks.noUsage", "No usage data.")}</p>
            ) : null}

            {usageEvents && !usageLoading && (
              <div>
                {usageEvents.items.length === 0 ? (
                  <p className="text-sm text-zinc-500">{tr("webhooks.noUsageEvents", "No individual events in this range.")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-red-200">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="bg-red-50 text-left text-zinc-700">
                        <tr>
                          <th className="px-2 py-2">{tr("webhooks.eventTime", "Time")}</th>
                          <th className="px-2 py-2">{tr("webhooks.eventModel", "Model")}</th>
                          <th className="px-2 py-2">{tr("webhooks.eventTokens", "Tokens")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {usageEvents.items.map((ev) => (
                          <tr key={ev.id}>
                            <td className="whitespace-nowrap px-2 py-1.5 text-zinc-700">{formatDate(ev.createdAt)}</td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 font-mono text-zinc-600" title={ev.model}>
                              {ev.model}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-zinc-700">{ev.totalTokens}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {usageEvents.total > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
                    <span>
                      {tr("webhooks.eventsPage", "Showing")}{" "}
                      {usageEvents.items.length === 0
                        ? "0"
                        : `${usageEvents.offset + 1}–${usageEvents.offset + usageEvents.items.length}`}{" "}
                      / {usageEvents.total}
                    </span>
                    {usageEvents.total > usageEvents.limit || eventsOffset > 0 ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={usageLoading || eventsOffset === 0}
                          onClick={() => void loadUsage(usageFor, Math.max(0, eventsOffset - 50), usageRange)}
                          className="rounded border border-red-300 px-3 py-1 text-zinc-800 hover:bg-red-50 disabled:opacity-50"
                        >
                          {tr("webhooks.prev", "Previous")}
                        </button>
                        <button
                          type="button"
                          disabled={usageLoading || eventsOffset + usageEvents.items.length >= usageEvents.total}
                          onClick={() => void loadUsage(usageFor, eventsOffset + 50, usageRange)}
                          className="rounded border border-red-300 px-3 py-1 text-zinc-800 hover:bg-red-50 disabled:opacity-50"
                        >
                          {tr("webhooks.next", "Next")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void loadUsage(usageFor, eventsOffset, usageRange)}
                disabled={usageLoading}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-red-50 disabled:opacity-50"
              >
                {tr("webhooks.refreshUsage", "Refresh")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
