"use client";

import React from "react";
import type { CronBuilderState } from "@/utils/workflowCronUi";
import {
  buildCronExpression,
  formatEveryMinutesDuration,
  getCronBuilderIssues,
} from "@/utils/workflowCronUi";

type Tr = (key: string, fallback: string) => string;

type Props = {
  value: CronBuilderState;
  onChange: (next: CronBuilderState) => void;
  tr: Tr;
  /** Theme-aware optional wrapper id for labels */
  idPrefix?: string;
};

export function ScheduleCronBuilder({ value, onChange, tr, idPrefix = "cron" }: Props) {
  const issues = getCronBuilderIssues(value);
  const built = buildCronExpression(value);
  const preview = built || "—";
  const showIssue = issues[0];

  const setMode = (mode: CronBuilderState["mode"]) => {
    if (mode === "custom" && value.mode !== "custom") {
      const fromStructured = buildCronExpression(value);
      onChange({
        ...value,
        mode: "custom",
        customCron: fromStructured || value.customCron || "0 9 * * *",
      });
    } else {
      onChange({ ...value, mode });
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {tr("workflowSchedules.cronScheduleType", "Schedule type")}
        <select
          id={`${idPrefix}-mode`}
          value={value.mode}
          onChange={(e) => setMode(e.target.value as CronBuilderState["mode"])}
          className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
        >
          <option value="everyMinutes">{tr("workflowSchedules.cronModeEveryMinutes", "Every N minutes (integer)")}</option>
          <option value="dailyTimes">{tr("workflowSchedules.cronModeDailyTimes", "Daily at times (HH:mm, …)")}</option>
          <option value="hourly">{tr("workflowSchedules.cronModeHourly", "Every hour at minute…")}</option>
          <option value="custom">{tr("workflowSchedules.cronModeCustom", "Advanced (cron text)")}</option>
        </select>
      </label>

      {value.mode === "everyMinutes" ? (
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tr("workflowSchedules.cronEveryTotalMinutes", "Total minutes between runs (integer ≥ 1)")}
          <input
            id={`${idPrefix}-interval`}
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(value.everyMinutes) ? value.everyMinutes : 15}
            onChange={(e) =>
              onChange({ ...value, everyMinutes: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
            }
            className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            {tr("workflowSchedules.cronApproxDurationPrefix", "≈")}{" "}
            {formatEveryMinutesDuration(value.everyMinutes) || "—"}{" "}
            {tr("workflowSchedules.cronApproxDurationSuffix", "per cycle")}
          </span>
          <span className="mt-1 block text-[11px] text-zinc-500">
            {tr(
              "workflowSchedules.cronEveryTotalMinutesHint",
              "Mappable to one 5-field cron: 1–59 min (*/N * * * *), or every 1–23 hours at :00 (0 */H * * *), or 24h as 0 0 * * *. Other values (e.g. 95) need Advanced cron or a server feature beyond single-line cron.",
            )}
          </span>
        </label>
      ) : null}

      {value.mode === "dailyTimes" ? (
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tr("workflowSchedules.cronDailyTimes", "Times each day (comma or semicolon)")}
          <input
            id={`${idPrefix}-times`}
            value={value.dailyTimesText}
            onChange={(e) => onChange({ ...value, dailyTimesText: e.target.value })}
            placeholder="7:00, 12:15, 20:55"
            className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            {tr(
              "workflowSchedules.cronDailyTimesHint",
              "One line of classic cron can only fire at the same clock minute for every hour (e.g. 7:15, 12:15, 20:15). Different minutes in one line need Advanced cron or multiple schedules.",
            )}
          </span>
        </label>
      ) : null}

      {value.mode === "hourly" ? (
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tr("workflowSchedules.cronHourlyAtMinute", "At minute (0–59) each hour")}
          <input
            id={`${idPrefix}-hourly`}
            type="number"
            min={0}
            max={59}
            value={value.hourlyMinute}
            onChange={(e) =>
              onChange({ ...value, hourlyMinute: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            {tr("workflowSchedules.cronHourlyHint", "Cron: M * * * *")}
          </span>
        </label>
      ) : null}

      {value.mode === "custom" ? (
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Cron
          <textarea
            id={`${idPrefix}-custom`}
            value={value.customCron}
            onChange={(e) => onChange({ ...value, customCron: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-red-300 px-2 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
            spellCheck={false}
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            {tr("workflowSchedules.cronHint", "Standard cron expression (server timezone).")}
          </span>
        </label>
      ) : null}

      {showIssue ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {showIssue.kind === "everyMinutesNotExpressible"
            ? tr(
                "workflowSchedules.cronIssueEveryMinutes",
                "This interval cannot be expressed as a single standard 5-field cron. Switch to Advanced or use 1–59 minutes, or a whole number of hours (60, 120, …).",
              )
            : showIssue.kind === "dailyTimesMixedMinutes"
              ? tr(
                  "workflowSchedules.cronIssueDailyMixed",
                  "These wall-clock times use different minutes; one cron line cannot represent them all. Use the same minute for every hour, or Advanced cron, or create separate schedules.",
                )
              : tr("workflowSchedules.cronIssueDailyEmpty", "Enter at least one valid time such as 7:00 or 12:30.")}
        </p>
      ) : null}

      <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/50">
        <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          {tr("workflowSchedules.cronPreview", "Generated cron")}
        </p>
        <code className="mt-1 block break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">{preview}</code>
      </div>
    </div>
  );
}
