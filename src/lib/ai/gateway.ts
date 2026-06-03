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
  prompt: string;
};

export async function generateJsonWithGateway(options: GenerateJsonOptions): Promise<AiGatewayResult | null> {
  const route = chooseLiveRoute(options.primary, options.fallback);

  if (!route) {
    return null;
  }

  const errors: string[] = [];

  try {
    const text = await callProvider(route, options.prompt);
    const output = extractJsonObject(text);
    return {
      output,
      provider: route.provider,
      model: route.model,
      inputTokens: estimateTokens(options.prompt),
      outputTokens: estimateTokens(text),
      usedFallback: route.provider !== options.primary.provider || route.model !== options.primary.model
    };
  } catch (error) {
    errors.push(`${route.provider}/${route.model}: ${error instanceof Error ? error.message : "unknown error"}`);
    const fallbackRoute = isProviderReady(options.fallback.provider) ? options.fallback : undefined;
    if (!fallbackRoute || (fallbackRoute.provider === route.provider && fallbackRoute.model === route.model)) {
      throw new Error(`AI gateway failed: ${errors.join(" | ")}`);
    }

    try {
      const text = await callProvider(fallbackRoute, options.prompt);
      return {
        output: extractJsonObject(text),
        provider: fallbackRoute.provider,
        model: fallbackRoute.model,
        inputTokens: estimateTokens(options.prompt),
        outputTokens: estimateTokens(text),
        usedFallback: true
      };
    } catch (fallbackError) {
      errors.push(`${fallbackRoute.provider}/${fallbackRoute.model}: ${fallbackError instanceof Error ? fallbackError.message : "unknown error"}`);
      throw new Error(`AI gateway failed: ${errors.join(" | ")}`);
    }
  }
}

function chooseLiveRoute(primary: ModelRoute, fallback: ModelRoute): ModelRoute | null {
  if (isProviderReady(primary.provider)) {
    return primary;
  }

  if (isProviderReady(fallback.provider)) {
    return fallback;
  }

  return null;
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
    default:
      throw new Error(`${route.provider} is not available in the three-provider live setup`);
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
    throw new Error(`Groq request failed with ${response.status}`);
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

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
