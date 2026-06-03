import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractJsonObject } from "@/lib/ai/json";
import { getProviderApiKey, AI_PROVIDERS, isProviderReady } from "@/lib/ai/providers";
import type { ModelRoute, ProviderId } from "@/lib/ai/routing";

export type AiGatewayResult = {
  output: unknown;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usedFallback: boolean;
};

type GenerateJsonOptions = {
  primary: ModelRoute;
  fallback: ModelRoute;
  routes?: ModelRoute[];
  prompt: string;
};

export async function generateJsonWithGateway(options: GenerateJsonOptions): Promise<AiGatewayResult | null> {
  const routes = chooseLiveRoutes(options.routes ?? [options.primary, options.fallback]);
  if (routes.length === 0) {
    return null;
  }

  const errors: string[] = [];

  for (const route of routes) {
    try {
      const text = await callProviderWithJsonRepair(route, options.prompt);
      return {
        output: extractJsonObject(text),
        provider: route.provider,
        model: route.model,
        inputTokens: estimateTokens(options.prompt),
        outputTokens: estimateTokens(text),
        usedFallback: route.provider !== options.primary.provider || route.model !== options.primary.model
      };
    } catch (error) {
      errors.push(`${route.provider}/${route.model}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`AI gateway failed: ${errors.join(" | ")}`);
}

async function callProviderWithJsonRepair(route: ModelRoute, prompt: string): Promise<string> {
  const text = await callProvider(route, prompt);

  try {
    extractJsonObject(text);
    return text;
  } catch (error) {
    const repairPrompt = [
      "The previous response was not valid parseable JSON for the requested schema.",
      "Return only the corrected JSON object. Do not include markdown, comments, or prose.",
      "Original task:",
      prompt,
      "Invalid response:",
      text.slice(0, 6000)
    ].join("\n");
    const repairedText = await callProvider(route, repairPrompt);
    extractJsonObject(repairedText);
    return repairedText;
  }
}

function chooseLiveRoutes(routes: ModelRoute[]): ModelRoute[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.provider}:${route.model}`;
    if (seen.has(key) || !isProviderReady(route.provider)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function callProvider(route: ModelRoute, prompt: string): Promise<string> {
  if (AI_PROVIDERS[route.provider].mode !== "live") {
    throw new Error(`${route.provider} is registered but not implemented as a live adapter`);
  }

  switch (route.provider) {
    case "openai":
      return callOpenAi(route.model, prompt);
    case "groq":
      return callGroq(route.model, prompt);
    case "gemini":
      return callGemini(route.model, prompt);
    case "google_ai":
      return callGoogleAi(route.model, prompt);
    case "deepseek":
      return callOpenAiCompatible({
        provider: "deepseek",
        model: route.model,
        prompt,
        baseUrl: "https://api.deepseek.com/v1/chat/completions"
      });
    case "openrouter":
      return callOpenAiCompatible({
        provider: "openrouter",
        model: route.model,
        prompt,
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        extraHeaders: {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "OneAtlas AppSpec Pipeline"
        }
      });
    case "mistral":
      return callOpenAiCompatible({
        provider: "mistral",
        model: route.model,
        prompt,
        baseUrl: "https://api.mistral.ai/v1/chat/completions"
      });
    default:
      throw new Error(`${route.provider} does not have a live adapter enabled`);
  }
}

async function callOpenAi(model: string, prompt: string): Promise<string> {
  const apiKey = getProviderApiKey("openai");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You generate strict JSON only. No markdown, no prose." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });

  return response.choices[0]?.message.content ?? "{}";
}

async function callGroq(model: string, prompt: string): Promise<string> {
  const apiKey = getProviderApiKey("groq");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You generate strict JSON only. No markdown, no prose." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`Groq request failed with ${response.status}: ${await readErrorBody(response)}`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

async function callGemini(model: string, prompt: string): Promise<string> {
  const apiKey = getProviderApiKey("gemini");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAi = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAi.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

async function callGoogleAi(model: string, prompt: string): Promise<string> {
  const apiKey = getProviderApiKey("google_ai");
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is missing");
  }

  const genAi = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAi.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

async function callOpenAiCompatible(options: {
  provider: ProviderId;
  model: string;
  prompt: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const apiKey = getProviderApiKey(options.provider);
  if (!apiKey) {
    throw new Error(`${AI_PROVIDERS[options.provider].envKey} is missing`);
  }

  const response = await fetch(options.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.extraHeaders
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: "You generate strict JSON only. No markdown, no prose." },
        { role: "user", content: options.prompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`${options.provider} request failed with ${response.status}: ${await readErrorBody(response)}`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, 500);
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
