import axiosClient from "@/utils/axiosClient";
import type { ApiResponse } from "@/services/AuthService";

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type JoinMode = "none" | "wait_any" | "wait_all";

export type WorkflowNode = {
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
  joinMode?: JoinMode;
  joinExpected?: number | null;
  posX: number;
  posY: number;
};

export type WorkflowEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  conditionExpr: string | null;
  priority: number;
  isDefault: boolean;
};

export type WorkflowSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  entryNodeId: string | null;
  version: number;
  inputPayload?: Record<string, unknown> | null;
};

export type WorkflowGraph = {
  workflow: WorkflowSummary;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type SaveGraphNodePayload = {
  id?: string;
  clientKey?: string;
  name: string;
  toolCode?: string | null;
  commandCode?: string | null;
  promptTemplate?: string | null;
  modelOverride?: string | null;
  maxAttempts?: number;
  timeoutMs?: number;
  outputSchema?: string | null;
  joinMode?: JoinMode;
  joinExpected?: number | null;
  posX: number;
  posY: number;
};

export type SaveGraphEdgePayload = {
  id?: string;
  fromNodeId?: string;
  toNodeId?: string;
  fromClientKey?: string;
  toClientKey?: string;
  conditionExpr?: string | null;
  priority?: number;
  isDefault?: boolean;
};

export type SaveGraphPayload = {
  expectedVersion: number;
  entryNodeId?: string | null;
  entryNodeClientKey?: string;
  nodes: SaveGraphNodePayload[];
  edges: SaveGraphEdgePayload[];
};

export type SaveGraphResult = {
  workflow: WorkflowSummary;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeKeyMap?: Record<string, string>;
};

export type WorkflowRunDetail = {
  run: Record<string, unknown>;
  nodeRuns: Array<Record<string, unknown>>;
};

export type ToolOptionItem = {
  skillCode: string;
  skillName: string;
  displayName?: string;
  description?: string | null;
  sampleCode?: string | null;
  minModelTier?: string | null;
  ownerOnly?: boolean;
};

export type ToolOptionGroup = {
  category: string;
  tools: ToolOptionItem[];
};

export const listWorkflows = async () => {
  const response = await axiosClient.get<ApiResponse<unknown>>("/agent/workflows");
  return response.data;
};

export const getWorkflowToolOptions = async () => {
  const response = await axiosClient.get<ApiResponse<unknown>>("/agent/workflows/tool-options");
  return response.data;
};

export const createWorkflow = async (payload: {
  code: string;
  name: string;
  description?: string;
}) => {
  const response = await axiosClient.post<ApiResponse<unknown>>("/agent/workflows", payload);
  return response.data;
};

export const updateWorkflowMeta = async (
  workflowId: string,
  payload: {
    code?: string;
    name?: string;
    description?: string | null;
    inputPayload?: Record<string, unknown> | null;
  },
) => {
  const response = await axiosClient.patch<ApiResponse<unknown>>(`/agent/workflows/${workflowId}`, payload);
  return response.data;
};

export type DeleteWorkflowResult = {
  deleted: boolean;
  id: string;
};

export const deleteWorkflow = async (workflowId: string) => {
  const response = await axiosClient.delete<ApiResponse<DeleteWorkflowResult>>(
    `/agent/workflows/${workflowId}`,
  );
  return response.data;
};

export const getWorkflowGraph = async (workflowId: string) => {
  const response = await axiosClient.get<ApiResponse<unknown>>(`/agent/workflows/${workflowId}/graph`);
  return response.data;
};

export const saveWorkflowGraph = async (workflowId: string, payload: SaveGraphPayload) => {
  const response = await axiosClient.put<ApiResponse<unknown>>(`/agent/workflows/${workflowId}/graph`, payload);
  return response.data;
};

export const updateWorkflowStatus = async (workflowId: string, status: WorkflowStatus) => {
  const response = await axiosClient.patch<ApiResponse<unknown>>(`/agent/workflows/${workflowId}/status`, {
    status,
  });
  return response.data;
};

export const updateEntryNode = async (workflowId: string, entryNodeId: string) => {
  const response = await axiosClient.patch<ApiResponse<unknown>>(
    `/agent/workflows/${workflowId}/entry-node`,
    { entryNodeId },
  );
  return response.data;
};

export const runWorkflow = async (
  workflowId: string,
  payload: { threadId?: string; input?: Record<string, unknown> },
) => {
  const response = await axiosClient.post<ApiResponse<unknown>>(`/agent/workflows/${workflowId}/run`, payload);
  return response.data;
};

export const runWorkflowNode = async (
  workflowId: string,
  nodeId: string,
  payload: { threadId?: string; input?: Record<string, unknown> },
) => {
  const response = await axiosClient.post<ApiResponse<unknown>>(
    `/agent/workflows/${workflowId}/nodes/${nodeId}/run`,
    payload,
  );
  return response.data;
};

export const getWorkflowRunDetail = async (runId: string) => {
  const response = await axiosClient.get<ApiResponse<unknown>>(`/agent/workflows/runs/${runId}`);
  return response.data;
};

export const listWorkflowRuns = async (
  workflowId: string,
  query?: { status?: string; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (typeof query?.limit === "number") params.set("limit", String(query.limit));
  if (typeof query?.offset === "number") params.set("offset", String(query.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await axiosClient.get<ApiResponse<unknown>>(
    `/agent/workflows/${workflowId}/runs${suffix}`,
  );
  return response.data;
};

export const listNodeRuns = async (
  workflowId: string,
  nodeId: string,
  query?: { runId?: string; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams();
  if (query?.runId) params.set("runId", query.runId);
  if (typeof query?.limit === "number") params.set("limit", String(query.limit));
  if (typeof query?.offset === "number") params.set("offset", String(query.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await axiosClient.get<ApiResponse<unknown>>(
    `/agent/workflows/${workflowId}/nodes/${nodeId}/runs${suffix}`,
  );
  return response.data;
};

export const deleteWorkflowRuns = async (workflowId: string) => {
  const response = await axiosClient.delete<ApiResponse<unknown>>(`/agent/workflows/${workflowId}/runs`);
  return response.data;
};

export const deleteNodeRuns = async (workflowId: string, nodeId: string) => {
  const response = await axiosClient.delete<ApiResponse<unknown>>(
    `/agent/workflows/${workflowId}/nodes/${nodeId}/runs`,
  );
  return response.data;
};
