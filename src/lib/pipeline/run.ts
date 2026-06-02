import { generateJsonWithGateway } from "@/lib/ai/gateway";
import { buildAppSpecPrompt, buildIntentPrompt, buildSchemaPrompt } from "@/lib/ai/prompts";
import { estimateCost, MODEL_ROUTES } from "@/lib/ai/routing";
import { getJob, pushEvent, setStage, updateJob } from "@/lib/jobs/store";
import { generateAppSpecDeterministic } from "@/lib/pipeline/appSpec";
import { extractIntentDeterministic } from "@/lib/pipeline/intent";
import { generateDataSchemaDeterministic } from "@/lib/pipeline/schema";
import { repairAppSpec } from "@/lib/repair/appSpecRepair";
import { repairDataSchema } from "@/lib/repair/schemaRepair";
import type { AppIntent, AppSpec, DataSchema, ValidationError } from "@/lib/types";
import { validateAppSpec, validateDataSchema, validateIntent } from "@/lib/validation/validate";

export async function runIntentStage(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    return;
  }

  updateJob(jobId, (current) => pushEvent(setStage(current, "intent", "running"), { type: "stage_start", stage: "intent" }));

  const start = performance.now();
  const route = MODEL_ROUTES.intent.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.intent.primary,
      fallback: MODEL_ROUTES.intent.fallback,
      prompt: buildIntentPrompt(job.prompt)
    });
    const aiIntent = aiResult ? validateAiIntent(aiResult.output) : null;
    const intent = aiIntent ?? extractIntentDeterministic(job.prompt);
    const validationErrors = validateIntent(intent);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiIntent && aiResult ? aiResult.inputTokens : estimateTokens(job.prompt);
    const outputTokens = estimateTokens(JSON.stringify(intent));
    const provider = aiIntent && aiResult ? aiResult.provider : route.provider;
    const model = aiIntent && aiResult ? aiResult.model : route.model;

    updateJob(jobId, (current) => {
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
      void runSchemaStage(jobId, intent);
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    updateJob(jobId, (current) =>
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
  const job = getJob(jobId);
  if (!job) {
    return;
  }

  updateJob(jobId, (current) => pushEvent(setStage(current, "schema", "running"), { type: "stage_start", stage: "schema" }));

  const start = performance.now();
  const route = MODEL_ROUTES.schema.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.schema.primary,
      fallback: MODEL_ROUTES.schema.fallback,
      prompt: buildSchemaPrompt(intent)
    });
    const aiSchema = aiResult ? validateAiSchema(aiResult.output) : null;
    const generatedSchema = aiSchema ?? generateDataSchemaDeterministic(intent);
    const { schema, validationErrors, repairLog } = validateAndRepairSchema(generatedSchema);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiSchema && aiResult ? aiResult.inputTokens : estimateTokens(JSON.stringify(intent));
    const outputTokens = estimateTokens(JSON.stringify(schema));
    const provider = aiSchema && aiResult ? aiResult.provider : route.provider;
    const model = aiSchema && aiResult ? aiResult.model : route.model;

    updateJob(jobId, (current) => {
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
      void runAppSpecStage(jobId, intent, schema);
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    updateJob(jobId, (current) =>
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
  const job = getJob(jobId);
  if (!job) {
    return;
  }

  updateJob(jobId, (current) => pushEvent(setStage(current, "appSpec", "running"), { type: "stage_start", stage: "appSpec" }));

  const start = performance.now();
  const route = MODEL_ROUTES.appSpec.primary;

  try {
    const aiResult = await generateJsonWithGateway({
      primary: MODEL_ROUTES.appSpec.primary,
      fallback: MODEL_ROUTES.appSpec.fallback,
      prompt: buildAppSpecPrompt(intent, dataSchema)
    });
    const aiAppSpec = aiResult ? validateAiAppSpec(aiResult.output, dataSchema) : null;
    const generatedAppSpec = aiAppSpec ?? generateAppSpecDeterministic(intent, dataSchema);
    const { appSpec, validationErrors, repairLog } = validateAndRepairAppSpec(generatedAppSpec, dataSchema);
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = aiAppSpec && aiResult ? aiResult.inputTokens : estimateTokens(JSON.stringify(dataSchema));
    const outputTokens = estimateTokens(JSON.stringify(appSpec));
    const provider = aiAppSpec && aiResult ? aiResult.provider : route.provider;
    const model = aiAppSpec && aiResult ? aiResult.model : route.model;

    updateJob(jobId, (current) => {
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
    updateJob(jobId, (current) =>
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

function validateAiIntent(output: unknown): AppIntent | null {
  const errors = validateIntent(output);
  return errors.length === 0 ? (output as AppIntent) : null;
}

function validateAiSchema(output: unknown): DataSchema | null {
  const errors = validateDataSchema(output);
  return errors.length === 0 ? (output as DataSchema) : null;
}

function validateAiAppSpec(output: unknown, dataSchema: DataSchema): AppSpec | null {
  const errors = validateAppSpec(output, dataSchema);
  return errors.length === 0 ? (output as AppSpec) : null;
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
