"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lang";
import {
  createMyWebsite,
  deleteMyWebsite,
  listMyWebsites,
  updateMyWebsite,
  type CreateMyWebsitePayload,
  type MyWebsite,
  type UpdateMyWebsitePayload,
  type WebsiteAuthType,
} from "@/services/WebsiteService";

type FormState = {
  domain: string;
  authType: WebsiteAuthType;
  headerName: string;
  username: string;
  token: string;
  note: string;
};

const emptyForm: FormState = {
  domain: "",
  authType: "bearer",
  headerName: "",
  username: "",
  token: "",
  note: "",
};

export default function WebsitesPage() {
  const { t } = useLang();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [items, setItems] = useState<MyWebsite[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MyWebsite | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listMyWebsites();
      const raw: unknown = res?.data?.data;
      const list = Array.isArray(raw) ? (raw as MyWebsite[]) : [];
      setItems(list);
    } catch (e: any) {
      setItems([]);
      setError(e?.response?.data?.message || tr("websites.loadError", "Could not load websites."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.domain.localeCompare(b.domain)),
    [items],
  );

  const authTypeLabel = (type: WebsiteAuthType) => {
    switch (type) {
      case "api_key":
        return tr("websites.authTypeApiKey", "API key");
      case "bearer":
        return tr("websites.authTypeBearer", "Bearer");
      case "basic":
        return tr("websites.authTypeBasic", "Basic");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setMessage("");
    setError("");
    setShowCreate(true);
  };

  const openEdit = (item: MyWebsite) => {
    setEditing(item);
    setForm({
      domain: item.domain || "",
      authType: item.authType,
      headerName: item.headerName || "",
      username: item.username || "",
      token: "",
      note: item.note || "",
    });
    setMessage("");
    setError("");
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditing(null);
    setForm({ ...emptyForm });
  };

  const validate = (mode: "create" | "edit"): string | null => {
    const domain = form.domain.trim();
    if (!domain) return tr("websites.validationDomainRequired", "Please enter a domain.");
    if (mode === "create" && !form.token.trim()) {
      return tr("websites.validationTokenRequired", "Please enter a token.");
    }
    if (form.authType === "api_key" && !form.headerName.trim()) {
      return tr("websites.validationHeaderRequired", "Please enter a header name for API key auth.");
    }
    if (form.authType === "basic" && !form.username.trim()) {
      return tr("websites.validationUsernameRequired", "Please enter a username for Basic auth.");
    }
    return null;
  };

  const onCreate = async () => {
    const err = validate("create");
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: CreateMyWebsitePayload = {
        domain: form.domain.trim(),
        authType: form.authType,
        token: form.token,
        headerName: form.authType === "api_key" ? form.headerName.trim() : null,
        username: form.authType === "basic" ? form.username.trim() : null,
        note: form.note.trim() ? form.note.trim() : null,
      };
      await createMyWebsite(payload);
      setMessage(tr("websites.created", "Website created."));
      closeModal();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("websites.createError", "Could not create website."));
    } finally {
      setSaving(false);
    }
  };

  const onUpdate = async () => {
    if (!editing) return;
    const err = validate("edit");
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: UpdateMyWebsitePayload = {
        domain: form.domain.trim(),
        authType: form.authType,
        headerName: form.authType === "api_key" ? form.headerName.trim() : null,
        username: form.authType === "basic" ? form.username.trim() : null,
        note: form.note.trim() ? form.note.trim() : null,
      };
      if (form.token.trim()) {
        payload.token = form.token;
      }
      await updateMyWebsite(editing.id, payload);
      setMessage(tr("websites.updated", "Website updated."));
      closeModal();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("websites.updateError", "Could not update website."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item: MyWebsite) => {
    if (!window.confirm(tr("websites.confirmDelete", "Delete this website? This action cannot be undone."))) {
      return;
    }
    setDeletingId(item.id);
    setError("");
    setMessage("");
    try {
      await deleteMyWebsite(item.id);
      setMessage(tr("websites.deleted", "Website deleted."));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || tr("websites.deleteError", "Could not delete website."));
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const isEditing = editing !== null;
  const modalOpen = showCreate || isEditing;

  return (
    <div className="w-full min-w-0 space-y-3 p-2 sm:space-y-4 sm:p-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
          {tr("websites.title", "My Websites")}
        </h1>
        <p className="text-sm text-zinc-600">
          {tr("websites.subtitle", "Manage external domains and their auth tokens for HTTP integrations.")}
        </p>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <section className="w-full rounded-xl border border-red-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[rgb(173,8,8)]">
            {tr("websites.list", "Website list")}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
            >
              {tr("websites.reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("websites.create", "Add website")}
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-lg border border-red-200 shadow-sm">
          <table className="w-full min-w-[900px] table-auto divide-y divide-red-200 text-sm">
            <thead className="bg-red-50 text-zinc-700">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.id", "ID")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.code", "Code")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.domain", "Domain")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.authType", "Auth type")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.headerName", "Header name")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.username", "Username")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">{tr("websites.updatedAt", "Updated at")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">{tr("websites.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                    {tr("websites.loading", "Loading websites...")}
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                    {tr("websites.empty", "No websites yet.")}
                  </td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr key={item.id} className="hover:bg-red-50/40">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600">{item.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-700">{item.code || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-800">{item.domain}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {authTypeLabel(item.authType)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{item.headerName || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{item.username || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDate(item.updatedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-300 text-zinc-700 hover:bg-red-50"
                          aria-label={tr("websites.update", "Update website")}
                          title={tr("websites.update", "Update website")}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                            <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" />
                            <path d="m13 7 4 4" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(item)}
                          disabled={deletingId === item.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={tr("websites.delete", "Delete")}
                          title={tr("websites.delete", "Delete")}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                            <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M10 11v6m4-6v6" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
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

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {isEditing
                  ? `${tr("websites.update", "Update website")} #${editing?.id} (${editing?.code || "-"})`
                  : tr("websites.create", "Add website")}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
                aria-label={tr("websites.close", "Close")}
                title={tr("websites.close", "Close")}
              >
                x
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("websites.domain", "Domain")}
                </label>
                <input
                  className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  placeholder="api.example.com"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {tr("websites.domainHint", "Domain is normalized to lowercase, without www. and protocol.")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("websites.authType", "Auth type")}
                </label>
                <select
                  className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                  value={form.authType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, authType: e.target.value as WebsiteAuthType }))
                  }
                >
                  <option value="bearer">{tr("websites.authTypeBearer", "Bearer")}</option>
                  <option value="api_key">{tr("websites.authTypeApiKey", "API key")}</option>
                  <option value="basic">{tr("websites.authTypeBasic", "Basic")}</option>
                </select>
              </div>

              {form.authType === "api_key" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {tr("websites.headerName", "Header name")}
                  </label>
                  <input
                    className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                    value={form.headerName}
                    onChange={(e) => setForm((f) => ({ ...f, headerName: e.target.value }))}
                    placeholder="x-api-key"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {tr("websites.headerNameHint", "Required when auth type is API key.")}
                  </p>
                </div>
              ) : form.authType === "basic" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {tr("websites.username", "Username")}
                  </label>
                  <input
                    className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="admin"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {tr("websites.usernameHint", "Required when auth type is Basic.")}
                  </p>
                </div>
              ) : (
                <div />
              )}

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("websites.token", "Token / Password")}
                </label>
                <input
                  type="password"
                  className="w-full rounded border border-red-300 px-3 py-2 text-sm font-mono"
                  value={form.token}
                  onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                  placeholder={
                    isEditing
                      ? "••••••••  (" + tr("websites.tokenHintUpdate", "leave blank to keep current") + ")"
                      : ""
                  }
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {isEditing
                    ? tr(
                        "websites.tokenHintUpdate",
                        "Leave blank to keep current token. Enter a new value only if you want to rotate.",
                      )
                    : tr(
                        "websites.tokenHintCreate",
                        "Token will be stored securely; the server never returns it back.",
                      )}
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("websites.note", "Note")}
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder={tr("websites.notePlaceholder", "e.g. CRM API integration")}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-red-300 px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
              >
                {tr("websites.back", "Back")}
              </button>
              <button
                type="button"
                onClick={() => void (isEditing ? onUpdate() : onCreate())}
                disabled={saving}
                className="rounded bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? tr("websites.saving", "Saving...")
                  : isEditing
                    ? tr("websites.update", "Update website")
                    : tr("websites.create", "Add website")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
