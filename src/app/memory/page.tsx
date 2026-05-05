"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import {
  createMemoryRag,
  deleteMemoryRag,
  getWorkspaceMemory,
  listMemoryRags,
  putWorkspaceMemory,
  updateMemoryRag,
  type CreateMemoryRagPayload,
  type MemoryRag,
  type MemoryRagStatus,
  type MemoryRagType,
  type UpdateMemoryRagPayload,
} from "@/services/MemoryService";
import { notify } from "@/utils/notify";

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

type RagFormState = {
  name: string;
  code: string;
  type: MemoryRagType;
  value: string;
  status: MemoryRagStatus;
};

const emptyRagForm: RagFormState = {
  name: "",
  code: "",
  type: "text",
  value: "",
  status: "active",
};

export default function MemoryPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const canAccess = user?.level === "owner" || user?.level === "colleague";

  const [wmEditorOpen, setWmEditorOpen] = useState(false);
  const [wmEditorLoading, setWmEditorLoading] = useState(false);
  const [wmModalError, setWmModalError] = useState("");
  const [wmSaving, setWmSaving] = useState(false);
  const [wmMeta, setWmMeta] = useState<{
    logicalPath: string;
    exists: boolean;
    updatedAt: string | null;
    maxBytes: number;
    identifier: string;
  } | null>(null);
  const [wmContent, setWmContent] = useState("");

  const [ragsLoading, setRagsLoading] = useState(false);
  const [rags, setRags] = useState<MemoryRag[]>([]);
  const [showCreateRag, setShowCreateRag] = useState(false);
  const [editingRag, setEditingRag] = useState<MemoryRag | null>(null);
  const [ragForm, setRagForm] = useState<RagFormState>(emptyRagForm);
  const [ragSaving, setRagSaving] = useState(false);
  const [deletingRagId, setDeletingRagId] = useState<number | null>(null);
  const [patchingRagId, setPatchingRagId] = useState<number | null>(null);

  const loadWorkspaceMemoryForEditor = async () => {
    setWmEditorLoading(true);
    setWmModalError("");
    try {
      const res = await getWorkspaceMemory();
      const d = res.data?.data;
      if (!d) {
        setWmMeta(null);
        setWmContent("");
        return;
      }
      setWmMeta({
        logicalPath: d.logicalPath,
        exists: d.exists,
        updatedAt: d.updatedAt,
        maxBytes: d.maxBytes,
        identifier: d.identifier,
      });
      setWmContent(d.content ?? "");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t("memory.workspaceLoadError");
      setWmModalError(msg === "memory.workspaceLoadError" ? "Could not load MEMORY.md." : msg);
      setWmMeta(null);
    } finally {
      setWmEditorLoading(false);
    }
  };

  const openWorkspaceEditor = () => {
    setWmModalError("");
    setWmEditorOpen(true);
    void loadWorkspaceMemoryForEditor();
  };

  const closeWorkspaceEditor = () => {
    setWmEditorOpen(false);
    setWmModalError("");
  };

  const loadRags = async () => {
    setRagsLoading(true);
    try {
      const res = await listMemoryRags();
      const raw: unknown = res?.data?.data;
      const list = Array.isArray(raw) ? (raw as MemoryRag[]) : [];
      setRags(list);
    } catch (e: unknown) {
      setRags([]);
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t("memory.ragsLoadError");
      notify.error(msg === "memory.ragsLoadError" ? "Could not load memory RAGs." : msg);
    } finally {
      setRagsLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    void loadRags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const onSaveWorkspaceMemory = async () => {
    if (!wmMeta) {
      setWmModalError(tr("memory.workspaceMetaMissing", "Load workspace memory first."));
      return;
    }
    const bytes = utf8ByteLength(wmContent);
    if (bytes > wmMeta.maxBytes) {
      setWmModalError(t("memory.workspaceTooLarge", { max: String(wmMeta.maxBytes) }));
      return;
    }
    setWmSaving(true);
    setWmModalError("");
    try {
      const res = await putWorkspaceMemory(wmContent);
      const d = res.data?.data;
      notify.success(tr("memory.workspaceSaved", "MEMORY.md updated."));
      if (d?.updatedAt) {
        setWmMeta((prev) =>
          prev ? { ...prev, exists: true, updatedAt: d.updatedAt } : prev,
        );
      }
      closeWorkspaceEditor();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("memory.workspaceSaveError", "Could not save MEMORY.md.");
      setWmModalError(msg);
    } finally {
      setWmSaving(false);
    }
  };

  const sortedRags = useMemo(() => [...rags].sort((a, b) => b.id - a.id), [rags]);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const openCreateRag = () => {
    setEditingRag(null);
    setRagForm({ ...emptyRagForm });
    setShowCreateRag(true);
  };

  const openEditRag = (rag: MemoryRag) => {
    setEditingRag(rag);
    setRagForm({
      name: rag.name,
      code: rag.code,
      type: rag.type,
      value: rag.value ?? "",
      status: rag.status,
    });
  };

  const closeRagModal = () => {
    setShowCreateRag(false);
    setEditingRag(null);
    setRagForm(emptyRagForm);
  };

  const validateJsonIfNeeded = (): string | null => {
    if (ragForm.type !== "json") return null;
    const v = ragForm.value.trim();
    if (!v) return null;
    try {
      JSON.parse(v);
      return null;
    } catch {
      return tr("memory.ragJsonInvalid", "Value must be valid JSON when type is JSON.");
    }
  };

  const onCreateRag = async () => {
    const name = ragForm.name.trim();
    const code = ragForm.code.trim();
    if (!name || !code) {
      notify.error(tr("memory.ragNameCodeRequired", "Name and code are required."));
      return;
    }
    const jErr = validateJsonIfNeeded();
    if (jErr) {
      notify.error(jErr);
      return;
    }
    setRagSaving(true);
    try {
      const payload: CreateMemoryRagPayload = {
        name,
        code,
        type: ragForm.type,
        status: ragForm.status,
        value: ragForm.value.trim() ? ragForm.value : null,
      };
      await createMemoryRag(payload);
      notify.success(tr("memory.ragCreated", "RAG created."));
      closeRagModal();
      await loadRags();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("memory.ragCreateError", "Could not create RAG.");
      notify.error(msg);
    } finally {
      setRagSaving(false);
    }
  };

  const onUpdateRag = async () => {
    if (!editingRag) return;
    const name = ragForm.name.trim();
    const code = ragForm.code.trim();
    if (!name || !code) {
      notify.error(tr("memory.ragNameCodeRequired", "Name and code are required."));
      return;
    }
    const jErr = validateJsonIfNeeded();
    if (jErr) {
      notify.error(jErr);
      return;
    }
    setRagSaving(true);
    try {
      const payload: UpdateMemoryRagPayload = {
        name,
        code,
        type: ragForm.type,
        status: ragForm.status,
        value: ragForm.value.trim() ? ragForm.value : null,
      };
      await updateMemoryRag(editingRag.id, payload);
      notify.success(tr("memory.ragUpdated", "RAG updated."));
      closeRagModal();
      await loadRags();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("memory.ragUpdateError", "Could not update RAG.");
      notify.error(msg);
    } finally {
      setRagSaving(false);
    }
  };

  const onDeleteRag = async (rag: MemoryRag) => {
    if (!window.confirm(tr("memory.ragConfirmDelete", "Delete this RAG? This cannot be undone."))) {
      return;
    }
    setDeletingRagId(rag.id);
    try {
      await deleteMemoryRag(rag.id);
      notify.success(tr("memory.ragDeleted", "RAG deleted."));
      await loadRags();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("memory.ragDeleteError", "Could not delete RAG.");
      notify.error(msg);
    } finally {
      setDeletingRagId(null);
    }
  };

  const onToggleRagStatus = async (rag: MemoryRag) => {
    const next: MemoryRagStatus = rag.status === "active" ? "inactive" : "active";
    setPatchingRagId(rag.id);
    try {
      await updateMemoryRag(rag.id, { status: next });
      notify.success(
        next === "active"
          ? tr("memory.ragActivated", "RAG activated.")
          : tr("memory.ragDeactivated", "RAG deactivated."),
      );
      await loadRags();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        tr("memory.ragToggleError", "Could not change status.");
      notify.error(msg);
    } finally {
      setPatchingRagId(null);
    }
  };

  const ragModalOpen = showCreateRag || editingRag !== null;
  const isEditingRag = editingRag !== null;

  if (!canAccess) {
    return (
      <div className="w-full min-w-0 space-y-3 p-2 sm:space-y-4 sm:p-4">
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
            {tr("memory.title", "Memory")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {tr(
              "memory.forbidden",
              "This area is only available for owner and colleague accounts.",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3 p-2 sm:space-y-4 sm:p-4">
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">{tr("memory.title", "Memory")}</h1>
        <p className="text-sm text-zinc-600">
          {tr(
            "memory.subtitle",
            "Edit workspace MEMORY.md and manage SQL memory RAGs (@code in chat when active).",
          )}
        </p>
      </div>

      <section className="w-full rounded-xl border border-red-200 bg-white p-4">
        <button
          type="button"
          onClick={openWorkspaceEditor}
          className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
        >
          {tr("memory.updateMemoryMd", "Update MEMORY.md")}
        </button>
      </section>

      {wmEditorOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-red-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {tr("memory.workspaceModalTitle", "Edit MEMORY.md")}
              </h3>
              <button
                type="button"
                onClick={closeWorkspaceEditor}
                disabled={wmSaving}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                aria-label={tr("memory.cancel", "Cancel")}
              >
                ×
              </button>
            </div>
            {wmModalError && (
              <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {wmModalError}
              </p>
            )}
            {wmEditorLoading ? (
              <p className="py-8 text-center text-sm text-zinc-500">{tr("memory.loading", "Loading…")}</p>
            ) : (
              <>
                {wmMeta && (
                  <p className="mb-2 text-xs text-zinc-500">
                    <span className="font-mono">{wmMeta.logicalPath}</span>
                    {" · "}
                    {wmMeta.exists
                      ? tr("memory.workspaceExists", "File exists")
                      : tr("memory.workspaceNew", "Not created yet — save will create it")}
                    {wmMeta.updatedAt ? ` · ${formatDate(wmMeta.updatedAt)}` : ""}
                    {" · "}
                    {t("memory.workspaceMaxBytes", { n: String(wmMeta.maxBytes) })}
                  </p>
                )}
                <textarea
                  className="min-h-[min(50vh,320px)] w-full rounded border border-red-300 px-3 py-2 font-mono text-sm"
                  value={wmContent}
                  onChange={(e) => setWmContent(e.target.value)}
                  disabled={!wmMeta}
                  placeholder={tr("memory.workspacePlaceholder", "Markdown content for MEMORY.md…")}
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeWorkspaceEditor}
                    disabled={wmSaving}
                    className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {tr("memory.cancel", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSaveWorkspaceMemory()}
                    disabled={wmSaving || !wmMeta}
                    className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {wmSaving ? tr("memory.saving", "Saving…") : tr("memory.saveWorkspace", "Save MEMORY.md")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <section className="w-full rounded-xl border border-red-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[rgb(173,8,8)]">
            {tr("memory.ragsSection", "Memory RAGs")}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadRags()}
              className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
            >
              {tr("memory.ragsReload", "Reload")}
            </button>
            <button
              type="button"
              onClick={openCreateRag}
              className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)]"
            >
              {tr("memory.ragAdd", "Add RAG")}
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-lg border border-red-200 shadow-sm">
          <table className="w-full min-w-[640px] table-auto divide-y divide-red-200 text-sm">
            <thead className="bg-red-50 text-zinc-700">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colId", "ID")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colCode", "Code")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colName", "Name")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colType", "Type")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colStatus", "Status")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  {tr("memory.colUpdated", "Updated")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                  {tr("memory.colActions", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white">
              {ragsLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                    {tr("memory.ragsLoading", "Loading RAGs…")}
                  </td>
                </tr>
              ) : sortedRags.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                    {tr("memory.ragsEmpty", "No RAGs yet. Add one to use @code in prompts.")}
                  </td>
                </tr>
              ) : (
                sortedRags.map((rag) => (
                  <tr key={rag.id} className="hover:bg-red-50/40">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-600">{rag.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-800">@{rag.code}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium text-zinc-800" title={rag.name}>
                      {rag.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {rag.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={
                          rag.status === "active"
                            ? "inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "inline-flex rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600"
                        }
                      >
                        {rag.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {formatDate(rag.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditRag(rag)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-zinc-700 hover:bg-red-50"
                        >
                          {tr("memory.edit", "Edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onToggleRagStatus(rag)}
                          disabled={patchingRagId === rag.id}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-zinc-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {rag.status === "active"
                            ? tr("memory.deactivate", "Deactivate")
                            : tr("memory.activate", "Activate")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteRag(rag)}
                          disabled={deletingRagId === rag.id}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {tr("memory.delete", "Delete")}
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

      {ragModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-red-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
                {isEditingRag
                  ? `${tr("memory.ragEditTitle", "Edit RAG")} #${editingRag?.id}`
                  : tr("memory.ragCreateTitle", "Add RAG")}
              </h3>
              <button
                type="button"
                onClick={closeRagModal}
                className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                ×
              </button>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("memory.colName", "Name")}
                </label>
                <input
                  className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                  value={ragForm.name}
                  onChange={(e) => setRagForm((f) => ({ ...f, name: e.target.value }))}
                  maxLength={255}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("memory.colCode", "Code")} ({tr("memory.codeHint", "unique; use as @code in chat")})
                </label>
                <input
                  className="w-full rounded border border-red-300 px-3 py-2 font-mono text-sm"
                  value={ragForm.code}
                  onChange={(e) => setRagForm((f) => ({ ...f, code: e.target.value }))}
                  maxLength={120}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {tr("memory.colType", "Type")}
                  </label>
                  <select
                    className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                    value={ragForm.type}
                    onChange={(e) => setRagForm((f) => ({ ...f, type: e.target.value as MemoryRagType }))}
                  >
                    <option value="text">text</option>
                    <option value="json">json</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {tr("memory.colStatus", "Status")}
                  </label>
                  <select
                    className="w-full rounded border border-red-300 px-3 py-2 text-sm"
                    value={ragForm.status}
                    onChange={(e) => setRagForm((f) => ({ ...f, status: e.target.value as MemoryRagStatus }))}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {tr("memory.valueLabel", "Value (markdown or JSON)")}
                </label>
                <textarea
                  className="min-h-[160px] w-full rounded border border-red-300 px-3 py-2 font-mono text-sm"
                  value={ragForm.value}
                  onChange={(e) => setRagForm((f) => ({ ...f, value: e.target.value }))}
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRagModal}
                  className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50"
                >
                  {tr("memory.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void (isEditingRag ? onUpdateRag() : onCreateRag())}
                  disabled={ragSaving}
                  className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-sm text-white hover:bg-[rgb(150,7,7)] disabled:opacity-60"
                >
                  {ragSaving ? tr("memory.saving", "Saving…") : tr("memory.save", "Save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
