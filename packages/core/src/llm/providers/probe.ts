import { fetchWithProxy } from "../../utils/proxy-fetch.js";

/**
 * 通用 OpenAI 兼容 /models 探针。
 * 任何失败（网络错、超时、非 JSON、非 2xx）一律返回空数组，不抛异常。
 */

export interface ProbedModel {
  readonly id: string;
  readonly name: string;
  readonly contextWindow: number;
  readonly maxOutput?: number;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value > 0
    ? value
    : undefined;
}

function firstPositiveInteger(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    const parsed = positiveInteger(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

export function normalizeProbedModel(value: unknown): ProbedModel | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return undefined;

  const contextWindow = firstPositiveInteger(
    raw.context_length,
    raw.context_window,
    raw.context_window_tokens,
  ) ?? 0;
  const candidateMax = firstPositiveInteger(
    raw.max_completion_tokens,
    raw.max_output_tokens,
  );
  const maxOutput = candidateMax !== undefined
    && (contextWindow === 0 || candidateMax <= contextWindow)
    ? candidateMax
    : undefined;

  return {
    id: raw.id,
    name: raw.id,
    contextWindow,
    ...(maxOutput !== undefined ? { maxOutput } : {}),
  };
}

export function normalizeProbedModels(value: unknown): ProbedModel[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const model = normalizeProbedModel(entry);
    return model ? [model] : [];
  });
}

export async function probeModelsFromUpstream(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 10_000,
): Promise<ReadonlyArray<ProbedModel>> {
  if (!baseUrl) return [];
  try {
    const modelsUrl = baseUrl.replace(/\/$/, "") + "/models";
    const res = await fetchWithProxy(modelsUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    return normalizeProbedModels(await res.json());
  } catch {
    return [];
  }
}
