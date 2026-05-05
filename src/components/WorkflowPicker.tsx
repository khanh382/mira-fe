"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import type { WorkflowPickerOption } from "@/utils/workflowPickerData";

type Tr = (key: string, fallback: string) => string;

type Props = {
  value: string;
  onChange: (workflowId: string) => void;
  options: WorkflowPickerOption[];
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  tr: Tr;
  /** Optional override labels */
  label?: string;
};

function matchesQuery(opt: WorkflowPickerOption, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    opt.name.toLowerCase().includes(s) ||
    opt.code.toLowerCase().includes(s) ||
    opt.id.toLowerCase().includes(s)
  );
}

export function WorkflowPicker({
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
  id = "workflow-picker",
  tr,
  label,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, search)), [options, search]);
  const unknownId = Boolean(value.trim()) && !selected;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const labelText = label ?? tr("workflowSchedules.workflowField", "Workflow");

  return (
    <div className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
      <span id={`${id}-label`}>{labelText}</span>
      <div ref={rootRef} className="relative mt-1">
        <button
          type="button"
          id={id}
          disabled={disabled || loading}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          onClick={() => !disabled && !loading && setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-red-300 bg-white px-2 py-2 text-left text-sm text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500"
        >
          <span className="min-w-0 flex-1 truncate">
            {loading ? (
              <span className="text-zinc-500">{tr("workflowSchedules.workflowPickerLoading", "Loading workflows…")}</span>
            ) : selected ? (
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{selected.name}</span>
            ) : value.trim() ? (
              <span className="font-mono text-[11px] text-amber-800 dark:text-amber-200">{value}</span>
            ) : (
              <span className="text-zinc-500">{tr("workflowSchedules.workflowPickerPlaceholder", "Search or choose a workflow…")}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        </button>

        {open ? (
          <div
            className="absolute z-[100] mt-1 w-full overflow-hidden rounded-lg border border-red-200 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
            role="listbox"
            aria-label={labelText}
          >
            <div className="flex items-center gap-2 border-b border-red-100 px-2 py-1.5 dark:border-zinc-700">
              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("workflowSchedules.workflowSearchPlaceholder", "Search by name, code, or id…")}
                className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 dark:text-zinc-100"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setSearch("");
                    e.stopPropagation();
                  }
                }}
              />
            </div>
            <ul className="max-h-56 overflow-auto py-1 text-sm">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-zinc-500">
                  {tr("workflowSchedules.workflowPickerNoResults", "No workflows match your search.")}
                </li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt.id} role="option" aria-selected={opt.id === value}>
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-red-50 dark:hover:bg-zinc-800 ${
                        opt.id === value ? "bg-red-50/80 dark:bg-zinc-800/80" : ""
                      }`}
                      onClick={() => {
                        onChange(opt.id);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{opt.name}</span>
                      {opt.code ? (
                        <span className="font-mono text-[11px] text-zinc-500">{opt.code}</span>
                      ) : (
                        <span className="font-mono text-[11px] text-zinc-400">{opt.id.slice(0, 8)}…</span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {unknownId ? (
        <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
          {tr(
            "workflowSchedules.workflowPickerUnknownId",
            "This workflow id is not in your current list. Save only if the id is still valid on the server.",
          )}
        </p>
      ) : (
        <span className="mt-1 block text-[11px] text-zinc-500">
          {tr("workflowSchedules.workflowPickerHint", "Shown name comes from workflow_name / name; stored value is workflow id.")}
        </span>
      )}
    </div>
  );
}
