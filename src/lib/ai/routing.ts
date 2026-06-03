import type { PipelineStage } from "@/lib/types";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "groq"
  | "gemini"
  | "google_ai"
  | "deepseek"
  | "openrouter"
  | "mistral";

export type ModelRoute = {
  provider: ProviderId;
  model: string;
  maxEstimatedUsd?: number;
  maxLatencyMs?: number;
};

export type StageRouteConfig = {
  primary: ModelRoute;
  fallback: ModelRoute;
  overrideProvider?: ProviderId;
  repairEscalation: ModelRoute;
};

export const MODEL_ROUTES: Record<PipelineStage, StageRouteConfig> = {
  intent: {
    primary: { provider: "openai", model: "gpt-4o-mini", maxEstimatedUsd: 0.03 },
    fallback: { provider: "groq", model: "llama-3.1-8b-instant", maxEstimatedUsd: 0.01, maxLatencyMs: 2000 },
    repairEscalation: { provider: "gemini", model: "gemini-1.5-flash" }
  },
  schema: {
    primary: { provider: "openai", model: "gpt-4o", maxEstimatedUsd: 0.15 },
    fallback: { provider: "groq", model: "llama-3.1-8b-instant", maxEstimatedUsd: 0.03 },
    repairEscalation: { provider: "gemini", model: "gemini-2.5-flash" }
  },
  appSpec: {
    primary: { provider: "gemini", model: "gemini-2.5-flash", maxEstimatedUsd: 0.12 },
    fallback: { provider: "groq", model: "llama-3.1-8b-instant", maxEstimatedUsd: 0.05 },
    repairEscalation: { provider: "openai", model: "gpt-4o" }
  }
};

export const COST_TABLE: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "claude-3-5-sonnet-latest": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-5-haiku-latest": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "llama-3.1-8b-instant": { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  "mistral-large-latest": { inputPerMillion: 2, outputPerMillion: 6 },
  "openrouter/auto": { inputPerMillion: 1, outputPerMillion: 3 },
  "anthropic/claude-3.5-sonnet": { inputPerMillion: 3, outputPerMillion: 15 }
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[model] ?? COST_TABLE["openrouter/auto"];
  return Number(
    (((inputTokens / 1_000_000) * rates.inputPerMillion) + ((outputTokens / 1_000_000) * rates.outputPerMillion)).toFixed(6)
  );
}
