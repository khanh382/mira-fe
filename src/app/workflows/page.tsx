"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useLang } from "@/lang";
import { getPublicApiOrigin } from "@/utils/publicApiOrigin";
import {
  createWorkflow as createWorkflowApi,
  deleteWorkflow as deleteWorkflowApi,
  deleteNodeRuns,
  deleteWorkflowRuns,
  getWorkflowGraph,
  getWorkflowRunDetail,
  getWorkflowToolOptions,
  importWorkflowFromBackup,
  downloadWorkflowBackup,
  listNodeRuns,
  listWorkflowRuns,
  listWorkflows as listWorkflowsApi,
  runWorkflowNode,
  runWorkflow as runWorkflowApi,
  saveWorkflowGraph,
  updateEntryNode,
  updateWorkflowMeta as updateWorkflowMetaApi,
  updateWorkflowStatus,
} from "@/services/WorkflowEngineService";

type WorkflowStatus = "draft" | "active" | "paused" | "archived";
type RunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

type NodeModel = {
  id: string;
  clientKey?: string;
  name: string;
  toolCode: string | null;
  promptTemplate: string | null;
  commandCode: string | null;
  modelOverride: string | null;
  maxAttempts: number;
  timeoutMs: number;
  outputSchema: string | null;
  posX: number;
  posY: number;
};

type EdgeModel = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  conditionExpr: string | null;
  priority: number;
  isDefault: boolean;
};

type WorkflowModel = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  entryNodeId: string | null;
  version: number;
  inputPayload: Record<string, unknown> | null;
  nodes: NodeModel[];
  edges: EdgeModel[];
};

type RunNodeLog = {
  id: string;
  nodeName: string;
  status: "running" | "succeeded" | "failed";
  resolvedPrompt: string;
  resolvedCommand: string;
  resolvedOutput: string;
  durationMs: number;
  error: string | null;
};

type RunModel = {
  id: string;
  status: RunStatus;
  finalOutput: string;
  logs: RunNodeLog[];
};

type WorkflowRunHistoryItem = {
  id: string;
  status: string;
  createdAt?: string | null;
  finishedAt?: string | null;
};

type NodeRunHistoryItem = {
  id: string;
  workflowRunId?: string | null;
  status: string;
  attemptNo?: number | null;
  resolvedPrompt?: string | null;
  resolvedCommand?: string | null;
  output?: unknown;
  error?: string | null;
  durationMs?: number | null;
  createdAt?: string | null;
};

type NodeConfigDraft = {
  name: string;
  toolCode: string;
  promptTemplate: string;
  commandCode: string;
};

type WorkflowMetaSnapshot = {
  name: string;
  code: string;
  description: string | null;
};

type FlowMeta = {
  flowOrderLabel: string;
  incomingFromLabels: string[];
  primaryPath: boolean;
};

type PendingConnect = {
  sourceId: string;
  reconnectEdgeId: string | null;
  reconnectEnd: "from" | "to" | null;
};

type ToolOption = {
  skillCode: string;
  skillName: string;
  category: string;
  sampleCode?: string | null;
};

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const formatSampleCodePlaceholder = (sampleCode: string): string => {
  const trimmed = sampleCode.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { examples?: unknown[] }).examples) &&
      (parsed as { examples?: unknown[] }).examples!.length > 0
    ) {
      const examples = (parsed as { examples: unknown[] }).examples;
      return JSON.stringify({ examples }, null, 2);
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Keep original string if sampleCode is not JSON.
  }
  return sampleCode;
};
const formatOutputForDisplay = (rawOutput: unknown): string => {
  if (rawOutput == null) return "";
  if (typeof rawOutput === "string") return rawOutput;
  if (typeof rawOutput !== "object") return String(rawOutput);

  const output = rawOutput as Record<string, unknown>;
  const contentFromData =
    typeof (output.data as { content?: unknown } | undefined)?.content === "string"
      ? String((output.data as { content?: unknown }).content)
      : undefined;
  const normalized = {
    success: output.success,
    model: output.model,
    content: typeof output.content === "string" ? output.content : contentFromData,
    tokensUsed: output.tokensUsed,
  };
  const compact = Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== null),
  );
  if (Object.keys(compact).length > 0) return JSON.stringify(compact, null, 2);
  return JSON.stringify(output, null, 2);
};

const MOCK_WORKFLOWS: WorkflowModel[] = [
  {
    id: "wf_news",
    code: "daily_news_pipeline",
    name: "Daily News Pipeline",
    description: "Fetch -> Rewrite -> Publish -> Notify",
    status: "draft",
    entryNodeId: "n_fetch",
    version: 1,
    inputPayload: {
      newsUrl: "https://example.com/news",
      title: "Daily update",
      websiteApiUrl: "https://api.example.com/posts",
    },
    nodes: [
      {
        id: "n_fetch",
        name: "fetch_news",
        toolCode: "web_fetch",
        commandCode: "{\"url\":\"{input.newsUrl}\"}",
        promptTemplate: "Read article from {input.newsUrl}",
        modelOverride: null,
        maxAttempts: 3,
        timeoutMs: 120000,
        outputSchema: null,
        posX: 60,
        posY: 120,
      },
      {
        id: "n_rewrite",
        name: "rewrite_content",
        toolCode: null,
        commandCode: null,
        promptTemplate: "Rewrite content from {nodes.fetch_news.content}",
        modelOverride: null,
        maxAttempts: 3,
        timeoutMs: 120000,
        outputSchema: null,
        posX: 360,
        posY: 120,
      },
      {
        id: "n_publish",
        name: "publish_post",
        toolCode: "http_request",
        commandCode:
          "{\"method\":\"POST\",\"url\":\"{input.websiteApiUrl}\",\"body\":{\"title\":\"{input.title}\",\"content\":\"{nodes.rewrite_content.content}\"}}",
        promptTemplate: "Publish post to website",
        modelOverride: null,
        maxAttempts: 5,
        timeoutMs: 120000,
        outputSchema: null,
        posX: 660,
        posY: 80,
      },
      {
        id: "n_notify",
        name: "notify_result",
        toolCode: "message_send",
        commandCode: null,
        promptTemplate: "Send summary to Telegram",
        modelOverride: null,
        maxAttempts: 2,
        timeoutMs: 60000,
        outputSchema: null,
        posX: 660,
        posY: 240,
      },
    ],
    edges: [
      {
        id: "e1",
        fromNodeId: "n_fetch",
        toNodeId: "n_rewrite",
        conditionExpr: null,
        priority: 1,
        isDefault: true,
      },
      {
        id: "e2",
        fromNodeId: "n_rewrite",
        toNodeId: "n_publish",
        conditionExpr: "$.nodes.rewrite_content.success == true",
        priority: 10,
        isDefault: false,
      },
      {
        id: "e3",
        fromNodeId: "n_rewrite",
        toNodeId: "n_notify",
        conditionExpr: null,
        priority: 99,
        isDefault: true,
      },
    ],
  },
];

function hasCycle(nodes: NodeModel[], edges: EdgeModel[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const graph = new Map<string, string[]>();
  ids.forEach((id) => graph.set(id, []));
  edges.forEach((e) => {
    if (graph.has(e.fromNodeId) && graph.has(e.toNodeId)) {
      graph.get(e.fromNodeId)!.push(e.toNodeId);
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of ids) {
    if (dfs(id)) return true;
  }
  return false;
}

const getSmartEdgePoints = (
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number }
) => {
  const cx1 = from.x + from.w / 2;
  const cy1 = from.y + from.h / 2;
  const cx2 = to.x + to.w / 2;
  const cy2 = to.y + to.h / 2;
  const dx = cx2 - cx1;
  const dy = cy2 - cy1;
  let x1, y1, c1x, c1y, x2, y2, c2x, c2y;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    if (dx > 0) {
      x1 = from.x + from.w; y1 = cy1;
      x2 = to.x; y2 = cy2;
    } else {
      x1 = from.x; y1 = cy1;
      x2 = to.x + to.w; y2 = cy2;
    }
    c1x = x1 + (dx > 0 ? 1 : -1) * Math.max(60, Math.abs(dx) / 2);
    c1y = y1;
    c2x = x2 + (dx > 0 ? -1 : 1) * Math.max(60, Math.abs(dx) / 2);
    c2y = y2;
  } else {
    if (dy > 0) {
      x1 = cx1; y1 = from.y + from.h;
      x2 = cx2; y2 = to.y;
    } else {
      x1 = cx1; y1 = from.y;
      x2 = cx2; y2 = to.y + to.h;
    }
    c1x = x1;
    c1y = y1 + (dy > 0 ? 1 : -1) * Math.max(60, Math.abs(dy) / 2);
    c2x = x2;
    c2y = y2 + (dy > 0 ? -1 : 1) * Math.max(60, Math.abs(dy) / 2);
  }
  return { x1, y1, c1x, c1y, x2, y2, c2x, c2y };
};

const isValidWorkflowBackupJson = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (!o.workflow || typeof o.workflow !== "object") return false;
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return false;
  return true;
};

export default function WorkflowsPage() {
  const { t } = useLang();
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const [workflows, setWorkflows] = useState<WorkflowModel[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromNodeId, setConnectFromNodeId] = useState<string | null>(null);
  const [edgeFromNodeId, setEdgeFromNodeId] = useState<string>("");
  const [edgeToNodeId, setEdgeToNodeId] = useState<string>("");
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [originalPinchDist, setOriginalPinchDist] = useState<number>(0);
  const [originalPinchZoom, setOriginalPinchZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartUserPos, setPanStartUserPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState(false);
  const [importingClone, setImportingClone] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const cloneBackupFileInputRef = useRef<HTMLInputElement | null>(null);
  type MobileTab = "list" | "canvas" | "inspector";
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  /** True when this page uses the real Fullscreen API on the canvas stage. */
  const [canvasApiFullscreen, setCanvasApiFullscreen] = useState(false);
  /** Fallback: hide side panels + expand in-page if requestFullscreen is unavailable or fails. */
  const [canvasLayoutExpanded, setCanvasLayoutExpanded] = useState(false);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toolOptions, setToolOptions] = useState<ToolOption[]>([]);
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [runningNode, setRunningNode] = useState(false);
  const [inputJson, setInputJson] = useState<string>("");
  const [savingInputPayload, setSavingInputPayload] = useState(false);
  const [run, setRun] = useState<RunModel | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunHistoryItem[]>([]);
  const [nodeRuns, setNodeRuns] = useState<NodeRunHistoryItem[]>([]);
  type NodeRuntimeStatus = "pending" | "running" | "succeeded" | "failed";
  const [nodeRuntimeStatus, setNodeRuntimeStatus] = useState<Record<string, NodeRuntimeStatus>>({});
  const [nodeRuntimeError, setNodeRuntimeError] = useState<Record<string, string>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<"running" | "succeeded" | "failed" | "cancelled" | null>(null);
  const [loadingWorkflowRuns, setLoadingWorkflowRuns] = useState(false);
  const [loadingNodeRuns, setLoadingNodeRuns] = useState(false);
  const [nodeDraft, setNodeDraft] = useState<NodeConfigDraft>({
    name: "",
    toolCode: "",
    promptTemplate: "",
    commandCode: "",
  });
  const [edgeDraft, setEdgeDraft] = useState<{ conditionExpr: string; priority: number; isDefault: boolean }>({ conditionExpr: "", priority: 5, isDefault: false });
  const [metaSnapshotById, setMetaSnapshotById] = useState<Record<string, WorkflowMetaSnapshot>>({});

  const toolNameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    toolOptions.forEach((item) => {
      map[item.skillCode] = item.skillName;
    });
    return map;
  }, [toolOptions]);

  const toolOptionsByCategory = useMemo(() => {
    return toolOptions.reduce<Record<string, ToolOption[]>>((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
  }, [toolOptions]);

  const toolSampleCodeByCode = useMemo(() => {
    const map: Record<string, string> = {};
    toolOptions.forEach((item) => {
      if (item.sampleCode) map[item.skillCode] = item.sampleCode;
    });
    return map;
  }, [toolOptions]);

  const normalizeNode = (raw: Record<string, unknown>): NodeModel => ({
    id: String(raw.id ?? ""),
    clientKey: raw.clientKey ? String(raw.clientKey) : undefined,
    name: String(raw.name ?? "node"),
    toolCode: raw.toolCode == null ? null : String(raw.toolCode),
    promptTemplate: raw.promptTemplate == null ? null : String(raw.promptTemplate),
    commandCode: raw.commandCode == null ? null : String(raw.commandCode),
    modelOverride: raw.modelOverride == null ? null : String(raw.modelOverride),
    maxAttempts: Number(raw.maxAttempts ?? 3),
    timeoutMs: Number(raw.timeoutMs ?? 120000),
    outputSchema: raw.outputSchema == null ? null : String(raw.outputSchema),
    posX: Number(raw.posX ?? 0),
    posY: Number(raw.posY ?? 0),
  });

  const normalizeEdge = (raw: Record<string, unknown>): EdgeModel => ({
    id: String(raw.id ?? makeId()),
    fromNodeId: String(raw.fromNodeId ?? ""),
    toNodeId: String(raw.toNodeId ?? ""),
    conditionExpr: raw.conditionExpr == null ? null : String(raw.conditionExpr),
    priority: Number(raw.priority ?? 5),
    isDefault: Boolean(raw.isDefault),
  });

  const normalizeWorkflow = (raw: Record<string, unknown>): WorkflowModel => ({
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? "Untitled workflow"),
    description: raw.description == null ? null : String(raw.description),
    status: (String(raw.status ?? "draft") as WorkflowStatus),
    entryNodeId: raw.entryNodeId == null ? null : String(raw.entryNodeId),
    inputPayload:
      raw.inputPayload && typeof raw.inputPayload === "object"
        ? (raw.inputPayload as Record<string, unknown>)
        : raw.input_payload && typeof raw.input_payload === "object"
          ? (raw.input_payload as Record<string, unknown>)
          : null,
    version: Number(raw.version ?? 1),
    nodes: Array.isArray(raw.nodes) ? raw.nodes.map((item) => normalizeNode((item || {}) as Record<string, unknown>)) : [],
    edges: Array.isArray(raw.edges) ? raw.edges.map((item) => normalizeEdge((item || {}) as Record<string, unknown>)) : [],
  });

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w.id === selectedWorkflowId) || null,
    [workflows, selectedWorkflowId],
  );

  const selectedNode = useMemo(
    () => selectedWorkflow?.nodes.find((n) => n.id === selectedNodeId) || null,
    [selectedWorkflow, selectedNodeId],
  );

  const hasNodeDraftChanges = useMemo(() => {
    if (!selectedNode) return false;
    return (
      nodeDraft.name !== selectedNode.name ||
      nodeDraft.toolCode !== (selectedNode.toolCode || "") ||
      nodeDraft.promptTemplate !== (selectedNode.promptTemplate || "") ||
      nodeDraft.commandCode !== (selectedNode.commandCode || "")
    );
  }, [selectedNode, nodeDraft]);

  const commandCodePlaceholder = useMemo(() => {
    const promptEmpty = !nodeDraft.promptTemplate || !nodeDraft.promptTemplate.trim();
    const commandEmpty = !nodeDraft.commandCode || !nodeDraft.commandCode.trim();
    if (!promptEmpty || !commandEmpty) return "";
    if (!nodeDraft.toolCode) return "";
    const sampleCode = toolSampleCodeByCode[nodeDraft.toolCode] || "";
    return sampleCode ? formatSampleCodePlaceholder(sampleCode) : "";
  }, [nodeDraft.promptTemplate, nodeDraft.commandCode, nodeDraft.toolCode, toolSampleCodeByCode]);

  const selectedEdge = useMemo(
    () => selectedWorkflow?.edges.find((e) => e.id === selectedEdgeId) || null,
    [selectedWorkflow, selectedEdgeId],
  );

  useEffect(() => {
    if (selectedEdge) {
      setEdgeDraft({
        conditionExpr: selectedEdge.conditionExpr || "",
        priority: selectedEdge.priority ?? 5,
        isDefault: selectedEdge.isDefault ?? false,
      });
    }
  }, [selectedEdge]);

  // Subscribe realtime workflow:* events -> tint node in canvas while run is in-flight.
  // Nest WebChatGateway (namespace /webchat) broadcasts to `user:<uid>` room; we only
  // filter by workflowId to avoid cross-workflow noise on the currently visible canvas.
  //
  // Socket chỉ khi đã chọn workflow. Origin: NEXT_PUBLIC_API_URL lúc build, hoặc fallback
  // window.location.origin (cùng host nginx /api + /socket.io). Tab WS có thể trống nếu đang polling.
  useEffect(() => {
    if (!selectedWorkflow?.id) return;
    const apiBase = getPublicApiOrigin();
    if (!apiBase) {
      console.warn(
        "[workflows] Không có API origin (thiếu NEXT_PUBLIC_API_URL lúc build và không có window) — Socket.IO tắt.",
      );
      return;
    }

    const socket: Socket = io(`${apiBase}/webchat`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const onConnectError = (err: Error) => {
      console.warn("[workflows] Socket.IO connect_error:", err?.message || err);
    };
    socket.on("connect_error", onConnectError);

    const onRunStarted = (p: {
      runId: string;
      workflowId: string;
      entryNodeId: string | null;
    }) => {
      if (p.workflowId !== selectedWorkflow.id) return;
      setActiveRunId(p.runId);
      setActiveRunStatus("running");
      setNodeRuntimeStatus(() => ({}));
      setNodeRuntimeError(() => ({}));
    };
    const onNodeStarted = (p: { workflowId: string; nodeId: string }) => {
      if (p.workflowId !== selectedWorkflow.id) return;
      setNodeRuntimeStatus((prev) => ({ ...prev, [p.nodeId]: "running" }));
      setNodeRuntimeError((prev) => {
        if (!prev[p.nodeId]) return prev;
        const { [p.nodeId]: _drop, ...rest } = prev;
        return rest;
      });
    };
    const onNodeSucceeded = (p: { workflowId: string; nodeId: string }) => {
      if (p.workflowId !== selectedWorkflow.id) return;
      setNodeRuntimeStatus((prev) => ({ ...prev, [p.nodeId]: "succeeded" }));
    };
    const onNodeFailed = (p: {
      workflowId: string;
      nodeId: string;
      error: string;
      willRetry: boolean;
    }) => {
      if (p.workflowId !== selectedWorkflow.id) return;
      setNodeRuntimeStatus((prev) => ({
        ...prev,
        [p.nodeId]: p.willRetry ? "running" : "failed",
      }));
      if (!p.willRetry) {
        setNodeRuntimeError((prev) => ({ ...prev, [p.nodeId]: p.error }));
      }
    };
    const onRunFinished = (p: {
      workflowId: string;
      runId: string;
      status: "succeeded" | "failed" | "cancelled";
    }) => {
      if (p.workflowId !== selectedWorkflow.id) return;
      setActiveRunStatus(p.status);
    };

    socket.on("workflow:run:started", onRunStarted);
    socket.on("workflow:node:started", onNodeStarted);
    socket.on("workflow:node:succeeded", onNodeSucceeded);
    socket.on("workflow:node:failed", onNodeFailed);
    socket.on("workflow:run:finished", onRunFinished);

    return () => {
      socket.off("workflow:run:started", onRunStarted);
      socket.off("workflow:node:started", onNodeStarted);
      socket.off("workflow:node:succeeded", onNodeSucceeded);
      socket.off("workflow:node:failed", onNodeFailed);
      socket.off("workflow:run:finished", onRunFinished);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
    };
  }, [selectedWorkflow?.id]);

  const hasEdgeDraftChanges = useMemo(() => {
    if (!selectedEdge) return false;
    return (
      (selectedEdge.conditionExpr || "") !== edgeDraft.conditionExpr ||
      (selectedEdge.priority ?? 5) !== edgeDraft.priority ||
      (selectedEdge.isDefault ?? false) !== edgeDraft.isDefault
    );
  }, [selectedEdge, edgeDraft]);

  const hasMetadataChanges = useMemo(() => {
    if (!selectedWorkflow) return false;
    const snapshot = metaSnapshotById[selectedWorkflow.id];
    if (!snapshot) return false;
    return (
      selectedWorkflow.name !== snapshot.name ||
      selectedWorkflow.code !== snapshot.code ||
      (selectedWorkflow.description ?? null) !== (snapshot.description ?? null)
    );
  }, [selectedWorkflow, metaSnapshotById]);

  const loadWorkflowRunHistory = async (workflowId: string) => {
    setLoadingWorkflowRuns(true);
    try {
      const res = await listWorkflowRuns(workflowId, { limit: 20, offset: 0 });
      const payload = (res?.data || {}) as Record<string, unknown>;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const normalized = items.map((item) => {
        const raw = (item || {}) as Record<string, unknown>;
        return {
          id: String(raw.id ?? ""),
          status: String(raw.status ?? "unknown"),
          createdAt: raw.createdAt == null ? null : String(raw.createdAt),
          finishedAt: raw.finishedAt == null ? null : String(raw.finishedAt),
        } as WorkflowRunHistoryItem;
      });
      setWorkflowRuns(normalized.filter((x) => Boolean(x.id)));
    } catch (_error) {
      setWorkflowRuns([]);
    } finally {
      setLoadingWorkflowRuns(false);
    }
  };

  const loadNodeRunHistory = async (workflowId: string, nodeId: string) => {
    if (!isUuidLike(nodeId)) {
      setNodeRuns([]);
      return;
    }
    setLoadingNodeRuns(true);
    try {
      const res = await listNodeRuns(workflowId, nodeId, { limit: 20, offset: 0 });
      const payload = (res?.data || {}) as Record<string, unknown>;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const normalized = items.map((item) => {
        const raw = (item || {}) as Record<string, unknown>;
        return {
          id: String(raw.id ?? ""),
          workflowRunId:
            raw.workflowRunId == null
              ? (raw.runId == null ? null : String(raw.runId))
              : String(raw.workflowRunId),
          status: String(raw.status ?? "unknown"),
          attemptNo: raw.attemptNo == null ? (raw.attempt == null ? null : Number(raw.attempt)) : Number(raw.attemptNo),
          resolvedPrompt: raw.resolvedPrompt == null ? null : String(raw.resolvedPrompt),
          resolvedCommand: raw.resolvedCommand == null ? null : String(raw.resolvedCommand),
          output: raw.output,
          error: raw.error == null ? null : String(raw.error),
          durationMs: raw.durationMs == null ? null : Number(raw.durationMs),
          createdAt: raw.createdAt == null ? null : String(raw.createdAt),
        } as NodeRunHistoryItem;
      });
      setNodeRuns(normalized.filter((x) => Boolean(x.id)));
    } catch (_error) {
      setNodeRuns([]);
    } finally {
      setLoadingNodeRuns(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoadingWorkflows(true);
      setLoadError(null);
      try {
        const res = await listWorkflowsApi();
        const data = res?.data;
        const source = Array.isArray(data)
          ? data
          : Array.isArray((data as { items?: unknown[] })?.items)
            ? ((data as { items?: unknown[] }).items as unknown[])
            : [];
        const normalized = source
          .map((item) => normalizeWorkflow((item || {}) as Record<string, unknown>))
          .filter((wf) => Boolean(wf.id));
        if (ignore) return;
        setWorkflows(normalized);
        setMetaSnapshotById(
          normalized.reduce<Record<string, WorkflowMetaSnapshot>>((acc, wf) => {
            acc[wf.id] = {
              name: wf.name,
              code: wf.code,
              description: wf.description ?? null,
            };
            return acc;
          }, {}),
        );
        setSelectedWorkflowId("");
      } catch (_error) {
        if (ignore) return;
        // Keep a functional list on first failure; no workflow selected.
        setWorkflows(MOCK_WORKFLOWS);
        setSelectedWorkflowId("");
        setLoadError(tr("workflowsUi.loadError", "Could not load workflows."));
      } finally {
        if (!ignore) setLoadingWorkflows(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadToolOptions = async () => {
      try {
        const res = await getWorkflowToolOptions();
        const payload = (res?.data || {}) as Record<string, unknown>;
        const grouped = Array.isArray(payload.grouped) ? payload.grouped : [];
        const normalized: ToolOption[] = [];
        grouped.forEach((groupRaw) => {
          const group = (groupRaw || {}) as Record<string, unknown>;
          const category = String(group.category ?? "custom");
          const tools = Array.isArray(group.tools) ? group.tools : [];
          tools.forEach((toolRaw) => {
            const tool = (toolRaw || {}) as Record<string, unknown>;
            const skillCode = String(tool.skillCode ?? "");
            if (!skillCode) return;
            normalized.push({
              skillCode,
              skillName: String(tool.skillName ?? skillCode),
              category,
              sampleCode: tool.sampleCode == null ? null : String(tool.sampleCode),
            });
          });
        });
        if (!ignore) setToolOptions(normalized);
      } catch (_error) {
        if (!ignore) setToolOptions([]);
      }
    };
    void loadToolOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    let ignore = false;
    const loadGraph = async () => {
      try {
        const res = await getWorkflowGraph(selectedWorkflowId);
        const payload = (res?.data || {}) as Record<string, unknown>;
        const workflowRaw = (payload.workflow || {}) as Record<string, unknown>;
        const nodesRaw = Array.isArray(payload.nodes) ? payload.nodes : [];
        const edgesRaw = Array.isArray(payload.edges) ? payload.edges : [];
        const next: WorkflowModel = normalizeWorkflow({
          ...workflowRaw,
          id: workflowRaw.id ?? selectedWorkflowId,
          nodes: nodesRaw,
          edges: edgesRaw,
        });
        if (ignore) return;
        setWorkflows((prev) => prev.map((w) => (w.id === selectedWorkflowId ? next : w)));
        setMetaSnapshotById((prev) => ({
          ...prev,
          [next.id]: {
            name: next.name,
            code: next.code,
            description: next.description ?? null,
          },
        }));
        setDirty(false);
      } catch (_error) {
        if (ignore) return;
        setLoadError(tr("workflowsUi.loadGraphError", "Could not load workflow graph."));
      }
    };
    void loadGraph();
    return () => {
      ignore = true;
    };
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (!selectedWorkflowId) {
      setWorkflowRuns([]);
      return;
    }
    void loadWorkflowRunHistory(selectedWorkflowId);
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (!selectedWorkflowId || !selectedNodeId) {
      setNodeRuns([]);
      setRun(null);
      return;
    }
    if (!isUuidLike(selectedNodeId)) {
      setNodeRuns([]);
      setRun(null);
      return;
    }
    setRun(null);
    void loadNodeRunHistory(selectedWorkflowId, selectedNodeId);
  }, [selectedWorkflowId, selectedNodeId]);

  useEffect(() => {
    if (!selectedNode) {
      setNodeDraft({
        name: "",
        toolCode: "",
        promptTemplate: "",
        commandCode: "",
      });
      return;
    }
    setNodeDraft({
      name: selectedNode.name,
      toolCode: selectedNode.toolCode || "",
      promptTemplate: selectedNode.promptTemplate || "",
      commandCode: selectedNode.commandCode || "",
    });
  }, [selectedNode?.id, selectedWorkflowId]);

  useEffect(() => {
    if (!selectedWorkflow) {
      setInputJson("");
      return;
    }
    const payload = selectedWorkflow.inputPayload;
    if (payload && typeof payload === "object") {
      try {
        setInputJson(JSON.stringify(payload, null, 2));
        return;
      } catch {
        // fallthrough to empty
      }
    }
    setInputJson("{}");
  }, [selectedWorkflow?.id, selectedWorkflow?.inputPayload]);

  const hasInputPayloadChanges = useMemo(() => {
    if (!selectedWorkflow) return false;
    let parsed: Record<string, unknown> | null = null;
    const trimmed = inputJson.trim();
    if (trimmed === "") {
      parsed = null;
    } else {
      try {
        const value = JSON.parse(trimmed);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          parsed = value as Record<string, unknown>;
        } else {
          return false;
        }
      } catch {
        return false;
      }
    }
    const current = selectedWorkflow.inputPayload ?? null;
    return JSON.stringify(parsed) !== JSON.stringify(current);
  }, [inputJson, selectedWorkflow?.id, selectedWorkflow?.inputPayload]);

  const onSaveInputPayload = async () => {
    if (!selectedWorkflow) return;
    const trimmed = inputJson.trim();
    let nextPayload: Record<string, unknown> | null = null;
    if (trimmed !== "") {
      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setSaveError(tr("workflowsUi.inputPayloadInvalid", "Input payload must be a JSON object."));
          return;
        }
        nextPayload = parsed as Record<string, unknown>;
      } catch {
        setSaveError(tr("workflowsUi.inputPayloadInvalid", "Input payload must be a JSON object."));
        return;
      }
    }
    setSavingInputPayload(true);
    setSaveError(null);
    try {
      await updateWorkflowMetaApi(selectedWorkflow.id, { inputPayload: nextPayload });
      upsertWorkflow({ ...selectedWorkflow, inputPayload: nextPayload });
      setLastSavedAt(Date.now());
    } catch (_error) {
      setSaveError(tr("workflowsUi.inputPayloadSaveError", "Could not save input payload."));
    } finally {
      setSavingInputPayload(false);
    }
  };

  const upsertWorkflow = (next: WorkflowModel) => {
    setWorkflows((prev) => prev.map((w) => (w.id === next.id ? next : w)));
  };

  const createEdge = (
    workflow: WorkflowModel,
    fromNodeId: string,
    toNodeId: string,
    extra?: Partial<Pick<EdgeModel, "conditionExpr" | "priority" | "isDefault">>,
  ) => {
    if (fromNodeId === toNodeId) return workflow;
    const exists = workflow.edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId);
    if (exists) return workflow;
    return {
      ...workflow,
      edges: [
        ...workflow.edges,
        {
          id: makeId(),
          fromNodeId,
          toNodeId,
          conditionExpr: extra?.conditionExpr ?? null,
          priority: extra?.priority ?? 5,
          isDefault: extra?.isDefault ?? false,
        },
      ],
    };
  };

  const getNodeById = (id: string) => selectedWorkflow?.nodes.find((n) => n.id === id) || null;

  const completeConnect = (targetId: string) => {
    if (!selectedWorkflow || !pendingConnect) return;
    const sourceId = pendingConnect.sourceId;
    if (sourceId === targetId) {
      setPendingConnect(null);
      return;
    }

    let next = selectedWorkflow;

    if (!pendingConnect.reconnectEdgeId) {
      next = createEdge(next, sourceId, targetId, {
        conditionExpr: null,
        priority: 100,
        isDefault: false,
      });
    } else {
      next = {
        ...next,
        edges: next.edges.map((e) => {
          if (e.id !== pendingConnect.reconnectEdgeId) return e;
          if (pendingConnect.reconnectEnd === "from") return { ...e, fromNodeId: sourceId };
          return { ...e, toNodeId: targetId };
        }),
      };
    }

    upsertWorkflow(next);
    setPendingConnect(null);
    setDirty(true);
  };

  const onCreateWorkflow = async () => {
    setLoadError(null);
    try {
      const code = `workflow_${Date.now()}`;
      const res = await createWorkflowApi({
        code,
        name: "Untitled workflow",
        description: "",
      });
      const raw = (res?.data || {}) as Record<string, unknown>;
      const created = normalizeWorkflow({
        ...raw,
        code: raw.code ?? code,
        nodes: [],
        edges: [],
      });
      setWorkflows((prev) => [created, ...prev]);
      setMetaSnapshotById((prev) => ({
        ...prev,
        [created.id]: {
          name: created.name,
          code: created.code,
          description: created.description ?? null,
        },
      }));
      setSelectedWorkflowId(created.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectFromNodeId(null);
      setDirty(false);
      setMobileTab("canvas");
    } catch (_error) {
      setLoadError(tr("workflowsUi.createError", "Could not create workflow."));
    }
  };

  const onCloneBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoadError(null);
    setImportingClone(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        setLoadError(tr("workflowsUi.cloneJsonParseError", "The file is not valid JSON."));
        return;
      }
      if (!isValidWorkflowBackupJson(parsed)) {
        setLoadError(
          tr("workflowsUi.cloneBackupInvalid", "The file is not a valid workflow backup (expected workflow, nodes, edges)."),
        );
        return;
      }
      const res = await importWorkflowFromBackup({ backup: parsed, restoreStatus: false });
      const data = (res?.data || {}) as Record<string, unknown>;
      const workflowRaw = (data.workflow || {}) as Record<string, unknown>;
      const nodesRaw = Array.isArray(data.nodes) ? data.nodes : [];
      const edgesRaw = Array.isArray(data.edges) ? data.edges : [];
      const newId = String(workflowRaw.id ?? "");
      if (!newId) {
        setLoadError(tr("workflowsUi.cloneImportError", "Import succeeded but the response had no workflow id."));
        return;
      }
      const next = normalizeWorkflow({
        ...workflowRaw,
        id: newId,
        nodes: nodesRaw,
        edges: edgesRaw,
      });
      setWorkflows((prev) => {
        const rest = prev.filter((w) => w.id !== next.id);
        return [next, ...rest];
      });
      setMetaSnapshotById((prev) => ({
        ...prev,
        [next.id]: {
          name: next.name,
          code: next.code,
          description: next.description ?? null,
        },
      }));
      setSelectedWorkflowId(next.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectFromNodeId(null);
      setPendingConnect(null);
      setDirty(false);
      setMobileTab("canvas");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setLoadError(
        e?.response?.data?.message ||
          e?.message ||
          tr("workflowsUi.cloneImportError", "Could not import workflow from this file."),
      );
    } finally {
      setImportingClone(false);
    }
  };

  const onDownloadSelectedWorkflowBackup = async () => {
    if (!selectedWorkflowId) return;
    setLoadError(null);
    setDownloadingBackup(true);
    try {
      await downloadWorkflowBackup(selectedWorkflowId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message?: string };
      let message = tr("workflowsUi.backupError", "Could not download backup file.");
      const d = e?.response?.data;
      if (d instanceof Blob) {
        try {
          const text = await d.text();
          const parsed = JSON.parse(text) as { message?: string };
          if (typeof parsed?.message === "string" && parsed.message) message = parsed.message;
        } catch {
          // keep default
        }
      } else if (d && typeof d === "object" && "message" in d && typeof (d as { message: string }).message === "string") {
        message = (d as { message: string }).message;
      } else if (e?.message) {
        message = e.message;
      }
      setLoadError(message);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const onDeleteWorkflow = async () => {
    if (!selectedWorkflow || deletingWorkflow) return;
    const wf = selectedWorkflow;
    const ok = window.confirm(
      tr(
        "workflowsUi.deleteWorkflowConfirm",
        "Delete this workflow permanently? All nodes, edges, and related data will be removed.",
      ),
    );
    if (!ok) return;
    setDeletingWorkflow(true);
    setLoadError(null);
    try {
      await deleteWorkflowApi(wf.id);
      const prevList = workflows;
      const idx = prevList.findIndex((w) => w.id === wf.id);
      const filtered = prevList.filter((w) => w.id !== wf.id);
      setWorkflows(filtered);
      setMetaSnapshotById((snap) => {
        const next = { ...snap };
        delete next[wf.id];
        return next;
      });
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
      setConnectFromNodeId(null);
      setPendingConnect(null);
      setDirty(false);
      setRun(null);
      setWorkflowRuns([]);
      setNodeRuns([]);
      setVersionConflict(false);
      if (selectedWorkflowId === wf.id) {
        if (filtered.length === 0) {
          setSelectedWorkflowId("");
        } else if (idx <= 0) {
          setSelectedWorkflowId(filtered[0].id);
        } else {
          setSelectedWorkflowId(filtered[idx - 1].id);
        }
      }
    } catch (_error) {
      setLoadError(tr("workflowsUi.deleteWorkflowError", "Could not delete workflow."));
    } finally {
      setDeletingWorkflow(false);
    }
  };

  const onAddNode = () => {
    if (!selectedWorkflow) return;
    const id = makeId();
    const isFirstNode = selectedWorkflow.nodes.length === 0;
    const next: WorkflowModel = {
      ...selectedWorkflow,
      entryNodeId: isFirstNode ? id : selectedWorkflow.entryNodeId,
      nodes: [
        ...selectedWorkflow.nodes,
        {
          id,
          clientKey: `node_${Date.now()}`,
          name: `node_${selectedWorkflow.nodes.length + 1}`,
          toolCode: null,
          promptTemplate: "",
          commandCode: null,
          modelOverride: null,
          maxAttempts: 3,
          timeoutMs: 120000,
          outputSchema: null,
          posX: 180 + selectedWorkflow.nodes.length * 36,
          posY: 120 + selectedWorkflow.nodes.length * 18,
        },
      ],
    };
    upsertWorkflow(next);
    setSelectedNodeId(id);
    setDirty(true);
  };

  const onDeleteNode = (nodeId: string) => {
    if (!selectedWorkflow || selectedWorkflow.nodes.length <= 1) return;
    const nextNodes = selectedWorkflow.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = selectedWorkflow.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId);
    const next: WorkflowModel = {
      ...selectedWorkflow,
      nodes: nextNodes,
      edges: nextEdges,
      entryNodeId: selectedWorkflow.entryNodeId === nodeId ? nextNodes[0]?.id || null : selectedWorkflow.entryNodeId,
    };
    upsertWorkflow(next);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (connectFromNodeId === nodeId) setConnectFromNodeId(null);
    setDirty(true);
  };

  const onDeleteEdge = (edgeId: string) => {
    if (!selectedWorkflow) return;
    const next = { ...selectedWorkflow, edges: selectedWorkflow.edges.filter((e) => e.id !== edgeId) };
    upsertWorkflow(next);
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    setDirty(true);
  };

  const onCanvasPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (originalPinchDist > 0) return;
    if (isPanning) {
      setPanOffset({
        x: panStartOffset.x + (e.clientX - panStartUserPos.x),
        y: panStartOffset.y + (e.clientY - panStartUserPos.y),
      });
      return;
    }
    if (!selectedWorkflow || !dragNodeId) return;
    const canvasRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - canvasRect.left - panOffset.x) / zoom - dragOffset.x;
    const y = (e.clientY - canvasRect.top - panOffset.y) / zoom - dragOffset.y;
    const next = {
      ...selectedWorkflow,
      nodes: selectedWorkflow.nodes.map((n) =>
        n.id === dragNodeId
          ? {
              ...n,
              posX: Math.max(-10000, Math.min(x, 10000)),
              posY: Math.max(-10000, Math.min(y, 10000)),
            }
          : n,
      ),
    };
    upsertWorkflow(next);
    setDirty(true);
  };

  const onSaveGraph = async (workflowToSave?: WorkflowModel) => {
    const currentWorkflow = workflowToSave || selectedWorkflow;
    if (!currentWorkflow) return;
    setSaving(true);
    setSaveError(null);
    setVersionConflict(false);
    try {
      const nodeById = currentWorkflow.nodes.reduce<Record<string, NodeModel>>((acc, node) => {
        acc[node.id] = node;
        return acc;
      }, {});
      const entryNode = currentWorkflow.entryNodeId ? nodeById[currentWorkflow.entryNodeId] : null;
      const payload = {
        expectedVersion: currentWorkflow.version,
        entryNodeId: entryNode && isUuidLike(entryNode.id) ? entryNode.id : undefined,
        entryNodeClientKey: entryNode && !isUuidLike(entryNode.id) ? entryNode.clientKey || entryNode.id : undefined,
        nodes: currentWorkflow.nodes.map((node) => ({
          id: isUuidLike(node.id) ? node.id : undefined,
          clientKey: node.clientKey || node.id,
          name: node.name,
          toolCode: node.toolCode,
          commandCode: node.commandCode,
          promptTemplate: node.promptTemplate,
          modelOverride: node.modelOverride,
          maxAttempts: Math.min(5, Math.max(1, Number(node.maxAttempts || 3))),
          timeoutMs: Number(node.timeoutMs || 120000),
          outputSchema: node.outputSchema,
          joinMode: "none" as const,
          posX: node.posX,
          posY: node.posY,
        })),
        edges: currentWorkflow.edges.map((edge) => {
          const fromNode = nodeById[edge.fromNodeId];
          const toNode = nodeById[edge.toNodeId];
          return {
            id: isUuidLike(edge.id) ? edge.id : undefined,
            fromNodeId: fromNode && isUuidLike(fromNode.id) ? fromNode.id : undefined,
            fromClientKey: fromNode && !isUuidLike(fromNode.id) ? fromNode.clientKey || fromNode.id : undefined,
            toNodeId: toNode && isUuidLike(toNode.id) ? toNode.id : undefined,
            toClientKey: toNode && !isUuidLike(toNode.id) ? toNode.clientKey || toNode.id : undefined,
            conditionExpr: edge.conditionExpr,
            priority: edge.priority,
            isDefault: edge.isDefault,
          };
        }),
      };
      const res = await saveWorkflowGraph(currentWorkflow.id, payload);
      const data = (res?.data || {}) as Record<string, unknown>;
      const workflowRaw = (data.workflow || {}) as Record<string, unknown>;
      const next = normalizeWorkflow({
        ...currentWorkflow,
        ...workflowRaw,
        nodes: Array.isArray(data.nodes) ? data.nodes : currentWorkflow.nodes,
        edges: Array.isArray(data.edges) ? data.edges : currentWorkflow.edges,
      });
      upsertWorkflow(next);
      setDirty(false);
      setLastSavedAt(Date.now());
    } catch (error: unknown) {
      const statusCode = Number((error as { response?: { status?: number } })?.response?.status || 0);
      if (statusCode === 409) setVersionConflict(true);
      setSaveError(tr("workflowsUi.saveError", "Could not save graph."));
    } finally {
      setSaving(false);
    }
  };

  const latestOnSaveGraph = useRef(onSaveGraph);
  latestOnSaveGraph.current = onSaveGraph;

  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => {
      latestOnSaveGraph.current();
    }, 5000);
    return () => clearTimeout(timer);
  }, [dirty, saving, selectedWorkflow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "F5")) {
        e.preventDefault();
        if (dirty && !saving) {
          latestOnSaveGraph.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, saving]);

  const onSaveMetadata = async () => {
    if (!selectedWorkflow) return;
    setSavingMeta(true);
    setSaveError(null);
    try {
      const res = await updateWorkflowMetaApi(selectedWorkflow.id, {
        code: selectedWorkflow.code,
        name: selectedWorkflow.name,
        description: selectedWorkflow.description,
      });
      const raw = (res?.data || {}) as Record<string, unknown>;
      upsertWorkflow({
        ...selectedWorkflow,
        code: raw.code == null ? selectedWorkflow.code : String(raw.code),
        name: raw.name == null ? selectedWorkflow.name : String(raw.name),
        description:
          raw.description == null
            ? selectedWorkflow.description
            : String(raw.description),
      });
      setMetaSnapshotById((prev) => ({
        ...prev,
        [selectedWorkflow.id]: {
          name: raw.name == null ? selectedWorkflow.name : String(raw.name),
          code: raw.code == null ? selectedWorkflow.code : String(raw.code),
          description:
            raw.description == null
              ? (selectedWorkflow.description ?? null)
              : String(raw.description),
        },
      }));
      setLastSavedAt(Date.now());
    } catch (_error) {
      setSaveError(tr("workflowsUi.metaSaveError", "Could not update workflow metadata."));
    } finally {
      setSavingMeta(false);
    }
  };

  const onRunWorkflow = async () => {
    if (!selectedWorkflow) return;
    setRunningWorkflow(true);
    setRun(null);
    setNodeRuntimeStatus({});
    setNodeRuntimeError({});
    setActiveRunStatus("running");
    try {
      const parsedInput = JSON.parse(inputJson || "{}") as Record<string, unknown>;
      const runRes = await runWorkflowApi(selectedWorkflow.id, {
        threadId: `manual-${Date.now()}`,
        input: parsedInput,
      });
      const runData = (runRes?.data || {}) as Record<string, unknown>;
      const runId = String(runData.runId ?? (runData.run as { id?: string })?.id ?? "");
      if (!runId) throw new Error("Missing run id");
      void loadRunDetail(runId);
      void loadWorkflowRunHistory(selectedWorkflow.id);
    } catch (_error) {
      setSaveError(tr("workflowsUi.runError", "Could not run workflow."));
    } finally {
      setRunningWorkflow(false);
    }
  };

  const onRunNode = async () => {
    if (!selectedWorkflow || !selectedNode) return;
    setRunningNode(true);
    setRun(null);
    try {
      const parsedInput = JSON.parse(inputJson || "{}") as Record<string, unknown>;
      const runRes = await runWorkflowNode(selectedWorkflow.id, selectedNode.id, {
        threadId: `manual-node-${Date.now()}`,
        input: parsedInput,
      });
      const runData = (runRes?.data || {}) as Record<string, unknown>;
      const runId = String(runData.runId ?? (runData.run as { id?: string })?.id ?? "");
      if (!runId) throw new Error("Missing run id");
      void loadRunDetail(runId);
      void loadWorkflowRunHistory(selectedWorkflow.id);
      void loadNodeRunHistory(selectedWorkflow.id, selectedNode.id);
    } catch (_error) {
      setSaveError(tr("workflowsUi.runNodeError", "Could not run selected node."));
    } finally {
      setRunningNode(false);
    }
  };

  const onDeleteWorkflowHistory = async () => {
    if (!selectedWorkflow) return;
    try {
      await deleteWorkflowRuns(selectedWorkflow.id);
      await loadWorkflowRunHistory(selectedWorkflow.id);
      setNodeRuns([]);
    } catch (_error) {
      setSaveError(tr("workflowsUi.deleteWorkflowHistoryError", "Could not delete workflow history."));
    }
  };

  const onDeleteNodeHistory = async () => {
    if (!selectedWorkflow || !selectedNode) return;
    if (!isUuidLike(selectedNode.id)) {
      setSaveError(tr("workflowsUi.nodeNotSavedYet", "Please save workflow first to fetch node history."));
      return;
    }
    try {
      await deleteNodeRuns(selectedWorkflow.id, selectedNode.id);
      await loadNodeRunHistory(selectedWorkflow.id, selectedNode.id);
    } catch (_error) {
      setSaveError(tr("workflowsUi.deleteNodeHistoryError", "Could not delete node history."));
    }
  };

  const onSelectNodeRunHistory = (item: NodeRunHistoryItem) => {
    const outputText = formatOutputForDisplay(item.output);
    setRun({
      id: item.workflowRunId || item.id,
      status: (item.status as RunStatus),
      finalOutput: outputText || JSON.stringify(item, null, 2),
      logs: [
        {
          id: item.id,
          nodeName: selectedNode?.name || "node",
          status: item.status === "failed" ? "failed" : item.status === "succeeded" ? "succeeded" : "running",
          resolvedPrompt: item.resolvedPrompt || "",
          resolvedCommand: item.resolvedCommand || "",
          resolvedOutput: outputText,
          durationMs: Number(item.durationMs || 0),
          error: item.error || null,
        },
      ],
    });
  };

  const onSaveNodeConfig = async () => {
    if (!selectedWorkflow || !selectedNode) return;
    const next: WorkflowModel = {
      ...selectedWorkflow,
      nodes: selectedWorkflow.nodes.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              name: nodeDraft.name,
              toolCode: nodeDraft.toolCode.trim() || null,
              promptTemplate: nodeDraft.promptTemplate.trim() || null,
              commandCode: nodeDraft.commandCode.trim() || null,
            }
          : n,
      ),
    };
    upsertWorkflow(next);
    setDirty(true);
    await onSaveGraph(next);
  };

  const onSaveEdgeConfig = async () => {
    if (!selectedWorkflow || !selectedEdge) return;
    const next: WorkflowModel = {
      ...selectedWorkflow,
      edges: selectedWorkflow.edges.map((ed) =>
        ed.id === selectedEdge.id
          ? {
              ...ed,
              conditionExpr: edgeDraft.conditionExpr.trim() || null,
              priority: edgeDraft.priority,
              isDefault: edgeDraft.isDefault,
            }
          : ed,
      ),
    };
    upsertWorkflow(next);
    setDirty(true);
    await onSaveGraph(next);
  };

  const loadRunDetail = async (runId: string) => {
    const detailRes = await getWorkflowRunDetail(runId);
    const detail = (detailRes?.data || {}) as Record<string, unknown>;
    const runRaw = (detail.run || {}) as Record<string, unknown>;
    const nodeRuns = Array.isArray(detail.nodeRuns) ? detail.nodeRuns : [];
    const logs: RunNodeLog[] = nodeRuns.map((item) => {
      const raw = (item || {}) as Record<string, unknown>;
      const status = String(raw.status || "running");
      const outputRaw = raw.output ?? raw.result ?? raw.response ?? raw.finalOutput ?? null;
      return {
        id: String(raw.id ?? makeId()),
        nodeName: String(raw.nodeName ?? raw.node_name ?? raw.nodeId ?? "node"),
        status: status === "failed" ? "failed" : status === "succeeded" || status === "completed" ? "succeeded" : "running",
        resolvedPrompt: String(raw.resolvedPrompt ?? ""),
        resolvedCommand: String(raw.resolvedCommand ?? ""),
        resolvedOutput: formatOutputForDisplay(outputRaw),
        durationMs: Number(raw.durationMs ?? raw.duration_ms ?? 0),
        error: raw.error == null ? null : String(raw.error),
      };
    });
    setRun({
      id: runId,
      status: (String(runRaw.status || "running") as RunStatus),
      finalOutput: JSON.stringify(detail, null, 2),
      logs,
    });
  };

  const validationIssues = useMemo(() => {
    if (!selectedWorkflow) return [] as string[];
    const issues: string[] = [];
    const { nodes, edges } = selectedWorkflow;

    if (nodes.length === 0) issues.push(tr("workflowsUi.validationMinNode", "Workflow must contain at least 1 node."));
    if (!selectedWorkflow.entryNodeId) issues.push(tr("workflowsUi.validationEntry", "Workflow must have an entry node."));

    const names = nodes.map((n) => n.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) issues.push(tr("workflowsUi.validationUniqueNames", "Node names must be unique."));

    const nodeSet = new Set(nodes.map((n) => n.id));
    edges.forEach((e) => {
      if (!nodeSet.has(e.fromNodeId) || !nodeSet.has(e.toNodeId)) {
        issues.push(tr("workflowsUi.validationMissingNodeRef", "Edge references deleted/missing node."));
      }
      if (e.fromNodeId === e.toNodeId) {
        issues.push(tr("workflowsUi.validationSelfLoop", "Self-loop edge is not allowed."));
      }
    });

    const groupedDefault = edges.reduce<Record<string, number>>((acc, edge) => {
      if (edge.isDefault) acc[edge.fromNodeId] = (acc[edge.fromNodeId] || 0) + 1;
      return acc;
    }, {});
    Object.entries(groupedDefault).forEach(([, count]) => {
      if (count > 1) issues.push(tr("workflowsUi.validationMultiDefault", "A node has more than 1 default outgoing edge."));
    });

    const outgoingCount = edges.reduce<Record<string, number>>((acc, edge) => {
      acc[edge.fromNodeId] = (acc[edge.fromNodeId] || 0) + 1;
      return acc;
    }, {});
    const incomingCount = edges.reduce<Record<string, number>>((acc, edge) => {
      acc[edge.toNodeId] = (acc[edge.toNodeId] || 0) + 1;
      return acc;
    }, {});
    nodes.forEach((node) => {
      const outgoing = outgoingCount[node.id] || 0;
      const incoming = incomingCount[node.id] || 0;
      const isTerminal = outgoing === 0;
      if (!isTerminal && outgoing > 0) return;
      if (node.id !== selectedWorkflow.entryNodeId && incoming > 0 && outgoing === 0) return;
      if (node.id !== selectedWorkflow.entryNodeId && incoming === 0) {
        issues.push(tr("workflowsUi.validationDisconnected", `Node "${node.name}" is disconnected (no incoming edge).`));
      }
    });

    if (hasCycle(nodes, edges)) issues.push(tr("workflowsUi.validationCycle", "Graph has cycle (A -> ... -> A)."));

    if (selectedWorkflow.entryNodeId) {
      const reachable = new Set<string>();
      const stack = [selectedWorkflow.entryNodeId];
      while (stack.length) {
        const cur = stack.pop()!;
        if (reachable.has(cur)) continue;
        reachable.add(cur);
        edges
          .filter((e) => e.fromNodeId === cur)
          .forEach((e) => stack.push(e.toNodeId));
      }
      nodes.forEach((n) => {
        if (!reachable.has(n.id)) {
          issues.push(tr("workflowsUi.validationUnreachable", `Node "${n.name}" is unreachable from entry.`));
        }
      });
    }

    return Array.from(new Set(issues));
  }, [selectedWorkflow]);

  const flowNumbering = useMemo(() => {
    const result = {
      nodeMeta: {} as Record<string, FlowMeta>,
      edgeOrderIndex: {} as Record<string, number>,
    };
    if (!selectedWorkflow || !selectedWorkflow.entryNodeId) return result;

    const outgoingByFrom = selectedWorkflow.nodes.reduce<Record<string, EdgeModel[]>>((acc, node) => {
      acc[node.id] = [];
      return acc;
    }, {});
    selectedWorkflow.edges.forEach((edge) => {
      if (!outgoingByFrom[edge.fromNodeId]) outgoingByFrom[edge.fromNodeId] = [];
      outgoingByFrom[edge.fromNodeId].push(edge);
    });

    Object.keys(outgoingByFrom).forEach((fromId) => {
      outgoingByFrom[fromId].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id.localeCompare(b.id);
      });
      outgoingByFrom[fromId].forEach((edge, idx) => {
        result.edgeOrderIndex[edge.id] = idx + 1;
      });
    });

    const queue: Array<{ nodeId: string; label: string }> = [{ nodeId: selectedWorkflow.entryNodeId, label: "1" }];
    const visited = new Set<string>();
    const incomingLabelMap: Record<string, string[]> = {};

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (!incomingLabelMap[cur.nodeId]) incomingLabelMap[cur.nodeId] = [];
      incomingLabelMap[cur.nodeId].push(cur.label);

      if (!visited.has(cur.nodeId)) {
        visited.add(cur.nodeId);
        result.nodeMeta[cur.nodeId] = {
          flowOrderLabel: cur.label,
          incomingFromLabels: [],
          primaryPath: true,
        };
      }

      const outgoing = outgoingByFrom[cur.nodeId] || [];
      const curBase = Number(cur.label.split(".")[0]) || 1;
      const nextBase = curBase + 1;
      outgoing.forEach((edge, idx) => {
        // Numbering strategy:
        // - Linear: 1 -> 2 -> 3
        // - Split from step x to next step: x+1.1, x+1.2
        const nextLabel = outgoing.length <= 1 ? `${nextBase}` : `${nextBase}.${idx + 1}`;
        queue.push({ nodeId: edge.toNodeId, label: nextLabel });
      });
    }

    Object.entries(incomingLabelMap).forEach(([nodeId, labels]) => {
      if (!result.nodeMeta[nodeId]) return;
      const unique = Array.from(new Set(labels));
      const primary = result.nodeMeta[nodeId].flowOrderLabel;
      result.nodeMeta[nodeId] = {
        ...result.nodeMeta[nodeId],
        incomingFromLabels: unique.filter((item) => item !== primary),
      };
    });

    selectedWorkflow.nodes.forEach((node) => {
      if (!result.nodeMeta[node.id]) {
        result.nodeMeta[node.id] = {
          flowOrderLabel: "unreachable",
          incomingFromLabels: [],
          primaryPath: false,
        };
      }
    });

    return result;
  }, [selectedWorkflow]);

  useEffect(() => {
    if (!dirty || !selectedWorkflow) return;
    const timer = setTimeout(() => {
      void onSaveGraph();
    }, 1000);
    return () => clearTimeout(timer);
  }, [dirty, selectedWorkflow]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedWorkflow || !selectedEdgeId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      onDeleteEdge(selectedEdgeId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedWorkflow, selectedEdgeId]);

  const isCanvasStageElementFullscreen = (el: HTMLDivElement | null) => {
    if (!el) return false;
    return (
      document.fullscreenElement === el || (document as unknown as { webkitFullscreenElement?: Element | null }).webkitFullscreenElement === el
    );
  };

  const exitCanvasStageFullscreen = useCallback(async () => {
    setCanvasLayoutExpanded(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const doc = document as unknown as { webkitExitFullscreen?: () => Promise<void> };
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      /* user may have already left fullscreen */
    }
  }, []);

  const clearWorkflowSelection = useCallback(() => {
    setSelectedWorkflowId("");
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectFromNodeId(null);
    setPendingConnect(null);
    setDirty(false);
    setSaveError(null);
    setVersionConflict(false);
    setCanvasLayoutExpanded(false);
    setMobileTab("list");
    void exitCanvasStageFullscreen();
  }, [exitCanvasStageFullscreen]);

  useEffect(() => {
    if (!selectedWorkflowId && mobileTab !== "list") {
      setMobileTab("list");
    }
  }, [selectedWorkflowId, mobileTab]);

  useEffect(() => {
    if ((selectedNodeId || selectedEdgeId) && selectedWorkflowId) {
      setMobileTab("inspector");
    }
  }, [selectedNodeId, selectedEdgeId, selectedWorkflowId]);

  const requestCanvasStageFullscreen = useCallback(async () => {
    const el = canvasStageRef.current;
    if (!el) return;
    setCanvasLayoutExpanded(false);
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
      const wk = el as unknown as { webkitRequestFullscreen?: () => Promise<void> };
      if (wk.webkitRequestFullscreen) {
        await wk.webkitRequestFullscreen();
        return;
      }
    } catch {
      /* fall through to layout */
    }
    setCanvasLayoutExpanded(true);
  }, []);

  useEffect(() => {
    const sync = () => {
      setCanvasApiFullscreen(isCanvasStageElementFullscreen(canvasStageRef.current));
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !selectedWorkflowId) return;
      e.preventDefault();
      clearWorkflowSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedWorkflowId, clearWorkflowSelection]);

  useEffect(() => {
    if (!canvasApiFullscreen) return;
    const nudge = () => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    };
    window.addEventListener("orientationchange", nudge);
    window.addEventListener("resize", nudge);
    return () => {
      window.removeEventListener("orientationchange", nudge);
      window.removeEventListener("resize", nudge);
    };
  }, [canvasApiFullscreen]);

  const hideWorkflowSidePanels = canvasApiFullscreen || canvasLayoutExpanded;
  const hideWorkflowInspectorPanel = hideWorkflowSidePanels || !selectedWorkflowId;
  const toolbarOnlyExitLayout = canvasLayoutExpanded && !canvasApiFullscreen;
  const hideMobileTabBar = hideWorkflowSidePanels;
  const leftPanelVisibility = hideWorkflowSidePanels
    ? "hidden"
    : mobileTab === "list"
      ? "flex"
      : "hidden md:flex";
  const rightPanelVisibility = hideWorkflowInspectorPanel
    ? "hidden"
    : mobileTab === "inspector"
      ? "flex"
      : "hidden md:flex";
  const canvasVisibility = hideWorkflowSidePanels || mobileTab === "canvas" ? "flex" : "hidden md:flex";
  const canCanvasTab = Boolean(selectedWorkflowId);
  const canInspectorTab = Boolean(selectedWorkflowId);

  return (
    <div className="relative flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 min-[700px]:min-h-[600px]">
      <div className="relative h-full w-full min-h-0">
        <section className={`pointer-events-auto absolute left-2 right-2 top-2 bottom-[56px] z-20 w-auto flex-col overflow-y-auto rounded-2xl border border-white/60 bg-white/70 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-2xl scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200 sm:p-4 md:bottom-4 md:left-4 md:right-auto md:top-4 md:max-h-none md:w-[320px] ${leftPanelVisibility}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[rgb(173,8,8)]">{tr("workflowsUi.workflows", "Workflows")}</h2>
            <div className="flex shrink-0 items-center gap-1">
              <input
                ref={cloneBackupFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onCloneBackupFileChange}
              />
              <button
                type="button"
                disabled={importingClone}
                onClick={() => cloneBackupFileInputRef.current?.click()}
                className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={tr("workflowsUi.cloneHint", "Create a copy from a JSON backup (export file)")}
                aria-label={tr("workflowsUi.clone", "Clone")}
              >
                {importingClone ? tr("workflowsUi.cloning", "Cloning...") : tr("workflowsUi.clone", "Clone")}
              </button>
              <button
                type="button"
                onClick={onCreateWorkflow}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
              >
                {tr("workflowsUi.new", "New")}
              </button>
            </div>
          </div>
          {loadingWorkflows && <p className="mb-2 text-xs text-zinc-600">{tr("workflowsUi.loading", "Loading workflows...")}</p>}
          {loadError && <p className="mb-2 text-xs text-red-700">{loadError}</p>}

          {!selectedWorkflow ? (
            <div className="mb-3 max-h-60 space-y-2 overflow-auto">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    setSelectedWorkflowId(wf.id);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                    setConnectFromNodeId(null);
                    setMobileTab("canvas");
                  }}
                  className="min-w-0 w-full rounded-lg border border-red-200 bg-white px-3 py-1.5 text-left text-zinc-700 hover:bg-red-50"
                >
                  <p className="truncate text-xs font-semibold leading-tight" title={wf.name}>
                    {wf.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-600" title={`v${wf.version} - ${wf.status}`}>
                    v{wf.version} - {wf.status}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => clearWorkflowSelection()}
                className="mb-2 w-full text-left text-[11px] font-medium text-red-700 hover:underline"
              >
                {tr("workflowsUi.backToList", "← All workflows")}
              </button>
              <div
                className="rounded-lg border border-red-600 bg-red-100 px-3 py-2"
                title={selectedWorkflow.id}
                aria-current="true"
              >
                <p className="truncate text-xs font-semibold leading-tight text-red-800" title={selectedWorkflow.name}>
                  {selectedWorkflow.name}
                </p>
                <p
                  className="mt-0.5 truncate text-[11px] text-red-900/70"
                  title={`v${selectedWorkflow.version} - ${selectedWorkflow.status}`}
                >
                  v{selectedWorkflow.version} - {selectedWorkflow.status}
                </p>
              </div>
            </div>
          )}

          {selectedWorkflow && (
            <div className="space-y-2 border-t border-red-200 pt-3">
              <div className="flex items-center gap-1">
                <span
                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-zinc-700 break-all"
                  title={selectedWorkflow.id}
                >
                  Workflow ID: {selectedWorkflow.id}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      void navigator.clipboard.writeText(selectedWorkflow.id);
                    }
                  }}
                  aria-label="Copy workflow id"
                  title="Copy workflow id"
                  className="flex h-8 w-8 appearance-none items-center justify-center rounded border-0 bg-transparent text-zinc-500 outline-none ring-0 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path
                      d="M9 9h11v12H9V9Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 15V4h11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <label className="block text-xs text-zinc-600">{tr("workflowsUi.code", "Code")}</label>
              <input
                value={selectedWorkflow.code}
                onChange={(e) => {
                  upsertWorkflow({ ...selectedWorkflow, code: e.target.value });
                }}
                className="w-full rounded border border-red-300 px-2 py-1.5 text-xs"
              />
              <label className="block text-xs text-zinc-600">{tr("workflowsUi.name", "Name")}</label>
              <input
                value={selectedWorkflow.name}
                onChange={(e) => {
                  upsertWorkflow({ ...selectedWorkflow, name: e.target.value });
                }}
                className="w-full rounded border border-red-300 px-2 py-1.5 text-xs"
              />
              <label className="block text-xs text-zinc-600">{tr("workflowsUi.description", "Description")}</label>
              <textarea
                value={selectedWorkflow.description ?? ""}
                onChange={(e) => {
                  upsertWorkflow({ ...selectedWorkflow, description: e.target.value || null });
                }}
                className="min-h-16 w-full rounded border border-red-300 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={onSaveMetadata}
                disabled={savingMeta || !hasMetadataChanges}
                className="w-full rounded bg-red-100 px-3 py-2 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {savingMeta ? tr("workflowsUi.saving", "Saving...") : tr("workflowsUi.saveMeta", "Save Info")}
              </button>
              <button
                type="button"
                onClick={() => void onDeleteWorkflow()}
                disabled={deletingWorkflow || savingMeta}
                className="w-full rounded border border-red-400 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingWorkflow ? tr("workflowsUi.deletingWorkflow", "Deleting...") : tr("workflowsUi.deleteWorkflow", "Delete workflow")}
              </button>
              <label className="block text-xs text-zinc-600">{tr("workflowsUi.status", "Status")}</label>
              <select
                value={selectedWorkflow.status}
                onChange={(e) => {
                  const nextStatus = e.target.value as WorkflowStatus;
                  upsertWorkflow({ ...selectedWorkflow, status: nextStatus });
                  void updateWorkflowStatus(selectedWorkflow.id, nextStatus).catch(() => {
                    setSaveError(tr("workflowsUi.statusError", "Could not update workflow status."));
                  });
                }}
                className="w-full rounded border border-red-300 px-2 py-1.5 text-xs"
              >
                        <option value="draft">{tr("workflowsUi.draft", "draft")}</option>
                        <option value="active">{tr("workflowsUi.active", "active")}</option>
                        <option value="paused">{tr("workflowsUi.paused", "paused")}</option>
                        <option value="archived">{tr("workflowsUi.archived", "archived")}</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void onSaveGraph()}
                  disabled={!dirty || saving}
                  className="rounded bg-[rgb(173,8,8)] px-3 py-2 text-xs text-white disabled:opacity-50"
                >
                  {saving ? tr("workflowsUi.saving", "Saving...") : tr("workflowsUi.saveGraph", "Save Graph")}
                </button>
              </div>
              <div className="rounded border border-red-200 bg-white p-2 text-xs">
                <p className={`${dirty ? "text-amber-700" : "text-emerald-700"}`}>
                  {dirty ? tr("workflowsUi.unsaved", "Unsaved changes") : tr("workflowsUi.saved", "Saved")}
                </p>
                {saving && <p className="text-zinc-600">{tr("workflowsUi.saving", "Saving...")}</p>}
                {lastSavedAt && <p className="text-zinc-600">{tr("workflowsUi.lastSaved", "Last saved")}: {new Date(lastSavedAt).toLocaleTimeString()}</p>}
                {saveError && <p className="text-red-700">{saveError}</p>}
                {versionConflict && <p className="text-red-700">{tr("workflowsUi.versionConflict", "Version conflict. Please reload graph.")}</p>}
              </div>

              <div className="rounded border border-red-200 bg-red-50 p-2">
                <p className="text-xs font-semibold text-red-700">{tr("workflowsUi.validation", "Validation")}</p>
                {validationIssues.length === 0 ? (
                  <p className="text-xs text-emerald-700">{tr("workflowsUi.noIssues", "No issues.")}</p>
                ) : (
                  <ul className="list-disc pl-4 text-xs text-red-700">
                    {validationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <div
          ref={canvasStageRef}
          className={`absolute inset-0 z-10 min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-50 ${canvasVisibility}`}
        >
          {canvasApiFullscreen && (
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex justify-end p-3"
              style={{
                paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
                paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
              }}
            >
              <button
                type="button"
                onClick={() => void exitCanvasStageFullscreen()}
                className="pointer-events-auto inline-flex h-11 min-h-[44px] min-w-[44px] w-11 items-center justify-center rounded-2xl border-2 border-red-500/30 bg-white/95 text-red-700 shadow-lg ring-1 ring-zinc-200/80 hover:bg-red-50"
                aria-label={tr("workflowsUi.exitCanvasFullscreen", "Exit fullscreen canvas")}
                title={tr("workflowsUi.shrinkCanvas", "Shrink canvas")}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path
                    d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {!canvasApiFullscreen && selectedWorkflow && (
            <div className="pointer-events-auto absolute left-1/2 top-4 z-30 flex max-w-[min(100%,calc(100vw-1.5rem))] -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/70 px-2 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl min-[500px]:gap-6 min-[500px]:px-4 min-[500px]:py-3 sm:px-3">
            <div className="flex min-w-0 items-center gap-1 min-[500px]:gap-2 sm:gap-2">
              <button
                type="button"
                onClick={() => void (toolbarOnlyExitLayout ? exitCanvasStageFullscreen() : requestCanvasStageFullscreen())}
                className="inline-flex h-8 w-8 min-h-10 min-w-10 shrink-0 items-center justify-center rounded border border-red-300 bg-white text-red-700 hover:bg-red-50"
                aria-label={
                  toolbarOnlyExitLayout
                    ? tr("workflowsUi.shrinkCanvas", "Shrink canvas")
                    : tr("workflowsUi.enterFullscreen", "Expand canvas")
                }
                title={
                  toolbarOnlyExitLayout
                    ? tr("workflowsUi.shrinkCanvas", "Shrink canvas")
                    : tr("workflowsUi.enterFullscreen", "Expand canvas")
                }
              >
                {toolbarOnlyExitLayout ? (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path
                      d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path
                      d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedWorkflow || selectedWorkflow.nodes.length === 0) return;
                  
                  const edges = selectedWorkflow.edges;
                  const nodes = selectedWorkflow.nodes;
                  
                  const outEdges = new Map<string, string[]>();
                  const inDegree = new Map<string, number>();
                  nodes.forEach(n => {
                    outEdges.set(n.id, []);
                    inDegree.set(n.id, 0);
                  });
                  
                  edges.forEach(e => {
                    if (outEdges.has(e.fromNodeId) && inDegree.has(e.toNodeId)) {
                      outEdges.get(e.fromNodeId)!.push(e.toNodeId);
                      inDegree.set(e.toNodeId, inDegree.get(e.toNodeId)! + 1);
                    }
                  });
                  
                  let roots: string[] = [];
                  for (const [id, deg] of inDegree.entries()) if (deg === 0) roots.push(id);
                  if (selectedWorkflow.entryNodeId && !roots.includes(selectedWorkflow.entryNodeId)) roots.push(selectedWorkflow.entryNodeId);
                  if (roots.length === 0) roots = [nodes[0].id];
                  
                  const layers = new Map<string, number>();
                  roots.forEach(r => layers.set(r, 0));
                  
                  let queue = [...roots];
                  let safety = 10000;
                  while (queue.length > 0 && safety-- > 0) {
                     const curr = queue.shift()!;
                     const currentLayer = layers.get(curr) || 0;
                     const children = outEdges.get(curr) || [];
                     for (const child of children) {
                        const nextLayer = currentLayer + 1;
                        if (nextLayer > nodes.length + 2) continue;
                        if (!layers.has(child) || layers.get(child)! < nextLayer) {
                           layers.set(child, nextLayer);
                           queue.push(child);
                        }
                     }
                  }
                  
                  nodes.forEach(n => {
                     if (!layers.has(n.id)) layers.set(n.id, 0);
                  });
                  
                  const nodesByLayer = new Map<number, typeof nodes>();
                  for (const n of nodes) {
                     const l = layers.get(n.id) || 0;
                     if (!nodesByLayer.has(l)) nodesByLayer.set(l, []);
                     nodesByLayer.get(l)!.push(n);
                  }
                  
                  const LAYER_WIDTH = 450;
                  const VERTICAL_SPACING = 250;
                  const newNodes = nodes.map(n => {
                     const l = layers.get(n.id) || 0;
                     const layerNodes = nodesByLayer.get(l)!;
                     const idx = layerNodes.findIndex(x => x.id === n.id);
                     const startY = 300 - ((layerNodes.length - 1) * VERTICAL_SPACING) / 2;
                     return {
                        ...n,
                        posX: 200 + l * LAYER_WIDTH,
                        posY: startY + idx * VERTICAL_SPACING
                     };
                  });
                  
                  upsertWorkflow({
                    ...selectedWorkflow,
                    nodes: newNodes,
                  });
                  setDirty(true);
                }}
                disabled={!selectedWorkflow || selectedWorkflow.nodes.length === 0}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tr("workflowsUi.rearrange", "Sắp xếp lại")}
              </button>
              {selectedNodeId && (
                <div className="flex items-center gap-1">
                  <span
                    className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-zinc-700 break-all"
                    title={selectedNodeId}
                  >
                    Node ID: {selectedNodeId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        void navigator.clipboard.writeText(selectedNodeId);
                      }
                    }}
                    aria-label="Copy node id"
                    title="Copy node id"
                    className="flex h-8 w-8 appearance-none items-center justify-center rounded border-0 bg-transparent text-zinc-500 outline-none ring-0 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <path
                        d="M9 9h11v12H9V9Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 15V4h11"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center bg-white/50 backdrop-blur rounded-lg px-2 py-1 shadow-sm border border-zinc-200">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
                className="flex h-6 w-6 items-center justify-center rounded-md font-bold text-zinc-600 hover:bg-zinc-200"
              >-</button>
              <span className="text-xs font-medium w-12 text-center text-zinc-600">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(3, z + 0.1))}
                className="flex h-6 w-6 items-center justify-center rounded-md font-bold text-zinc-600 hover:bg-zinc-200"
              >+</button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAddNode}
                disabled={!selectedWorkflow}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tr("workflowsUi.addNode", "Add Node")}
              </button>
              {connectFromNodeId && (
                <button
                  type="button"
                  onClick={() => setConnectFromNodeId(null)}
                  className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700"
                >
                  {tr("workflowsUi.cancelConnect", "Cancel Connect")}
                </button>
              )}
            </div>
          </div>
          )}

          <div className="relative min-h-0 w-full flex-1">
          <div
            id="canvas-wrapper"
            className={`pointer-events-auto absolute inset-0 z-0 h-full w-full overflow-hidden touch-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${panOffset.x}px ${panOffset.y}px` }}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                setOriginalPinchDist(Math.hypot(dx, dy));
                setOriginalPinchZoom(zoom);
                setIsPanning(false);
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2 && originalPinchDist > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                setZoom(Math.max(0.1, Math.min(originalPinchZoom * (dist / originalPinchDist), 4)));
              }
            }}
            onTouchEnd={(e) => {
              if (e.touches.length < 2) {
                setOriginalPinchDist(0);
              }
            }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                setZoom((z) => Math.max(0.1, Math.min(z - e.deltaY * 0.005, 3)));
              } else {
                setPanOffset((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
              }
            }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={(e) => {
              setDragNodeId(null);
              setIsPanning(false);
              if (pendingConnect && e.target === e.currentTarget) {
                setPendingConnect(null);
              }
            }}
            onPointerLeave={() => { setDragNodeId(null); setIsPanning(false); }}
            onPointerMoveCapture={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              setMouseCanvasPos({ x: (e.clientX - rect.left - panOffset.x) / zoom, y: (e.clientY - rect.top - panOffset.y) / zoom });
            }}
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.id === "canvas-wrapper" || target.id === "canvas-layer" || target.tagName.toLowerCase() === "svg") {
                setIsPanning(true);
                setPanStartUserPos({ x: e.clientX, y: e.clientY });
                setPanStartOffset(panOffset);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }
            }}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.id === "canvas-wrapper" || target.id === "canvas-layer" || target.tagName.toLowerCase() === "svg") {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }
            }}
          >
            <div id="canvas-layer" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ overflow: "visible" }}
            >
              {selectedWorkflow?.edges.map((edge) => {
                const from = selectedWorkflow.nodes.find((n) => n.id === edge.fromNodeId);
                const to = selectedWorkflow.nodes.find((n) => n.id === edge.toNodeId);
                if (!from || !to) return null;
                const pts = getSmartEdgePoints({ x: from.posX, y: from.posY, w: 220, h: 88 }, { x: to.posX, y: to.posY, w: 220, h: 88 });
                const active = selectedEdgeId === edge.id;
                const stroke = edge.isDefault ? "#94a3b8" : "#22c55e";
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${pts.x1} ${pts.y1} C ${pts.c1x} ${pts.c1y}, ${pts.c2x} ${pts.c2y}, ${pts.x2} ${pts.y2}`}
                      fill="none"
                      stroke={active ? "#dc2626" : stroke}
                      strokeWidth={active ? 3 : 2}
                    />
                  </g>
                );
              })}
              {pendingConnect && (() => {
                const sourceNode = getNodeById(pendingConnect.sourceId);
                if (!sourceNode) return null;
                const pts = getSmartEdgePoints({ x: sourceNode.posX, y: sourceNode.posY, w: 220, h: 88 }, { x: mouseCanvasPos.x, y: mouseCanvasPos.y, w: 0, h: 0 });
                return (
                  <path
                    d={`M ${pts.x1} ${pts.y1} C ${pts.c1x} ${pts.c1y}, ${pts.c2x} ${pts.c2y}, ${pts.x2} ${pts.y2}`}
                    fill="none"
                    stroke="#f59e0b"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                  />
                );
              })()}
            </svg>

            {selectedWorkflow?.edges.map((edge) => {
              const from = selectedWorkflow.nodes.find((n) => n.id === edge.fromNodeId);
              const to = selectedWorkflow.nodes.find((n) => n.id === edge.toNodeId);
              if (!from || !to) return null;
              const pts = getSmartEdgePoints({ x: from.posX, y: from.posY, w: 220, h: 88 }, { x: to.posX, y: to.posY, w: 220, h: 88 });
              const labelX = (pts.x1 + pts.x2) / 2;
              const labelY = (pts.y1 + pts.y2) / 2;
              return (
                <React.Fragment key={`edge-ui-${edge.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                    className={`absolute rounded px-1.5 py-0.5 text-[10px] ${
                      edge.isDefault ? "bg-zinc-200 text-zinc-700" : "bg-green-200 text-green-800"
                    }`}
                    style={{ left: labelX - 22, top: labelY - 12 }}
                  >
                    {edge.isDefault ? tr("workflowsUi.default", "default") : tr("workflowsUi.if", "if")} #{flowNumbering.edgeOrderIndex[edge.id] || 1}
                  </button>
                  <button
                    type="button"
                    className="absolute h-3 w-3 rounded-full border border-red-300 bg-white"
                    style={{ left: pts.x1 - 6, top: pts.y1 - 6 }}
                    title={tr("workflowsUi.reconnectFrom", "Reconnect from")}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPendingConnect({
                        sourceId: edge.fromNodeId,
                        reconnectEdgeId: edge.id,
                        reconnectEnd: "from",
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="absolute h-3 w-3 rounded-full border border-red-300 bg-white"
                    style={{ left: pts.x2 - 6, top: pts.y2 - 6 }}
                    title={tr("workflowsUi.reconnectTo", "Reconnect to")}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPendingConnect({
                        sourceId: edge.fromNodeId,
                        reconnectEdgeId: edge.id,
                        reconnectEnd: "to",
                      });
                    }}
                  />
                </React.Fragment>
              );
            })}

            {selectedWorkflow?.nodes.map((node) => {
              const active = selectedNodeId === node.id;
              const isEntry = selectedWorkflow.entryNodeId === node.id;
              const hasTool = Boolean(node.toolCode);
              const isConnectFrom = connectFromNodeId === node.id;
              const meta = flowNumbering.nodeMeta[node.id];
              const isUnreachable = meta?.flowOrderLabel === "unreachable";
              const runtime = nodeRuntimeStatus[node.id];
              const runtimeErr = nodeRuntimeError[node.id];
              const runtimeClass =
                runtime === "running"
                  ? "border-blue-500 bg-blue-50/70 animate-pulse"
                  : runtime === "succeeded"
                    ? "border-emerald-500 bg-emerald-50/70"
                    : runtime === "failed"
                      ? "border-rose-500 bg-rose-50/70"
                      : null;
              return (
                <div
                  key={node.id}
                  className={`absolute w-[210px] rounded-xl border bg-white p-3 shadow-sm ${
                    runtimeClass
                      ? runtimeClass
                      : isUnreachable
                        ? "border-amber-500 bg-amber-50/60"
                        : active
                          ? "border-red-600"
                          : "border-red-200"
                  }`}
                  style={{ left: node.posX, top: node.posY }}
                  title={runtimeErr || undefined}
                  onMouseUp={(e) => {
                    if (!pendingConnect) return;
                    e.stopPropagation();
                    completeConnect(node.id);
                  }}
                >
                  <div
                    className="cursor-move"
                    onPointerDown={(e) => {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setDragNodeId(node.id);
                      setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
                      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-[rgb(173,8,8)]">{node.name}</p>
                      <div className="flex items-center gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            isUnreachable ? "bg-amber-200 text-amber-800" : "bg-red-100 text-red-700"
                          }`}
                          title={
                            meta?.incomingFromLabels?.length
                              ? `${tr("workflowsUi.mergedFrom", "Merged from")}: ${meta.incomingFromLabels.join(", ")}`
                              : undefined
                          }
                        >
                          {meta?.flowOrderLabel || "-"}
                        </span>
                        {runtime && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              runtime === "running"
                                ? "bg-blue-100 text-blue-700"
                                : runtime === "succeeded"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                            }`}
                            title={runtimeErr || undefined}
                          >
                            {runtime === "running"
                              ? tr("workflowsUi.statusRunning", "running")
                              : runtime === "succeeded"
                                ? tr("workflowsUi.statusSucceeded", "ok")
                                : tr("workflowsUi.statusFailed", "failed")}
                          </span>
                        )}
                        {isEntry && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{tr("workflowsUi.entry", "entry")}</span>}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-600">
                      {hasTool
                        ? `${tr("workflowsUi.tool", "Tool")}: ${toolNameByCode[node.toolCode || ""] || node.toolCode}`
                        : tr("workflowsUi.llmDirect", "LLM Direct")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{node.promptTemplate || tr("workflowsUi.emptyPrompt", "(empty prompt)")}</p>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    {isEntry ? (
                      <span className="h-5 w-5" />
                    ) : (
                      <button
                        type="button"
                        title={tr("workflowsUi.targetHandle", "Target handle")}
                        onClick={() => {
                          if (pendingConnect) {
                            completeConnect(node.id);
                            return;
                          }
                          if (!selectedWorkflow) return;
                          if (!connectFromNodeId || connectFromNodeId === node.id) return;
                          const next = createEdge(selectedWorkflow, connectFromNodeId, node.id);
                          upsertWorkflow(next);
                          setConnectFromNodeId(null);
                          setDirty(true);
                        }}
                        className="h-5 w-5 rounded-full border border-red-300 bg-white text-[10px] text-red-700"
                      >
                        {tr("workflowsUi.in", "in")}
                      </button>
                    )}
                    <button
                      type="button"
                      title={tr("workflowsUi.sourceHandle", "Source handle")}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setConnectFromNodeId(node.id);
                        setPendingConnect({
                          sourceId: node.id,
                          reconnectEdgeId: null,
                          reconnectEnd: null,
                        });
                      }}
                      className={`h-5 w-5 rounded-full border text-[10px] ${
                        isConnectFrom
                          ? "border-amber-600 bg-amber-200 text-amber-800"
                          : "border-red-300 bg-white text-red-700"
                      }`}
                    >
                      {tr("workflowsUi.out", "out")}
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          </div>
        </div>

        <section className={`pointer-events-auto absolute bottom-[56px] left-2 right-2 top-2 z-20 w-auto flex-col space-y-3 overflow-y-auto rounded-2xl border border-white/60 bg-white/70 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-2xl scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200 sm:space-y-4 sm:p-4 md:bottom-4 md:left-auto md:right-4 md:top-4 md:max-h-none md:w-[360px] md:rounded-3xl md:p-5 ${rightPanelVisibility}`}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="min-w-0 text-sm font-semibold text-[rgb(173,8,8)]">
              {tr("workflowsUi.inspectorRun", "Inspector + Run")}
            </h2>
            {selectedWorkflow ? (
              <button
                type="button"
                disabled={loadingWorkflows || downloadingBackup}
                onClick={() => {
                  void onDownloadSelectedWorkflowBackup();
                }}
                className="shrink-0 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={tr("workflowsUi.backupHint", "Download JSON backup of the selected workflow")}
                aria-label={tr("workflowsUi.backup", "Backup")}
              >
                {downloadingBackup ? tr("workflowsUi.backingUp", "Downloading...") : tr("workflowsUi.backup", "Backup")}
              </button>
            ) : null}
          </div>

          {selectedWorkflow && selectedNode && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-2">
              <p className="text-xs font-semibold text-red-700">{tr("workflowsUi.nodeConfig", "Node Config")}</p>
              <label className="text-xs text-zinc-600">{tr("workflowsUi.nameLower", "name")}</label>
              <input
                value={nodeDraft.name}
                onChange={(e) => {
                  setNodeDraft((prev) => ({ ...prev, name: e.target.value }));
                }}
                className="w-full rounded border border-red-300 px-2 py-1 text-xs"
              />
              <label className="text-xs text-zinc-600">{tr("workflowsUi.toolCode", "toolCode")}</label>
              <select
                value={nodeDraft.toolCode}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  setNodeDraft((prev) => ({ ...prev, toolCode: value }));
                }}
                className="w-full rounded border border-red-300 px-2 py-1 text-xs"
              >
                <option value="">{tr("workflowsUi.toolCodePlaceholder", "(empty = LLM direct)")}</option>
                {Object.entries(toolOptionsByCategory).map(([category, tools]) => (
                  <optgroup key={category} label={category}>
                    {tools.map((tool) => (
                      <option key={tool.skillCode} value={tool.skillCode}>
                        {tool.skillName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <label className="text-xs text-zinc-600">{tr("workflowsUi.promptTemplate", "promptTemplate")}</label>
              <textarea
                value={nodeDraft.promptTemplate}
                onChange={(e) => {
                  setNodeDraft((prev) => ({ ...prev, promptTemplate: e.target.value }));
                }}
                style={{ resize: "vertical" }}
                className="min-h-24 w-full resize-y rounded border border-red-300 px-2 py-1 text-xs"
              />
              <label className="text-xs text-zinc-600">{tr("workflowsUi.commandCode", "commandCode")}</label>
              <textarea
                value={nodeDraft.commandCode}
                onChange={(e) => {
                  setNodeDraft((prev) => ({ ...prev, commandCode: e.target.value }));
                }}
                placeholder={commandCodePlaceholder}
                rows={10}
                style={{ resize: "vertical" }}
                className="min-h-44 w-full resize-y rounded border border-red-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void onSaveNodeConfig()}
                disabled={saving || !hasNodeDraftChanges}
                className="w-full rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {tr("workflowsUi.saveNodeConfig", "Lưu cấu hình")}
              </button>
              <div className="grid gap-2 grid-cols-1">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => void onRunNode()}
                    disabled={
                      runningNode ||
                      ((!nodeDraft.promptTemplate || !nodeDraft.promptTemplate.trim()) &&
                        (!nodeDraft.commandCode || !nodeDraft.commandCode.trim()))
                    }
                    className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    {runningNode ? tr("workflowsUi.running", "Running...") : tr("workflowsUi.runNodeTest", "Chạy thử Node")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteNode(selectedNode.id)}
                    className="rounded bg-red-700 px-2 py-1 text-xs text-white"
                  >
                    {tr("workflowsUi.deleteNode", "Delete Node")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedWorkflow && selectedEdge && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-2">
              <p className="text-xs font-semibold text-red-700">{tr("workflowsUi.edgeConfig", "Edge Config")}</p>
              <label className="text-xs text-zinc-600">{tr("workflowsUi.conditionExpr", "conditionExpr")}</label>
              <input
                value={edgeDraft.conditionExpr}
                onChange={(e) => setEdgeDraft((prev) => ({ ...prev, conditionExpr: e.target.value }))}
                className="w-full rounded border border-red-300 px-2 py-1 text-xs"
              />
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700">{tr("workflowsUi.maxRetries", "Số lần thử lại tối đa (nếu lỗi)")}</label>
                <div className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{edgeDraft.priority} lần</div>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={edgeDraft.priority}
                onChange={(e) => setEdgeDraft((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                className="w-full accent-[rgb(173,8,8)]"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={edgeDraft.isDefault}
                  onChange={(e) => setEdgeDraft((prev) => ({ ...prev, isDefault: e.target.checked }))}
                />
                {tr("workflowsUi.isDefault", "isDefault")}
              </label>
              <button
                type="button"
                onClick={() => void onSaveEdgeConfig()}
                disabled={saving || !hasEdgeDraftChanges}
                className="w-full rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {tr("workflowsUi.saveEdgeConfig", "Lưu thuộc tính Edge")}
              </button>
              <button
                type="button"
                onClick={() => onDeleteEdge(selectedEdge.id)}
                className="w-full rounded bg-red-700 px-2 py-1 text-xs text-white"
              >
                {tr("workflowsUi.deleteEdge", "Delete Edge")}
              </button>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-red-200 p-2">
            {!selectedNode && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[rgb(173,8,8)]">
                    {tr("workflowsUi.runWorkflowMock", "Run Workflow")}
                  </p>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {tr("workflowsUi.inputPayloadLabel", "Input payload")}
                  </span>
                </div>
                <textarea
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  placeholder={'{\n  "key": "value"\n}'}
                  className="min-h-96 w-full max-w-full resize-y rounded border border-red-300 px-2 py-1 text-xs font-mono"
                />
                <p className="text-[10px] leading-snug text-zinc-500">
                  {tr(
                    "workflowsUi.inputPayloadHint",
                    "JSON object used as default input when running this workflow.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void onSaveInputPayload()}
                  disabled={!selectedWorkflow || savingInputPayload || !hasInputPayloadChanges}
                  className="w-full rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingInputPayload
                    ? tr("workflowsUi.savingInputPayload", "Saving...")
                    : tr("workflowsUi.saveInputPayload", "Save payload")}
                </button>
              </>
            )}
            {!selectedNode && (
              <button
                type="button"
                onClick={onRunWorkflow}
                disabled={!selectedWorkflow || selectedWorkflow.nodes.length === 0 || runningWorkflow}
                className="w-full rounded bg-[rgb(173,8,8)] px-2 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {runningWorkflow ? tr("workflowsUi.running", "Running...") : tr("workflowsUi.runTest", "Run")}
              </button>
            )}
            {!selectedNode && activeRunId && activeRunStatus && (
              <div
                className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                  activeRunStatus === "running"
                    ? "bg-blue-50 text-blue-700"
                    : activeRunStatus === "succeeded"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                <span className="truncate">
                  {tr("workflowsUi.runId", "Run")}: <span className="font-mono">{activeRunId.slice(0, 8)}</span>
                </span>
                <span className="font-medium uppercase">{activeRunStatus}</span>
              </div>
            )}
            {!selectedNode && (
              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-red-700">
                    {tr("workflowsUi.workflowRunHistory", "Workflow run history")}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => selectedWorkflow && void loadWorkflowRunHistory(selectedWorkflow.id)}
                      disabled={!selectedWorkflow || loadingWorkflowRuns}
                      className="rounded bg-white px-2 py-0.5 text-[10px] text-zinc-700 border border-red-200 disabled:opacity-50"
                    >
                      {tr("workflowsUi.refresh", "Refresh")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteWorkflowHistory()}
                      disabled={!selectedWorkflow}
                      className="rounded bg-red-700 px-2 py-0.5 text-[10px] text-white disabled:opacity-50"
                    >
                      {tr("workflowsUi.clearAll", "Clear all")}
                    </button>
                  </div>
                </div>
                {loadingWorkflowRuns ? (
                  <p className="text-[11px] text-zinc-600">{tr("workflowsUi.loading", "Loading...")}</p>
                ) : workflowRuns.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">{tr("workflowsUi.noWorkflowRuns", "No workflow runs yet.")}</p>
                ) : (
                  <div className="max-h-24 space-y-1 overflow-auto">
                    {workflowRuns.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void loadRunDetail(item.id)}
                        className="w-full rounded border border-red-200 bg-white px-2 py-1 text-left text-[11px] hover:bg-red-50"
                      >
                        <p className="font-semibold">{item.id.slice(0, 8)} - {item.status}</p>
                        {item.createdAt && <p>{item.createdAt}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedNode && (
              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-red-700">
                    {tr("workflowsUi.nodeRunHistory", "Node run history")}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        selectedWorkflow &&
                        selectedNode &&
                        void loadNodeRunHistory(selectedWorkflow.id, selectedNode.id)
                      }
                      disabled={!selectedWorkflow || !selectedNode || !isUuidLike(selectedNode.id) || loadingNodeRuns}
                      className="rounded bg-white px-2 py-0.5 text-[10px] text-zinc-700 border border-red-200 disabled:opacity-50"
                    >
                      {tr("workflowsUi.refresh", "Refresh")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteNodeHistory()}
                      disabled={!selectedWorkflow || !selectedNode || !isUuidLike(selectedNode.id)}
                      className="rounded bg-red-700 px-2 py-0.5 text-[10px] text-white disabled:opacity-50"
                    >
                      {tr("workflowsUi.clearAll", "Clear all")}
                    </button>
                  </div>
                </div>
                {loadingNodeRuns ? (
                  <p className="text-[11px] text-zinc-600">{tr("workflowsUi.loading", "Loading...")}</p>
                ) : nodeRuns.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">{tr("workflowsUi.noNodeRuns", "No node runs yet.")}</p>
                ) : (
                  <div className="max-h-24 space-y-1 overflow-auto">
                    {nodeRuns.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectNodeRunHistory(item)}
                        className="w-full rounded border border-red-200 bg-white px-2 py-1 text-left text-[11px] hover:bg-red-50"
                      >
                        <p className="font-semibold">
                          {item.id.slice(0, 8)} - {item.status}
                        </p>
                        <p>
                          {tr("workflowsUi.attempt", "attempt")}: {item.attemptNo ?? "-"}
                          {item.workflowRunId ? ` | run ${item.workflowRunId.slice(0, 8)}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {run && (
              <div className="space-y-2">
                <div className="max-h-36 space-y-1 overflow-auto">
                  {run.logs.map((log) => (
                    <div key={log.id} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px]">
                      <p>{tr("workflowsUi.duration", "duration")}: {log.durationMs}ms</p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {tr("workflowsUi.promptSent", "Prompt sent")}: {log.resolvedPrompt || "-"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {tr("workflowsUi.resultReturned", "Result returned")}: {log.resolvedOutput || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <nav
          aria-label={tr("workflowsUi.mobileTabsAria", "Workflow sections")}
          className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 grid h-12 grid-cols-3 items-stretch gap-1 border-t border-red-200 bg-white/95 px-1 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden ${hideMobileTabBar ? "hidden" : ""}`}
        >
          {([
            {
              id: "list" as const,
              label: tr("workflowsUi.tabList", "Workflows"),
              disabled: false,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              id: "canvas" as const,
              label: tr("workflowsUi.tabCanvas", "Canvas"),
              disabled: !canCanvasTab,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="8" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="16" cy="14" r="1.6" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9.3 11 14.7 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              id: "inspector" as const,
              label: tr("workflowsUi.tabInspector", "Inspector"),
              disabled: !canInspectorTab,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ),
            },
          ]).map((tab) => {
            const active = mobileTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={tab.disabled}
                onClick={() => setMobileTab(tab.id)}
                aria-pressed={active}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium transition-colors ${
                  active
                    ? "bg-red-100 text-red-800"
                    : tab.disabled
                      ? "text-zinc-400"
                      : "text-zinc-600 hover:bg-red-50 hover:text-red-700"
                } disabled:cursor-not-allowed`}
              >
                {tab.icon}
                <span className="truncate leading-none">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

