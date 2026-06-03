import type { ProviderId } from "@/lib/ai/routing";

export type ProviderMode = "live" | "stub";

export type ProviderDescriptor = {
  id: ProviderId;
  displayName: string;
  envKey: string;
  mode: ProviderMode;
  notes: string;
};

export const AI_PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    envKey: "OPENAI_API_KEY",
    mode: "live",
    notes: "Live adapter for GPT-4o and GPT-4o-mini."
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    mode: "stub",
    notes: "Configurable option; not wired live in the current three-provider setup."
  },
  groq: {
    id: "groq",
    displayName: "Groq",
    envKey: "GROQ_API_KEY",
    mode: "live",
    notes: "Live adapter for low-latency intent extraction."
  },
  gemini: {
    id: "gemini",
    displayName: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    mode: "live",
    notes: "Live adapter for Gemini Pro/Flash structured generation."
  },
  google_ai: {
    id: "google_ai",
    displayName: "Google AI",
    envKey: "GOOGLE_AI_API_KEY",
    mode: "live",
    notes: "Live Gemini-compatible adapter through the Google AI SDK."
  },
  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    mode: "live",
    notes: "Live OpenAI-compatible adapter for DeepSeek chat models."
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    mode: "live",
    notes: "Live OpenAI-compatible universal fallback adapter."
  },
  mistral: {
    id: "mistral",
    displayName: "Mistral",
    envKey: "MISTRAL_API_KEY",
    mode: "live",
    notes: "Live OpenAI-compatible adapter for Mistral models."
  }
};

export function getProviderApiKey(provider: ProviderId): string | undefined {
  const envKey = AI_PROVIDERS[provider].envKey;
  const value = process.env[envKey];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function isProviderReady(provider: ProviderId): boolean {
  const descriptor = AI_PROVIDERS[provider];
  return descriptor.mode === "live" && Boolean(getProviderApiKey(provider));
}

export function isRouteReady(provider: ProviderId): boolean {
  return isProviderReady(provider);
}
