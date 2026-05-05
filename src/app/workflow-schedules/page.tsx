"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/utils/notify";
import { ScheduleCronBuilder } from "@/components/ScheduleCronBuilder";
import {
  activateWorkflowSchedule,
  createScheduledPayload,
  createWorkflowSchedule,
  deleteScheduledPayload,
  deleteWorkflowSchedule,
  disableWorkflowSchedule,
  getWorkflowScheduleDetail,
  getWorkflowScheduleRuns,
  listWorkflowSchedules,
  pauseWorkflowSchedule,
  type ScheduledPayloadRow,
  type ScheduledPayloadTypeApi,
  type WorkflowScheduleDetailResponse,
  type WorkflowScheduleRecord,
  type WorkflowScheduleStatus,
  updateScheduledPayload,
  updateWorkflowSchedule,
} from "@/services/WorkflowScheduleService";
import { WorkflowPicker } from "@/components/WorkflowPicker";
import {
  buildCronExpression,
  defaultCronBuilderState,
  getCronBuilderIssues,
  parseCronExpression,
  type CronBuilderState,
} from "@/utils/workflowCronUi";
import { fetchWorkflowPickerOptions, type WorkflowPickerOption } from "@/utils/workflowPickerData";
import {
  getFixedJsonParseIssue,
  validatePayloadValueByType,
} from "@/utils/scheduledPayloadValidate";

type TabKey = "overview" | "payloads" | "runs";

const PAYLOAD_TYPES: ScheduledPayloadTypeApi[] = ["fixed", "step", "loop", "random"];

/** Ngưỡng doc: sau N tick lỗi liên tiếp backend có thể auto-disabled (thường 3). */
const SCHEDULER_AUTO_DISABLE_AFTER_FAILS = 3;

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function previewJson(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function WorkflowSchedulesPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const canAccess = user?.level === "owner" || user?.level === "colleague";
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  /** `tr` đổi mỗi render — không được đưa vào deps của useCallback dùng trong useEffect (gây vòng lặp gọi API). */
  const trRef = useRef(tr);
  trRef.current = tr;

  const [loadingList, setLoadingList] = useState(true);
  const [schedules, setSchedules] = useState<WorkflowScheduleRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WorkflowScheduleDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createCronUi, setCreateCronUi] = useState<CronBuilderState>(() => defaultCronBuilderState());
  const [createForm, setCreateForm] = useState({
    name: "",
    workflowId: "",
    workflowSetPayload: false,
    maxRetries: "",
    timeoutMs: "",
  });

  const [overviewCronUi, setOverviewCronUi] = useState<CronBuilderState>(() => defaultCronBuilderState());
  const [overviewDraft, setOverviewDraft] = useState({
    name: "",
    workflowId: "",
    workflowSetPayload: false,
    maxRetries: "",
    timeoutMs: "",
  });

  const [runsLoading, setRunsLoading] = useState(false);
  const [runsPage, setRunsPage] = useState(1);
  const [runsLimit] = useState(20);
  const [runsTotalPages, setRunsTotalPages] = useState(1);
  const [runsItems, setRunsItems] = useState<
    Array<{
      id: number;
      sessionId?: string;
      turnInSession?: number;
      output?: unknown;
      error?: string | null;
      createdAt?: string;
    }>
  >([]);

  const [payloadModal, setPayloadModal] = useState<{
    mode: "create" | "edit";
    row?: ScheduledPayloadRow;
  } | null>(null);
  const [payloadForm, setPayloadForm] = useState({
    keyName: "",
    payloadType: "fixed" as ScheduledPayloadTypeApi,
    sp_value: "",
  });
  const [payloadSaving, setPayloadSaving] = useState(false);

  const [workflowOptions, setWorkflowOptions] = useState<WorkflowPickerOption[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);

  const workflowNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of workflowOptions) {
      m[o.id] = o.name;
    }
    return m;
  }, [workflowOptions]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = await listWorkflowSchedules();
      const list = Array.isArray(rows) ? rows : [];
      setSchedules(list);
      setSelectedId((prev) => {
        if (prev != null && list.some((r) => r.id === prev)) return prev;
        return null;
      });
    } catch (e: unknown) {
      setSchedules([]);
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || trRef.current("workflowSchedules.loadError", "Could not load schedules."));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (taskId: number) => {
      setLoadingDetail(true);
      try {
        const d = await getWorkflowScheduleDetail(taskId);
        setDetail(d);
        setOverviewDraft({
          name: d.schedule.name || "",
          workflowId: String(d.schedule.workflowId || ""),
          workflowSetPayload: Boolean(d.schedule.workflowSetPayload),
          maxRetries: d.schedule.maxRetries != null ? String(d.schedule.maxRetries) : "",
          timeoutMs: d.schedule.timeoutMs != null ? String(d.schedule.timeoutMs) : "",
        });
        setOverviewCronUi(parseCronExpression(String(d.schedule.cronExpression || "")));
      } catch (e: unknown) {
        setDetail(null);
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        notify.error(msg || trRef.current("workflowSchedules.loadError", "Could not load schedules."));
      } finally {
        setLoadingDetail(false);
      }
    },
    [],
  );

  const loadRuns = useCallback(
    async (taskId: number, page: number) => {
      setRunsLoading(true);
      try {
        const data = await getWorkflowScheduleRuns(taskId, page, runsLimit);
        setRunsItems(Array.isArray(data.items) ? data.items : []);
        setRunsTotalPages(Math.max(1, data.totalPages || 1));
        setRunsPage(data.page || page);
      } catch (e: unknown) {
        setRunsItems([]);
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        notify.error(msg || trRef.current("workflowSchedules.runsLoadError", "Could not load run history."));
      } finally {
        setRunsLoading(false);
      }
    },
    [runsLimit],
  );

  useEffect(() => {
    if (!canAccess) {
      setLoadingList(false);
      setSchedules([]);
      setSelectedId(null);
      setDetail(null);
      return;
    }
    void loadList();
  }, [loadList, canAccess]);

  useEffect(() => {
    if (!canAccess) {
      setWorkflowsLoading(false);
      setWorkflowOptions([]);
      return;
    }
    let ignore = false;
    setWorkflowsLoading(true);
    void (async () => {
      try {
        const opts = await fetchWorkflowPickerOptions();
        if (!ignore) setWorkflowOptions(opts);
      } catch {
        if (!ignore) setWorkflowOptions([]);
      } finally {
        if (!ignore) setWorkflowsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) {
      setDetail(null);
      return;
    }
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    if (tab !== "runs" || selectedId == null) return;
    void loadRuns(selectedId, runsPage);
  }, [tab, selectedId, runsPage, loadRuns, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void loadList();
      if (selectedId != null) void loadDetail(selectedId);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadList, loadDetail, selectedId, canAccess]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (createOpen) {
        setCreateOpen(false);
        e.preventDefault();
        return;
      }
      if (payloadModal) {
        setPayloadModal(null);
        e.preventDefault();
        return;
      }
      if (selectedId != null) {
        setSelectedId(null);
        setTab("overview");
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, payloadModal, selectedId]);

  const selectedSchedule = useMemo(() => {
    if (selectedId == null) return null;
    return schedules.find((s) => s.id === selectedId) || detail?.schedule || null;
  }, [schedules, selectedId, detail]);

  const statusBadge = (status: WorkflowScheduleStatus) => {
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
    if (status === "active") {
      return (
        <span className={`${base} border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`}>
          {tr("workflowSchedules.statusActive", "Active")}
        </span>
      );
    }
    if (status === "paused") {
      return (
        <span className={`${base} border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100`}>
          {tr("workflowSchedules.statusPaused", "Paused")}
        </span>
      );
    }
    return (
      <span className={`${base} border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200`}>
        {tr("workflowSchedules.statusDisabled", "Disabled")}
      </span>
    );
  };

  const onCreate = async () => {
    const name = createForm.name.trim();
    const workflowId = createForm.workflowId.trim();
    if (!name || !workflowId) {
      notify.error(tr("workflowSchedules.validation", "Fill name and workflow ID."));
      return;
    }
    const cronIssues = getCronBuilderIssues(createCronUi);
    const cronExpression = buildCronExpression(createCronUi).trim();
    if (cronIssues.length > 0 || !cronExpression) {
      const msg =
        cronIssues[0]?.kind === "dailyTimesMixedMinutes"
          ? tr(
              "workflowSchedules.cronSaveBlockedMixedTimes",
              "Fix daily times (same minute for all hours), switch to Advanced cron, or create multiple schedules.",
            )
          : cronIssues[0]?.kind === "everyMinutesNotExpressible"
            ? tr(
                "workflowSchedules.cronSaveBlockedInterval",
                "This interval cannot be expressed as one standard cron. Use Advanced cron or a supported interval (e.g. 1–59 minutes or 60, 120, …).",
              )
            : tr("workflowSchedules.cronSaveBlocked", "Fix the schedule expression before saving.");
      notify.error(msg);
      return;
    }
    setSavingSchedule(true);
    try {
      await createWorkflowSchedule({
        name,
        cronExpression,
        workflowId,
        workflowSetPayload: createForm.workflowSetPayload,
        maxRetries: createForm.maxRetries.trim() ? Number(createForm.maxRetries) : undefined,
        timeoutMs: createForm.timeoutMs.trim() ? Number(createForm.timeoutMs) : undefined,
      });
      notify.success(tr("workflowSchedules.created", "Schedule created."));
      setCreateOpen(false);
      setCreateCronUi(defaultCronBuilderState());
      setCreateForm({
        name: "",
        workflowId: "",
        workflowSetPayload: false,
        maxRetries: "",
        timeoutMs: "",
      });
      await loadList();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.createError", "Could not create schedule."));
    } finally {
      setSavingSchedule(false);
    }
  };

  const onSaveOverview = async () => {
    if (selectedId == null) return;
    const cronIssues = getCronBuilderIssues(overviewCronUi);
    const cronExpr = buildCronExpression(overviewCronUi).trim();
    if (cronIssues.length > 0 || !cronExpr) {
      const msg =
        cronIssues[0]?.kind === "dailyTimesMixedMinutes"
          ? tr(
              "workflowSchedules.cronSaveBlockedMixedTimes",
              "Fix daily times (same minute for all hours), switch to Advanced cron, or create multiple schedules.",
            )
          : cronIssues[0]?.kind === "everyMinutesNotExpressible"
            ? tr(
                "workflowSchedules.cronSaveBlockedInterval",
                "This interval cannot be expressed as one standard cron. Use Advanced cron or a supported interval (e.g. 1–59 minutes or 60, 120, …).",
              )
            : tr("workflowSchedules.cronSaveBlocked", "Fix the schedule expression before saving.");
      notify.error(msg);
      return;
    }
    setSavingSchedule(true);
    try {
      const payload: Parameters<typeof updateWorkflowSchedule>[1] = {
        name: overviewDraft.name.trim(),
        cronExpression: cronExpr,
        workflowId: overviewDraft.workflowId.trim(),
        workflowSetPayload: overviewDraft.workflowSetPayload,
      };
      if (overviewDraft.maxRetries.trim()) {
        payload.maxRetries = Number(overviewDraft.maxRetries);
      } else {
        payload.maxRetries = undefined;
      }
      if (overviewDraft.timeoutMs.trim()) {
        payload.timeoutMs = Number(overviewDraft.timeoutMs);
      } else {
        payload.timeoutMs = undefined;
      }

      await updateWorkflowSchedule(selectedId, payload);
      notify.success(tr("workflowSchedules.updated", "Schedule updated."));
      await loadList();
      await loadDetail(selectedId);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.updateError", "Could not update schedule."));
    } finally {
      setSavingSchedule(false);
    }
  };

  const runTransition = async (
    fn: (id: number) => ReturnType<typeof activateWorkflowSchedule>,
    okMsg: string,
  ) => {
    if (selectedId == null) return;
    setBusyId(selectedId);
    try {
      await fn(selectedId);
      notify.success(okMsg);
      await loadList();
      await loadDetail(selectedId);
      if (tab === "runs") void loadRuns(selectedId, runsPage);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.transitionError", "Could not change schedule status."));
    } finally {
      setBusyId(null);
    }
  };

  const onDeleteSchedule = async () => {
    if (selectedId == null) return;
    if (!window.confirm(tr("workflowSchedules.confirmDelete", "Delete this schedule?"))) return;
    setBusyId(selectedId);
    try {
      await deleteWorkflowSchedule(selectedId);
      notify.success(tr("workflowSchedules.deleted", "Schedule deleted."));
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.deleteError", "Could not delete schedule."));
    } finally {
      setBusyId(null);
    }
  };

  const copySession = async () => {
    const sid = detail?.schedule?.scheduleSessionId;
    if (!sid || typeof navigator.clipboard?.writeText !== "function") return;
    try {
      await navigator.clipboard.writeText(String(sid));
      notify.success(tr("workflowSchedules.copied", "Copied."));
    } catch {
      notify.error(tr("workflowSchedules.copyFailed", "Could not copy."));
    }
  };

  const copyRunCell = async (text: string | null | undefined) => {
    const s = (text ?? "").trim();
    if (!s) return;
    if (typeof navigator.clipboard?.writeText !== "function") {
      notify.error(tr("workflowSchedules.copyFailed", "Could not copy."));
      return;
    }
    try {
      await navigator.clipboard.writeText(s);
      notify.success(tr("workflowSchedules.copied", "Copied."));
    } catch {
      notify.error(tr("workflowSchedules.copyFailed", "Could not copy."));
    }
  };

  const openPayloadModal = (mode: "create" | "edit", row?: ScheduledPayloadRow) => {
    const st = detail?.schedule?.status;
    if (st === "active" || st === "paused") {
      notify.info(
        tr(
          "workflowSchedules.payloadReadOnlyBlocked",
          "Payload keys can only be edited when the schedule is disabled. Pause or disable the schedule first.",
        ),
      );
      return;
    }
    if (mode === "edit" && row) {
      setPayloadForm({
        keyName: row.keyName,
        payloadType: row.payloadType,
        sp_value: row.sp_value || row.value || "",
      });
    } else {
      setPayloadForm({ keyName: "", payloadType: "fixed", sp_value: "" });
    }
    setPayloadModal({ mode, row });
  };

  const savePayload = async () => {
    if (selectedId == null || !payloadModal) return;
    const st = detail?.schedule?.status;
    if (st === "active" || st === "paused") {
      notify.error(
        tr(
          "workflowSchedules.payloadReadOnlyBlocked",
          "Payload keys can only be edited when the schedule is disabled. Pause or disable the schedule first.",
        ),
      );
      setPayloadModal(null);
      return;
    }
    const keyName = payloadForm.keyName.trim();
    const sp_value = payloadForm.sp_value.trim();
    if (!keyName || !sp_value) {
      notify.error(tr("workflowSchedules.payloadValidation", "Enter key name and value."));
      return;
    }
    const check = validatePayloadValueByType(payloadForm.payloadType, sp_value);
    if (!check.ok) {
      notify.error(tr(check.key, check.fallback));
      return;
    }
    if (payloadForm.payloadType === "fixed" && getFixedJsonParseIssue(sp_value)) {
      notify.warning(
        tr(
          "workflowSchedules.payloadFixedJsonWarn",
          "Value looks like JSON but is invalid — it may be treated as plain text until fixed. Continuing save.",
        ),
      );
    }
    const modalSnap = payloadModal;
    const prevPayloadType = modalSnap.mode === "edit" ? modalSnap.row?.payloadType : undefined;
    setPayloadSaving(true);
    try {
      if (modalSnap.mode === "create") {
        await createScheduledPayload(selectedId, {
          keyName,
          payloadType: payloadForm.payloadType,
          sp_value,
        });
      } else if (modalSnap.row) {
        await updateScheduledPayload(selectedId, modalSnap.row.id, {
          keyName,
          payloadType: payloadForm.payloadType,
          sp_value,
        });
      }
      notify.success(tr("workflowSchedules.payloadSaved", "Payload saved."));
      if (
        modalSnap.mode === "edit" &&
        prevPayloadType != null &&
        prevPayloadType !== payloadForm.payloadType &&
        (prevPayloadType === "step" || payloadForm.payloadType === "step")
      ) {
        notify.info(
          tr(
            "workflowSchedules.payloadTypeChangeStepInfo",
            "Payload type changed involving step — the server may reset step cursor.",
          ),
        );
      }
      setPayloadModal(null);
      await loadDetail(selectedId);
      await loadList();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.updateError", "Could not update schedule."));
    } finally {
      setPayloadSaving(false);
    }
  };

  const removePayload = async (row: ScheduledPayloadRow) => {
    if (selectedId == null) return;
    const st = detail?.schedule?.status;
    if (st === "active" || st === "paused") {
      notify.info(
        tr(
          "workflowSchedules.payloadReadOnlyBlocked",
          "Payload keys can only be edited when the schedule is disabled. Pause or disable the schedule first.",
        ),
      );
      return;
    }
    if (!window.confirm(tr("workflowSchedules.confirmPayloadDelete", "Remove this payload key?"))) return;
    try {
      await deleteScheduledPayload(selectedId, row.id);
      notify.success(tr("workflowSchedules.payloadDeleted", "Payload removed."));
      await loadDetail(selectedId);
      await loadList();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      notify.error(msg || tr("workflowSchedules.deleteError", "Could not delete schedule."));
    }
  };

  const payloads = detail?.payloads ?? [];
  const payloadWarn = Boolean(detail?.schedule.workflowSetPayload && payloads.length === 0);

  const payloadModalStepTypeChange = useMemo(() => {
    if (!payloadModal || payloadModal.mode !== "edit" || !payloadModal.row) return false;
    return (
      payloadForm.payloadType !== payloadModal.row.payloadType &&
      (payloadForm.payloadType === "step" || payloadModal.row.payloadType === "step")
    );
  }, [payloadModal, payloadForm.payloadType]);

  const payloadFixedJsonInvalid = useMemo(
    () =>
      Boolean(
        payloadModal && payloadForm.payloadType === "fixed" && getFixedJsonParseIssue(payloadForm.sp_value),
      ),
    [payloadModal, payloadForm.payloadType, payloadForm.sp_value],
  );

  const payloadsReadOnly = useMemo(() => {
    const s = detail?.schedule?.status;
    return s === "active" || s === "paused";
  }, [detail?.schedule?.status]);

  if (!canAccess) {
    return (
      <div className="w-full min-w-0 space-y-3 p-2 sm:space-y-4 sm:p-4">
        <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold text-[rgb(173,8,8)]">
            {tr("workflowSchedules.title", "Workflow schedules")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {tr(
              "workflowSchedules.forbidden",
              "This area is only available for owner and colleague accounts.",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 p-2 sm:gap-4 sm:p-4">
      <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[rgb(173,8,8)] sm:text-2xl">
              <CalendarClock className="h-7 w-7 shrink-0 opacity-90" aria-hidden />
              {tr("workflowSchedules.title", "Workflow schedules")}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {tr(
                "workflowSchedules.subtitle",
                "Run workflows on a cron with optional dynamic input keys (fixed, step, loop, random).",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadList()}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-red-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {tr("workflowSchedules.reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateCronUi(defaultCronBuilderState());
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(173,8,8)] px-3 py-2 text-sm font-medium text-white hover:bg-[rgb(150,7,7)]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {tr("workflowSchedules.add", "New schedule")}
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)] lg:items-start">
        <section className="rounded-xl border border-red-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-red-100 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-[rgb(173,8,8)]">
              {tr("workflowSchedules.list", "Schedules")}
            </h2>
          </div>
          <div className="max-h-[min(52vh,480px)] overflow-auto lg:max-h-[calc(100dvh-14rem)]">
            {loadingList ? (
              <p className="p-4 text-sm text-zinc-500">{tr("workflowSchedules.loading", "Loading schedules…")}</p>
            ) : schedules.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">{tr("workflowSchedules.empty", "No schedules yet.")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 p-2">
                {schedules.map((s) => {
                  const isActive = selectedId === s.id;
                  return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(s.id);
                        setTab("overview");
                        setRunsPage(1);
                      }}
                      className={`flex w-full flex-col gap-1 rounded-lg border-2 px-3 py-3 text-left text-sm transition ${
                        isActive
                          ? "border-red-500 bg-red-50/90 dark:border-zinc-500 dark:bg-zinc-800/60"
                          : "border-transparent bg-transparent hover:bg-red-50/80 dark:hover:bg-zinc-800/80"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</span>
                        {statusBadge(s.status)}
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{s.cronExpression}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="text-zinc-400">{tr("workflowSchedules.colWorkflow", "Workflow")}: </span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {workflowNameById[s.workflowId] ?? s.workflowId}
                        </span>
                        {workflowNameById[s.workflowId] ? (
                          <span className="mt-0.5 block break-all font-mono text-[10px] text-zinc-500">{s.workflowId}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-red-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {!selectedSchedule ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-zinc-500">
              <CalendarClock className="h-10 w-10 opacity-40" aria-hidden />
              <p>{tr("workflowSchedules.selectHint", "Select a schedule in the list or create a new one.")}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 px-3 py-2 dark:border-zinc-800">
                <h2 className="min-w-0 truncate text-sm font-semibold text-[rgb(173,8,8)]">
                  {tr("workflowSchedules.detailTitle", "Schedule detail")}: {selectedSchedule.name}
                </h2>
                <Link
                  href={
                    selectedSchedule.workflowId
                      ? `/workflows?wf=${encodeURIComponent(String(selectedSchedule.workflowId))}`
                      : "/workflows"
                  }
                  className="shrink-0 text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-400"
                >
                  {tr("workflowSchedules.workflowEditor", "Workflows")}
                </Link>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-red-100 px-2 py-2 dark:border-zinc-800">
                {(["overview", "payloads", "runs"] as TabKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      tab === k
                        ? "bg-[rgb(173,8,8)] text-white"
                        : "text-zinc-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {k === "overview"
                      ? tr("workflowSchedules.tabOverview", "Overview")
                      : k === "payloads"
                        ? tr("workflowSchedules.tabPayloads", "Input keys")
                        : tr("workflowSchedules.tabRuns", "Run history")}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 p-3">
                {loadingDetail && tab !== "runs" ? (
                  <p className="text-sm text-zinc-500">{tr("workflowSchedules.loading", "Loading schedules…")}</p>
                ) : null}

                {tab === "overview" && detail && !loadingDetail ? (
                  <div className="space-y-4">
                    {payloadWarn ? (
                      <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p>{tr("workflowSchedules.payloadWarnEmpty", "Payload mode is on but there are no keys yet.")}</p>
                      </div>
                    ) : null}

                    {typeof detail.schedule.consecutiveFailures === "number" && detail.schedule.consecutiveFailures > 0 ? (
                      <div
                        className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${
                          detail.schedule.consecutiveFailures >= SCHEDULER_AUTO_DISABLE_AFTER_FAILS - 1
                            ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/35 dark:text-red-100"
                            : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p>
                          {tr(
                            "workflowSchedules.consecutiveFailuresBanner",
                            "Consecutive failed runs: {n}. After {max} in a row, the server may auto-disable this schedule.",
                          )
                            .replace("{n}", String(detail.schedule.consecutiveFailures))
                            .replace("{max}", String(SCHEDULER_AUTO_DISABLE_AFTER_FAILS))}
                        </p>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {detail.schedule.status === "active" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === selectedId}
                            onClick={() =>
                              void runTransition(
                                pauseWorkflowSchedule,
                                tr("workflowSchedules.pausedOk", "Schedule paused."),
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                          >
                            <Pause className="h-3.5 w-3.5" aria-hidden />
                            {tr("workflowSchedules.pause", "Pause")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === selectedId}
                            onClick={() =>
                              void runTransition(
                                disableWorkflowSchedule,
                                tr("workflowSchedules.disabledOk", "Schedule disabled."),
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-400 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                          >
                            <Square className="h-3.5 w-3.5" aria-hidden />
                            {tr("workflowSchedules.disable", "Disable")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === selectedId}
                          onClick={() => {
                            if (detail.schedule.status === "disabled") {
                              const ok = window.confirm(
                                tr(
                                  "workflowSchedules.confirmActivateNewSession",
                                  "Activating from disabled starts a new schedule session (loop turn resets to 1 in the new session). Continue?",
                                ),
                              );
                              if (!ok) return;
                            }
                            void runTransition(
                              activateWorkflowSchedule,
                              tr("workflowSchedules.activatedOk", "Schedule activated."),
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden />
                          {tr("workflowSchedules.activate", "Activate")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === selectedId}
                        onClick={() => void onDeleteSchedule()}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {tr("workflowSchedules.delete", "Delete schedule")}
                      </button>
                    </div>

                    {detail.schedule.scheduleSessionId ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {tr("workflowSchedules.sessionId", "Session")}
                        </span>
                        <code className="max-w-full break-all rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">
                          {String(detail.schedule.scheduleSessionId)}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copySession()}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                        >
                          <Copy className="h-3 w-3" aria-hidden />
                          {tr("workflowSchedules.copySession", "Copy")}
                        </button>
                      </div>
                    ) : null}

                    {detail.schedule.code ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950/50">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">
                          {tr("workflowSchedules.scheduleCodeReadOnly", "Schedule code")}
                        </span>
                        <code className="mt-1 block break-all font-mono text-zinc-900 dark:text-zinc-100">
                          {detail.schedule.code}
                        </code>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
                        {tr("workflowSchedules.name", "Name")}
                        <input
                          value={overviewDraft.name}
                          onChange={(e) => setOverviewDraft((p) => ({ ...p, name: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <ScheduleCronBuilder
                          idPrefix="overview-cron"
                          value={overviewCronUi}
                          onChange={setOverviewCronUi}
                          tr={tr}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <WorkflowPicker
                          id="overview-wf"
                          value={overviewDraft.workflowId}
                          onChange={(workflowId) => setOverviewDraft((p) => ({ ...p, workflowId }))}
                          options={workflowOptions}
                          loading={workflowsLoading}
                          tr={tr}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={overviewDraft.workflowSetPayload}
                          onChange={(e) =>
                            setOverviewDraft((p) => ({ ...p, workflowSetPayload: e.target.checked }))
                          }
                          className="rounded border-red-300"
                        />
                        {tr("workflowSchedules.workflowSetPayload", "Build input from payload keys")}
                      </label>
                      <p className="sm:col-span-2 text-[11px] text-zinc-500">
                        {tr(
                          "workflowSchedules.workflowSetPayloadHint",
                          "When off, the engine passes no custom input. When on, keys below map into workflow input.",
                        )}
                      </p>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {tr("workflowSchedules.maxRetries", "Max retries")}
                        <input
                          value={overviewDraft.maxRetries}
                          onChange={(e) => setOverviewDraft((p) => ({ ...p, maxRetries: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {tr("workflowSchedules.timeoutMs", "Timeout (ms)")}
                        <input
                          value={overviewDraft.timeoutMs}
                          onChange={(e) => setOverviewDraft((p) => ({ ...p, timeoutMs: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                          inputMode="numeric"
                        />
                      </label>
                    </div>

                    <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950/40">
                      <div className="grid gap-1 sm:grid-cols-2">
                        <p>
                          <span className="text-zinc-500">{tr("workflowSchedules.colLastRun", "Last run")}: </span>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {formatWhen(detail.schedule.lastRunAt as string | undefined)}
                          </span>
                        </p>
                        <p>
                          <span className="text-zinc-500">{tr("workflowSchedules.colLastOk", "Last success")}: </span>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {formatWhen(detail.schedule.lastSuccessAt as string | undefined)}
                          </span>
                        </p>
                        <p>
                          <span className="text-zinc-500">{tr("workflowSchedules.colFails", "Fails (seq)")}: </span>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {detail.schedule.consecutiveFailures ?? 0}
                          </span>
                        </p>
                      </div>
                      {detail.schedule.lastError ? (
                        <p className="mt-2 border-t border-red-200/80 pt-2 text-red-800 dark:border-zinc-700 dark:text-red-300">
                          <span className="font-medium">{tr("workflowSchedules.lastError", "Last error")}: </span>
                          {String(detail.schedule.lastError)}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={savingSchedule}
                      onClick={() => void onSaveOverview()}
                      className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(150,7,7)] disabled:opacity-50"
                    >
                      {savingSchedule ? tr("workflowSchedules.saving", "Saving…") : tr("workflowSchedules.save", "Save changes")}
                    </button>
                  </div>
                ) : null}

                {tab === "payloads" && detail && !loadingDetail ? (
                  <div className="space-y-3">
                    {payloadsReadOnly ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
                        {tr(
                          "workflowSchedules.payloadReadOnlyHint",
                          "This schedule is active or paused — input keys are read-only. Disable the schedule to add or edit keys.",
                        )}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {tr(
                          "workflowSchedules.payloadValueHint",
                          "fixed: text/JSON; step: integer delta; loop/random: list.",
                        )}
                      </p>
                      {!payloadsReadOnly ? (
                        <button
                          type="button"
                          onClick={() => openPayloadModal("create")}
                          className="inline-flex items-center gap-1 rounded-lg bg-[rgb(173,8,8)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[rgb(150,7,7)]"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          {tr("workflowSchedules.payloadAdd", "Add input key")}
                        </button>
                      ) : null}
                    </div>
                    {payloads.length === 0 ? (
                      <p className="text-sm text-zinc-500">{tr("workflowSchedules.payloadEmpty", "No input keys configured yet.")}</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-red-200 dark:border-zinc-700">
                        <table
                          className={`w-full text-left text-sm ${payloadsReadOnly ? "min-w-[520px]" : "min-w-[640px]"}`}
                        >
                          <thead className="bg-red-50 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            <tr>
                              <th className="px-2 py-2">{tr("workflowSchedules.payloadKey", "Input key")}</th>
                              <th className="px-2 py-2">{tr("workflowSchedules.payloadType", "Type")}</th>
                              <th className="px-2 py-2">{tr("workflowSchedules.payloadValue", "Value")}</th>
                              <th className="px-2 py-2">{tr("workflowSchedules.payloadStepCursor", "Step cursor")}</th>
                              {!payloadsReadOnly ? (
                                <th className="px-2 py-2 text-right">{tr("workflowSchedules.colActions", "Actions")}</th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100 dark:divide-zinc-800">
                            {payloads.map((row) => (
                              <tr key={row.id}>
                                <td className="px-2 py-2 font-mono text-xs">{row.keyName}</td>
                                <td className="px-2 py-2">
                                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                                    {row.payloadType}
                                  </span>
                                </td>
                                <td className="max-w-[240px] truncate px-2 py-2 font-mono text-xs" title={row.sp_value || row.value}>
                                  {row.sp_value || row.value}
                                </td>
                                <td className="px-2 py-2 text-xs">
                                  {row.payloadType === "step" && row.stepCursor != null ? String(row.stepCursor) : "—"}
                                </td>
                                {!payloadsReadOnly ? (
                                  <td className="whitespace-nowrap px-2 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => openPayloadModal("edit", row)}
                                      className="mr-2 rounded border border-red-200 px-2 py-1 text-xs hover:bg-red-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                    >
                                      {tr("workflowSchedules.payloadEdit", "Edit")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void removePayload(row)}
                                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                                    >
                                      <Trash2 className="inline h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}

                {tab === "runs" && selectedId != null ? (
                  <div className="space-y-3">
                    {runsLoading ? (
                      <p className="text-sm text-zinc-500">{tr("workflowSchedules.loading", "Loading schedules…")}</p>
                    ) : runsItems.length === 0 ? (
                      <p className="text-sm text-zinc-500">{tr("workflowSchedules.runsEmpty", "No runs logged yet.")}</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-red-200 dark:border-zinc-700">
                          <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="bg-red-50 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              <tr>
                                <th className="px-2 py-2">ID</th>
                                <th
                                  className="px-2 py-2"
                                  title={tr(
                                    "workflowSchedules.runTurnTooltip",
                                    "turnInSession (1-based in the current schedule session; used for loop order).",
                                  )}
                                >
                                  {tr("workflowSchedules.runTurn", "Turn")}
                                </th>
                                <th className="px-2 py-2">{tr("workflowSchedules.runSession", "Session")}</th>
                                <th className="px-2 py-2">{tr("workflowSchedules.runOutput", "Output")}</th>
                                <th className="px-2 py-2">{tr("workflowSchedules.runError", "Error")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-100 dark:divide-zinc-800">
                              {runsItems.map((r) => {
                                const outFull = previewJson(r.output);
                                const outShort = outFull.length > 120 ? `${outFull.slice(0, 120)}…` : outFull;
                                return (
                                <tr key={r.id}>
                                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{r.id}</td>
                                  <td className="px-2 py-2 text-xs">{r.turnInSession ?? "—"}</td>
                                  <td className="max-w-[180px] px-2 py-2 font-mono text-[11px]">
                                    <div className="flex items-center gap-1">
                                      <span className="min-w-0 flex-1 truncate" title={r.sessionId ? String(r.sessionId) : undefined}>
                                        {r.sessionId ? `${String(r.sessionId).slice(0, 8)}…` : "—"}
                                      </span>
                                      {r.sessionId ? (
                                        <button
                                          type="button"
                                          title={tr("workflowSchedules.runCopySession", "Copy session id")}
                                          aria-label={tr("workflowSchedules.runCopySession", "Copy session id")}
                                          onClick={() => void copyRunCell(String(r.sessionId))}
                                          className="shrink-0 rounded border-0 bg-transparent p-0.5 text-zinc-500 ring-0 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500/60"
                                        >
                                          <Copy className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="max-w-[min(42vw,300px)] px-2 py-2 font-mono text-[11px]">
                                    <div className="flex items-start gap-1">
                                      <span className="min-w-0 flex-1 truncate" title={outFull}>
                                        {outShort}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={!outFull.trim()}
                                        title={tr("workflowSchedules.runCopyOutput", "Copy output")}
                                        aria-label={tr("workflowSchedules.runCopyOutput", "Copy output")}
                                        onClick={() => void copyRunCell(outFull)}
                                        className="shrink-0 rounded border-0 bg-transparent p-0.5 text-zinc-500 ring-0 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500/60"
                                      >
                                        <Copy className="h-3.5 w-3.5" aria-hidden />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="max-w-[min(38vw,240px)] px-2 py-2 text-xs text-red-700 dark:text-red-400">
                                    <div className="flex items-start gap-1">
                                      <span className="min-w-0 flex-1 truncate" title={r.error || ""}>
                                        {r.error || "—"}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={!(r.error && String(r.error).trim())}
                                        title={tr("workflowSchedules.runCopyError", "Copy error")}
                                        aria-label={tr("workflowSchedules.runCopyError", "Copy error")}
                                        onClick={() => void copyRunCell(r.error)}
                                        className="shrink-0 rounded border-0 bg-transparent p-0.5 text-zinc-500 ring-0 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500/60"
                                      >
                                        <Copy className="h-3.5 w-3.5" aria-hidden />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
                          <span>
                            Page {runsPage} / {runsTotalPages}
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={runsLoading || runsPage <= 1}
                              onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-800"
                            >
                              <ChevronLeft className="h-4 w-4" aria-hidden />
                              {tr("workflowSchedules.pagePrev", "Previous")}
                            </button>
                            <button
                              type="button"
                              disabled={runsLoading || runsPage >= runsTotalPages}
                              onClick={() => setRunsPage((p) => p + 1)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-800"
                            >
                              {tr("workflowSchedules.pageNext", "Next")}
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-red-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">{tr("workflowSchedules.createTitle", "Create schedule")}</h3>
            <div className="mt-4 grid gap-3">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {tr(
                  "workflowSchedules.codeGeneratedHint",
                  "Schedule code is generated by the server after creation.",
                )}
              </p>
              <label className="block text-xs font-medium">
                {tr("workflowSchedules.name", "Name")}
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              <ScheduleCronBuilder
                idPrefix="create-cron"
                value={createCronUi}
                onChange={setCreateCronUi}
                tr={tr}
              />
              <WorkflowPicker
                id="create-wf"
                value={createForm.workflowId}
                onChange={(workflowId) => setCreateForm((p) => ({ ...p, workflowId }))}
                options={workflowOptions}
                loading={workflowsLoading}
                tr={tr}
              />
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={createForm.workflowSetPayload}
                  onChange={(e) => setCreateForm((p) => ({ ...p, workflowSetPayload: e.target.checked }))}
                />
                {tr("workflowSchedules.workflowSetPayload", "Build input from payload keys")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium">
                  {tr("workflowSchedules.maxRetries", "Max retries")}
                  <input
                    value={createForm.maxRetries}
                    onChange={(e) => setCreateForm((p) => ({ ...p, maxRetries: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
                <label className="block text-xs font-medium">
                  {tr("workflowSchedules.timeoutMs", "Timeout (ms)")}
                  <input
                    value={createForm.timeoutMs}
                    onChange={(e) => setCreateForm((p) => ({ ...p, timeoutMs: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm dark:border-zinc-600"
              >
                {tr("websites.back", "Back")}
              </button>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => void onCreate()}
                className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {tr("workflowSchedules.createSubmit", "Create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {payloadModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-[rgb(173,8,8)]">
              {payloadModal.mode === "create"
                ? tr("workflowSchedules.payloadAdd", "Add input key")
                : tr("workflowSchedules.payloadEdit", "Edit key")}
            </h3>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium">
                {tr("workflowSchedules.payloadKey", "Input key")}
                <input
                  value={payloadForm.keyName}
                  onChange={(e) => setPayloadForm((p) => ({ ...p, keyName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  placeholder="topic"
                />
              </label>
              <label className="block text-xs font-medium">
                {tr("workflowSchedules.payloadType", "Type")}
                <select
                  value={payloadForm.payloadType}
                  onChange={(e) =>
                    setPayloadForm((p) => ({ ...p, payloadType: e.target.value as ScheduledPayloadTypeApi }))
                  }
                  className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                >
                  {PAYLOAD_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
                {payloadModalStepTypeChange ? (
                  <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
                    {tr(
                      "workflowSchedules.payloadTypeChangeStepWarning",
                      "Changing type to/from step may reset the step cursor on save.",
                    )}
                  </p>
                ) : null}
              </label>
              <label className="block text-xs font-medium">
                {tr("workflowSchedules.payloadValue", "Value (sp_value)")}
                <textarea
                  value={payloadForm.sp_value}
                  onChange={(e) => setPayloadForm((p) => ({ ...p, sp_value: e.target.value }))}
                  rows={4}
                  className={`mt-1 w-full rounded-lg border px-2 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950 ${
                    payloadFixedJsonInvalid
                      ? "border-amber-500 ring-1 ring-amber-400/50"
                      : "border-red-300"
                  }`}
                />
                <span className="mt-1 block text-[11px] text-zinc-500">
                  {payloadForm.payloadType === "step"
                    ? tr(
                        "workflowSchedules.payloadStepHint",
                        "Step: non-zero integer string as in the API (e.g. 1, -2, +5) — no decimals or scientific notation.",
                      )
                    : payloadForm.payloadType === "loop" || payloadForm.payloadType === "random"
                      ? tr(
                          "workflowSchedules.payloadListHint",
                          "Loop/Random: separate items by comma or semicolon (e.g. A, B, C).",
                        )
                      : tr(
                          "workflowSchedules.payloadFixedHint",
                          "Fixed: plain text, number, boolean, null, or JSON string/object/array.",
                        )}
                </span>
                {payloadFixedJsonInvalid ? (
                  <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
                    {tr(
                      "workflowSchedules.payloadFixedJsonInline",
                      "This looks like JSON but is invalid — fix syntax or the resolver may treat it as plain text.",
                    )}
                  </p>
                ) : null}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayloadModal(null)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm dark:border-zinc-600"
              >
                {tr("websites.back", "Back")}
              </button>
              <button
                type="button"
                disabled={payloadSaving}
                onClick={() => void savePayload()}
                className="rounded-lg bg-[rgb(173,8,8)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {tr("workflowSchedules.save", "Save changes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
