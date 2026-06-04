import { generateJsonWithGateway } from "@/lib/ai/gateway";
import { isProviderReady } from "@/lib/ai/providers";
import { buildAppSpecPrompt, buildIntentPrompt, buildSchemaPrompt } from "@/lib/ai/prompts";
import { estimateCost, MODEL_ROUTES, type StageRouteConfig } from "@/lib/ai/routing";
import { getJob, pushEvent, setStage, updateJob } from "@/lib/jobs/store";
import { generateAppSpecDeterministic } from "@/lib/pipeline/appSpec";
import { enrichIntentForPrompt, extractIntentDeterministic } from "@/lib/pipeline/intent";
import { generateDataSchemaDeterministic } from "@/lib/pipeline/schema";
import { repairAppSpec } from "@/lib/repair/appSpecRepair";
import { repairDataSchema } from "@/lib/repair/schemaRepair";
import { appIntentSchema, appSpecSchema, dataSchemaSchema } from "@/lib/schemas";
import type { AppIntent, AppSpec, DataSchema, ValidationError } from "@/lib/types";
import { toSnakeCase } from "@/lib/utils/text";
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

  return enrichIntentForPrompt(sanitizeIntentIntegrations(result.data, prompt), prompt);
}

const explicitIntegrationSignals: Record<AppIntent["integrations_requested"][number], string[]> = {
  slack: ["slack"],
  salesforce: ["salesforce"],
  hubspot: ["hubspot"],
  whatsapp: ["whatsapp", "whats app"],
  gmail: ["gmail", "google workspace", "email", "mail"],
  notion: ["notion"],
  airtable: ["airtable"],
  stripe: ["stripe", "payment", "payments", "checkout"],
  twilio_sms: ["twilio sms", "sms", "text message"],
  webhook: ["webhook", "web hook"],
  google_sheets: ["google sheets", "google sheet", "spreadsheet", "sheet export"],
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

  return ensureSchemaCoversIntent(result.data, intent);
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

  return ensureAppSpecCoversSchema(shapeResult.data, dataSchema);
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

function ensureSchemaCoversIntent(schema: DataSchema, intent: AppIntent): DataSchema {
  const supplement = generateDataSchemaDeterministic(intent);
  const entities = schema.entities.map((entity) => ({ ...entity, fields: [...entity.fields], relations: [...entity.relations] }));
  const entityMap = new Map(entities.map((entity) => [entity.name, entity]));

  for (const supplementEntity of supplement.entities) {
    const existing = entityMap.get(supplementEntity.name);
    if (!existing) {
      const clone = {
        ...supplementEntity,
        fields: [...supplementEntity.fields],
        relations: [...supplementEntity.relations]
      };
      entities.push(clone);
      entityMap.set(clone.name, clone);
      continue;
    }

    for (const field of supplementEntity.fields) {
      if (!existing.fields.some((candidate) => candidate.name === field.name)) {
        existing.fields.push(field);
      }
    }

    for (const relation of supplementEntity.relations) {
      if (!existing.relations.some((candidate) => candidate.target === relation.target && candidate.foreignKey === relation.foreignKey)) {
        existing.relations.push(relation);
      }
    }
  }

  const hasOrderItem = entityMap.has("OrderItem");
  if (hasOrderItem) {
    for (const entity of entities) {
      entity.relations = entity.relations.filter(
        (relation) =>
          !(
            (entity.name === "Product" && relation.target === "Order") ||
            (entity.name === "Order" && relation.target === "Product")
          )
      );
    }
  }

  return dataSchemaSchema.parse({ entities });
}

function ensureAppSpecCoversSchema(appSpec: AppSpec, dataSchema: DataSchema): AppSpec {
  const pages = [...appSpec.pages];
  const apiEndpoints = [...appSpec.apiEndpoints];
  const roles = appSpec.authRules.roles.length > 0 ? appSpec.authRules.roles : ["admin", "manager", "member"];
  const permissions = { ...appSpec.authRules.permissions };

  for (const entity of dataSchema.entities) {
    const baseRoute = `/${toSnakeCase(entity.name).replace(/_/g, "-")}`;
    if (!pages.some((page) => page.boundEntity === entity.name)) {
      pages.push({
        name: featurePageName(entity.name),
        route: baseRoute,
        layout: inferFeatureLayout(entity.name),
        boundEntity: entity.name,
        components: inferFeatureComponents(entity.name)
      });
    }

    const baseApiPath = `/api/${toSnakeCase(entity.name).replace(/_/g, "-")}`;
    const existingMethods = new Set(apiEndpoints.filter((endpoint) => endpoint.boundEntity === entity.name).map((endpoint) => endpoint.method));
    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      if (!existingMethods.has(method)) {
        apiEndpoints.push({
          path: method === "GET" || method === "POST" ? baseApiPath : `${baseApiPath}/:id`,
          method,
          handlerDescription: `${method} handler for ${entity.name} records.`,
          boundEntity: entity.name,
          authRequired: true,
          rateLimit: true
        });
      }
    }
  }

  for (const role of roles) {
    permissions[role] = permissions[role] ?? {};
    for (const entity of dataSchema.entities) {
      permissions[role][entity.name] = permissions[role][entity.name] ?? {
        read: true,
        write: role !== "member" || !["User", "Wallet", "Transaction", "PaymentMethod"].includes(entity.name),
        delete: role === "admin"
      };
    }
  }

  return appSpecSchema.parse({
    ...appSpec,
    pages,
    apiEndpoints,
    authRules: { roles, permissions }
  });
}

function featurePageName(entityName: string): string {
  const names: Record<string, string> = {
    Conversation: "Messages",
    Message: "Message Thread",
    Post: "Social Feed",
    Video: "Short Video Feed",
    Product: "Product Catalog",
    OrderItem: "Cart Items",
    Wallet: "Wallet",
    Transaction: "Transaction History",
    Game: "Game Lobby",
    GameSession: "Game Sessions",
    Challenge: "Challenges",
    Score: "Scores",
    LeaderboardEntry: "Leaderboard"
  };

  return names[entityName] ?? `${entityName} Workspace`;
}

function inferFeatureLayout(entityName: string): AppSpec["pages"][number]["layout"] {
  if (["Post", "Video", "Wallet", "Transaction", "Game", "Challenge", "LeaderboardEntry"].includes(entityName)) {
    return "dashboard";
  }

  if (["User", "Conversation", "Message"].includes(entityName)) {
    return "detail";
  }

  return "list";
}

function inferFeatureComponents(entityName: string): AppSpec["pages"][number]["components"] {
  if (["Post", "Video", "Wallet", "Transaction", "Game", "Challenge", "LeaderboardEntry"].includes(entityName)) {
    return ["card", "chart", "table"];
  }

  if (["Conversation", "Message"].includes(entityName)) {
    return ["card", "form"];
  }

  return ["table", "form"];
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
