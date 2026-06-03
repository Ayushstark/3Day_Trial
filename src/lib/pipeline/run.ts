import { generateJsonWithGateway } from "@/lib/ai/gateway";
import { isProviderReady } from "@/lib/ai/providers";
import { buildAppSpecPrompt, buildIntentPrompt, buildSchemaPrompt } from "@/lib/ai/prompts";
import { estimateCost, MODEL_ROUTES, type StageRouteConfig } from "@/lib/ai/routing";
import { getJob, pushEvent, setStage, updateJob } from "@/lib/jobs/store";
import { generateAppSpecDeterministic } from "@/lib/pipeline/appSpec";
import { extractIntentDeterministic } from "@/lib/pipeline/intent";
import { generateDataSchemaDeterministic } from "@/lib/pipeline/schema";
import { repairAppSpec } from "@/lib/repair/appSpecRepair";
import { repairDataSchema } from "@/lib/repair/schemaRepair";
import { appIntentSchema, appSpecSchema, dataSchemaSchema } from "@/lib/schemas";
import type { AppIntent, AppSpec, DataSchema, ValidationError } from "@/lib/types";
import { validateAppSpec, validateDataSchema, validateIntent } from "@/lib/validation/validate";

export async function runIntentStage(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    return;
  }

  await updateJob(jobId, (current) => pushEvent(setStage(current, "intent", "running"), { type: "stage_start", stage: "intent" }));

  const start = performance.now();
  const route = MODEL_ROUTES.intent.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.intent.primary,
      fallback: MODEL_ROUTES.intent.fallback,
      routes: MODEL_ROUTES.intent.routes,
      prompt: buildIntentPrompt(job.prompt)
    });
    const intent = resolveIntentOutput(aiResult?.output, MODEL_ROUTES.intent, job.prompt);
    const validationErrors = validateIntent(intent);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiResult ? aiResult.inputTokens : estimateTokens(job.prompt);
    const outputTokens = estimateTokens(JSON.stringify(intent));
    const provider = aiResult ? aiResult.provider : route.provider;
    const model = aiResult ? aiResult.model : route.model;

    await updateJob(jobId, (current) => {
      const next = {
        ...current,
        intent,
        validationErrors: [...current.validationErrors, ...validationErrors],
        latencyByStage: { ...current.latencyByStage, intent: latencyMs },
        costBreakdown: [
          ...current.costBreakdown,
          {
            stage: "intent" as const,
            provider,
            model,
            inputTokens,
            outputTokens,
            estimatedUsd: estimateCost(model, inputTokens, outputTokens)
          }
        ]
      };

      if (validationErrors.length > 0) {
        return pushEvent(setStage(next, "intent", "failed"), {
          type: "stage_failed",
          stage: "intent",
          latencyMs,
          error: {
            message: "Intent extraction failed validation",
            validationErrors
          }
        });
      }

      return pushEvent(setStage(next, "intent", "complete"), {
        type: "stage_complete",
        stage: "intent",
        latencyMs,
        output: intent
      });
    });

    if (validationErrors.length === 0) {
      await runSchemaStage(jobId, intent);
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    await updateJob(jobId, (current) =>
      pushEvent(setStage(current, "intent", "failed"), {
        type: "stage_failed",
        stage: "intent",
        latencyMs,
        error: {
          message: error instanceof Error ? error.message : "Unknown intent extraction error"
        }
      })
    );
  }
}

export async function runSchemaStage(jobId: string, intent: AppIntent): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    return;
  }

  await updateJob(jobId, (current) => pushEvent(setStage(current, "schema", "running"), { type: "stage_start", stage: "schema" }));

  const start = performance.now();
  const route = MODEL_ROUTES.schema.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.schema.primary,
      fallback: MODEL_ROUTES.schema.fallback,
      routes: MODEL_ROUTES.schema.routes,
      prompt: buildSchemaPrompt(intent)
    });
    const generatedSchema = resolveSchemaOutput(aiResult?.output, MODEL_ROUTES.schema, intent);
    const { schema, validationErrors, repairLog } = validateAndRepairSchema(generatedSchema);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiResult ? aiResult.inputTokens : estimateTokens(JSON.stringify(intent));
    const outputTokens = estimateTokens(JSON.stringify(schema));
    const provider = aiResult ? aiResult.provider : route.provider;
    const model = aiResult ? aiResult.model : route.model;

    await updateJob(jobId, (current) => {
      const next = {
        ...current,
        dataSchema: schema,
        validationErrors: [...current.validationErrors, ...validationErrors],
        repairLog: [...current.repairLog, ...repairLog],
        latencyByStage: { ...current.latencyByStage, schema: latencyMs },
        costBreakdown: [
          ...current.costBreakdown,
          {
            stage: "schema" as const,
            provider,
            model,
            inputTokens,
            outputTokens,
            estimatedUsd: estimateCost(model, inputTokens, outputTokens)
          }
        ]
      };

      if (validationErrors.length > 0) {
        return pushEvent(setStage(next, "schema", "failed"), {
          type: "stage_failed",
          stage: "schema",
          latencyMs,
          error: {
            message: "Schema generation failed validation after repair",
            validationErrors,
            repairLog
          }
        });
      }

      return pushEvent(setStage(next, "schema", "complete"), {
        type: "stage_complete",
        stage: "schema",
        latencyMs,
        output: schema
      });
    });

    if (validationErrors.length === 0) {
      await runAppSpecStage(jobId, intent, schema);
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    await updateJob(jobId, (current) =>
      pushEvent(setStage(current, "schema", "failed"), {
        type: "stage_failed",
        stage: "schema",
        latencyMs,
        error: {
          message: error instanceof Error ? error.message : "Unknown schema generation error"
        }
      })
    );
  }
}

export async function runAppSpecStage(jobId: string, intent: AppIntent, dataSchema: DataSchema): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    return;
  }

  await updateJob(jobId, (current) => pushEvent(setStage(current, "appSpec", "running"), { type: "stage_start", stage: "appSpec" }));

  const start = performance.now();
  const route = MODEL_ROUTES.appSpec.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.appSpec.primary,
      fallback: MODEL_ROUTES.appSpec.fallback,
      routes: MODEL_ROUTES.appSpec.routes,
      prompt: buildAppSpecPrompt(intent, dataSchema)
    });
    const generatedAppSpec = resolveAppSpecOutput(aiResult?.output, MODEL_ROUTES.appSpec, intent, dataSchema);
    const { appSpec, validationErrors, repairLog } = validateAndRepairAppSpec(generatedAppSpec, dataSchema);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiResult ? aiResult.inputTokens : estimateTokens(JSON.stringify(dataSchema));
    const outputTokens = estimateTokens(JSON.stringify(appSpec));
    const provider = aiResult ? aiResult.provider : route.provider;
    const model = aiResult ? aiResult.model : route.model;

    await updateJob(jobId, (current) => {
      const next = {
        ...current,
        appSpec,
        validationErrors: [...current.validationErrors, ...validationErrors],
        repairLog: [...current.repairLog, ...repairLog],
        latencyByStage: { ...current.latencyByStage, appSpec: latencyMs },
        costBreakdown: [
          ...current.costBreakdown,
          {
            stage: "appSpec" as const,
            provider,
            model,
            inputTokens,
            outputTokens,
            estimatedUsd: estimateCost(model, inputTokens, outputTokens)
          }
        ]
      };

      if (validationErrors.length > 0) {
        return pushEvent(setStage(next, "appSpec", "failed"), {
          type: "stage_failed",
          stage: "appSpec",
          latencyMs,
          error: {
            message: "AppSpec generation failed validation after repair",
            validationErrors,
            repairLog
          }
        });
      }

      const completedStage = pushEvent(setStage(next, "appSpec", "complete"), {
        type: "stage_complete",
        stage: "appSpec",
        latencyMs,
        output: appSpec
      });

      return pushEvent(completedStage, {
        type: "generation_complete",
        stage: "generation",
        latencyMs,
        output: appSpec
      });
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    await updateJob(jobId, (current) =>
      pushEvent(setStage(current, "appSpec", "failed"), {
        type: "stage_failed",
        stage: "appSpec",
        latencyMs,
        error: {
          message: error instanceof Error ? error.message : "Unknown AppSpec generation error"
        }
      })
    );
  }
}

function validateAndRepairSchema(schema: DataSchema): {
  schema: DataSchema;
  validationErrors: ValidationError[];
  repairLog: ReturnType<typeof repairDataSchema>["repairLog"];
} {
  const firstErrors = validateDataSchema(schema);
  if (firstErrors.length === 0) {
    return { schema, validationErrors: [], repairLog: [] };
  }

  const repaired = repairDataSchema(schema, firstErrors);
  const remainingErrors = validateDataSchema(repaired.schema);

  return {
    schema: repaired.schema,
    validationErrors: remainingErrors,
    repairLog: repaired.repairLog
  };
}

function resolveIntentOutput(output: unknown, route: StageRouteConfig, prompt: string): AppIntent {
  if (!hasReadyAiRoute(route)) {
    return extractIntentDeterministic(prompt);
  }

  const candidate = unwrapStageOutput(output, ["appIntent", "intent", "output"]);
  const result = appIntentSchema.safeParse(candidate);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.code}:${issue.path.map(String).join(".") || "root"}`).join(", ");
    throw new Error(`AI intent output failed validation: ${details}`);
  }

  return sanitizeIntentIntegrations(result.data, prompt);
}

const explicitIntegrationSignals: Record<AppIntent["integrations_requested"][number], string[]> = {
  slack: ["slack"],
  salesforce: ["salesforce"],
  hubspot: ["hubspot"],
  whatsapp: ["whatsapp", "whats app"],
  gmail: ["gmail", "google workspace"],
  notion: ["notion"],
  airtable: ["airtable"],
  stripe: ["stripe"],
  twilio_sms: ["twilio sms", "sms", "text message"],
  webhook: ["webhook", "web hook"],
  google_sheets: ["google sheets", "spreadsheet", "sheet export"],
  jira: ["jira"],
  github: ["github", "git hub"],
  zapier: ["zapier"]
};

function sanitizeIntentIntegrations(intent: AppIntent, prompt: string): AppIntent {
  const normalizedPrompt = prompt.toLowerCase();
  const integrations = intent.integrations_requested.filter((integrationId) =>
    explicitIntegrationSignals[integrationId].some((signal) => normalizedPrompt.includes(signal))
  );

  return { ...intent, integrations_requested: integrations };
}

function resolveSchemaOutput(output: unknown, route: StageRouteConfig, intent: AppIntent): DataSchema {
  if (!hasReadyAiRoute(route)) {
    return generateDataSchemaDeterministic(intent);
  }

  const candidate = unwrapStageOutput(output, ["dataSchema", "schema", "output"]);
  const result = dataSchemaSchema.safeParse(candidate);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.code}:${issue.path.map(String).join(".") || "root"}`).join(", ");
    throw new Error(`AI schema output failed validation: ${details}`);
  }

  return result.data;
}

function resolveAppSpecOutput(output: unknown, route: StageRouteConfig, intent: AppIntent, dataSchema: DataSchema): AppSpec {
  if (!hasReadyAiRoute(route)) {
    return generateAppSpecDeterministic(intent, dataSchema);
  }

  const candidate = unwrapStageOutput(output, ["appSpec", "spec", "output"]);
  const shapeResult = appSpecSchema.safeParse(candidate);
  if (!shapeResult.success) {
    const details = shapeResult.error.issues.map((issue) => `${issue.code}:${issue.path.map(String).join(".") || "root"}`).join(", ");
    throw new Error(`AI AppSpec output failed validation: ${details}`);
  }

  return shapeResult.data;
}

function hasReadyAiRoute(route: StageRouteConfig): boolean {
  return route.routes.some((candidate) => isProviderReady(candidate.provider));
}

function unwrapStageOutput(output: unknown, keys: string[]): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const record = output as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] && typeof record[key] === "object") {
      return record[key];
    }
  }

  return output;
}

function validateAndRepairAppSpec(appSpec: AppSpec, dataSchema: DataSchema): {
  appSpec: AppSpec;
  validationErrors: ValidationError[];
  repairLog: ReturnType<typeof repairAppSpec>["repairLog"];
} {
  const firstErrors = validateAppSpec(appSpec, dataSchema);
  if (firstErrors.length === 0) {
    return { appSpec, validationErrors: [], repairLog: [] };
  }

  const repaired = repairAppSpec(appSpec, dataSchema, firstErrors);
  const remainingErrors = validateAppSpec(repaired.appSpec, dataSchema);

  return {
    appSpec: repaired.appSpec,
    validationErrors: remainingErrors,
    repairLog: repaired.repairLog
  };
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
