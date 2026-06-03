import { z } from "zod";

export const appTypeSchema = z.enum([
  "crm",
  "project_management",
  "ecommerce",
  "hr_tool",
  "inventory",
  "content_platform",
  "analytics",
  "custom"
]);

export const integrationIdSchema = z.enum([
  "slack",
  "salesforce",
  "hubspot",
  "whatsapp",
  "gmail",
  "notion",
  "airtable",
  "stripe",
  "twilio_sms",
  "webhook",
  "google_sheets",
  "jira",
  "github",
  "zapier"
]);

export const appIntentSchema = z.object({
  appName: z.string().min(2),
  appType: appTypeSchema,
  features: z.array(z.string().min(2)).min(1),
  entities: z.array(z.string().min(2)).min(1),
  integrations_requested: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(integrationIdSchema)
  ),
  assumptions: z.preprocess(
    (value) => (Array.isArray(value) ? value : typeof value === "string" && value.trim().length > 0 ? [value] : []),
    z.array(z.string().min(2))
  ),
  clarification_required: z.boolean().optional(),
  clarification_question: z.string().optional()
});

export const fieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "json",
  "text",
  "uuid"
]);

export const entityFieldSchema = z.object({
  name: z.string().min(1),
  type: fieldTypeSchema,
  nullable: z.boolean(),
  isRelation: z.boolean(),
  isPrimary: z.boolean(),
  isUnique: z.boolean()
});

export const relationSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const relation = value as Record<string, unknown>;
  const target = relation.target ?? relation.targetEntity ?? relation.relatedEntity ?? relation.entity ?? relation.model;
  const rawType = String(relation.type ?? relation.relationType ?? relation.cardinality ?? "").toLowerCase();
  const type =
    rawType.includes("many") && rawType.includes("one")
      ? rawType.startsWith("many")
        ? "belongsTo"
        : "hasMany"
      : rawType.includes("belongs")
        ? "belongsTo"
        : rawType.includes("one")
          ? "hasOne"
          : rawType.includes("has_many") || rawType.includes("hasmany")
            ? "hasMany"
            : relation.type;

  const targetText = typeof target === "string" ? target : "unknown";
  const fallbackForeignKey = `${targetText.charAt(0).toLowerCase()}${targetText.slice(1)}Id`;

  return {
    ...relation,
    type,
    target,
    foreignKey: relation.foreignKey ?? relation.foreign_key ?? fallbackForeignKey,
    onDelete: relation.onDelete ?? relation.on_delete ?? "restrict"
  };
}, z.object({
  type: z.enum(["hasMany", "belongsTo", "hasOne"]),
  target: z.string().min(1),
  foreignKey: z.string().min(1),
  onDelete: z.enum(["cascade", "restrict", "setNull"])
}));

export const entitySchemaSchema = z.object({
  name: z.string().min(1),
  tableName: z.string().regex(/^[a-z][a-z0-9_]*$/),
  fields: z.array(entityFieldSchema).min(2),
  relations: z.array(relationSchema)
});

export const dataSchemaSchema = z.object({
  entities: z.array(entitySchemaSchema).min(1)
});

export const pageSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const page = value as Record<string, unknown>;
  const boundEntity = page.boundEntity ?? page.entity ?? page.model ?? "User";
  const rawComponents = Array.isArray(page.components) ? page.components : page.component ? [page.component] : ["table"];
  const components = rawComponents
    .map((component) => {
      if (typeof component === "string") {
        return normalizeComponent(component);
      }
      if (component && typeof component === "object") {
        const record = component as Record<string, unknown>;
        return normalizeComponent(String(record.type ?? record.component ?? record.name ?? ""));
      }
      return undefined;
    })
    .filter(Boolean);

  return {
    ...page,
    route: page.route ?? page.path ?? page.url ?? `/app/${String(boundEntity).toLowerCase()}`,
    layout: page.layout ?? inferLayoutFromName(String(page.name ?? "")),
    boundEntity,
    components
  };
}, z.object({
  name: z.string().min(1),
  route: z.string().startsWith("/"),
  layout: z.enum(["list", "detail", "dashboard", "settings"]),
  boundEntity: z.string().min(1),
  components: z.array(z.enum(["table", "form", "chart", "card"])).min(1)
}));

export const apiEndpointSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const endpoint = value as Record<string, unknown>;
  return {
    ...endpoint,
    path: endpoint.path ?? endpoint.route ?? endpoint.url ?? "/api/records",
    method: normalizeHttpMethod(endpoint.method ?? endpoint.httpMethod ?? endpoint.verb ?? endpoint.methods),
    handlerDescription: endpoint.handlerDescription ?? endpoint.handler ?? endpoint.description ?? "Generated API handler.",
    boundEntity: endpoint.boundEntity ?? endpoint.entity ?? endpoint.model ?? "User",
    authRequired: coerceBoolean(endpoint.authRequired ?? endpoint.requiresAuth ?? endpoint.auth, true),
    rateLimit: coerceBoolean(endpoint.rateLimit ?? endpoint.rateLimited, true)
  };
}, z.object({
  path: z.string().startsWith("/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  handlerDescription: z.string().min(1),
  boundEntity: z.string().min(1),
  authRequired: z.boolean(),
  rateLimit: z.boolean()
}));

export const authRulesSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      roles: ["admin", "manager", "member"],
      permissions: {}
    };
  }

  const auth = value as Record<string, unknown>;
  return {
    roles: auth.roles ?? ["admin", "manager", "member"],
    permissions: auth.permissions ?? auth.permissionMatrix ?? {}
  };
}, z.object({
  roles: z.array(z.string().min(1)).min(1),
  permissions: z.record(
    z.record(
      z.object({
        read: z.boolean(),
        write: z.boolean(),
        delete: z.boolean()
      })
    )
  )
}));

export const integrationHookSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const hook = value as Record<string, unknown>;
  const integration = hook.integration ?? hook.integrationId ?? hook.provider;
  const action = hook.action ?? hook.actionId ?? hook.actionType;
  const trigger = hook.trigger && typeof hook.trigger === "object" ? (hook.trigger as Record<string, unknown>) : {};

  return {
    ...hook,
    name: hook.name ?? `${String(integration ?? "integration")} hook`,
    integration,
    trigger: {
      entity: trigger.entity ?? hook.entity ?? "User",
      event: trigger.event ?? hook.event ?? "created"
    },
    action
  };
}, z.object({
  name: z.string().min(1),
  integration: integrationIdSchema,
  trigger: z.object({
    entity: z.string().min(1),
    event: z.enum(["created", "updated", "deleted", "status_changed"])
  }),
  action: z.string().min(1)
}));

export const workflowStubSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const workflow = value as Record<string, unknown>;
  const integration = workflow.integration ?? workflow.integrationId ?? workflow.provider;
  const action = workflow.action ?? workflow.actionId ?? workflow.actionType;
  const trigger = workflow.trigger && typeof workflow.trigger === "object" ? (workflow.trigger as Record<string, unknown>) : {};
  const payload =
    workflow.payload && typeof workflow.payload === "object" && !Array.isArray(workflow.payload)
      ? Object.fromEntries(Object.entries(workflow.payload as Record<string, unknown>).map(([key, item]) => [key, String(item)]))
      : { payload: Array.isArray(workflow.payload) ? workflow.payload.join(", ") : String(workflow.payload ?? "generated payload") };

  return {
    ...workflow,
    name: workflow.name ?? `${String(integration ?? "integration")} workflow`,
    description: workflow.description ?? `Generated workflow for ${String(integration ?? "integration")}.`,
    trigger: {
      entity: trigger.entity ?? workflow.entity ?? "User",
      event: trigger.event ?? workflow.event ?? "created",
      condition: trigger.condition ?? workflow.condition
    },
    integration,
    action,
    payload
  };
}, z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: z.object({
    entity: z.string().min(1),
    event: z.enum(["created", "updated", "deleted", "status_changed"]),
    condition: z.string().optional()
  }),
  integration: integrationIdSchema,
  action: z.string().min(1),
  payload: z.record(z.string())
}));

function inferLayoutFromName(name: string): "list" | "detail" | "dashboard" | "settings" {
  const lower = name.toLowerCase();
  if (lower.includes("dashboard")) {
    return "dashboard";
  }
  if (lower.includes("setting")) {
    return "settings";
  }
  if (lower.includes("detail") || lower.includes("profile")) {
    return "detail";
  }
  return "list";
}

function normalizeComponent(component: string): "table" | "form" | "chart" | "card" {
  const lower = component.toLowerCase();
  if (lower.includes("table") || lower.includes("list")) {
    return "table";
  }
  if (lower.includes("form") || lower.includes("input")) {
    return "form";
  }
  if (lower.includes("chart") || lower.includes("dashboard") || lower.includes("analytics")) {
    return "chart";
  }
  return "card";
}

function normalizeHttpMethod(value: unknown): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  const method = extractStringValue(value).toUpperCase();

  if (method.includes("DELETE") || method === "DEL" || method.includes("DESTROY") || method.includes("REMOVE")) {
    return "DELETE";
  }
  if (method.includes("PATCH") || method.includes("PARTIAL")) {
    return "PATCH";
  }
  if (method.includes("PUT") || method.includes("UPDATE") || method.includes("EDIT")) {
    return "PUT";
  }
  if (method.includes("POST") || method.includes("CREATE") || method.includes("ADD") || method.includes("SUBMIT")) {
    return "POST";
  }
  return "GET";
}

function extractStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return extractStringValue(value[0] ?? "");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return extractStringValue(record.method ?? record.value ?? record.name ?? record.type ?? record.id ?? "");
  }
  return "";
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["true", "yes", "required", "y"].includes(value.toLowerCase());
  }
  return fallback;
}

const registeredIntegrationIds = new Set<string>(integrationIdSchema.options);

export const appSpecSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const appSpec = value as Record<string, unknown>;
  return {
    ...appSpec,
    integrationHooks: filterValidIntegrationObjects(appSpec.integrationHooks),
    workflowStubs: filterValidIntegrationObjects(appSpec.workflowStubs)
  };
}, z.object({
  pages: z.array(pageSchema).min(1),
  apiEndpoints: z.array(apiEndpointSchema).min(1),
  authRules: authRulesSchema,
  integrationHooks: z.array(integrationHookSchema),
  workflowStubs: z.array(workflowStubSchema)
}));

function filterValidIntegrationObjects(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }

    const record = item as Record<string, unknown>;
    const integration = record.integration ?? record.integrationId ?? record.provider;
    const action = record.action ?? record.actionId ?? record.actionType;

    return typeof integration === "string" && registeredIntegrationIds.has(integration) && typeof action === "string" && action.length > 0;
  });
}

export const integrationActionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string()),
  outputSchema: z.record(z.string()),
  implemented: z.boolean()
});

export const integrationDescriptorSchema = z.object({
  id: integrationIdSchema,
  displayName: z.string().min(1),
  authType: z.enum(["oauth2", "api_key", "webhook_secret", "none"]),
  triggers: z.array(
    z.object({
      event: z.enum(["created", "updated", "deleted", "status_changed", "synced", "exported"]),
      description: z.string().min(1)
    })
  ),
  actions: z.array(integrationActionSchema).min(1),
  implemented: z.boolean(),
  implementationNote: z.string().optional()
});

export const integrationRegistrySchema = z.array(integrationDescriptorSchema);

export const validationErrorSchema = z.object({
  stage: z.enum(["intent", "schema", "appSpec"]),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.array(z.string()),
  severity: z.enum(["error", "warning"])
});

export const repairLogEntrySchema = z.object({
  stage: z.enum(["intent", "schema", "appSpec"]),
  strategy: z.enum(["structural", "field", "consistency"]),
  errorInput: z.string(),
  outcome: z.enum(["repaired", "escalated", "failed"]),
  message: z.string(),
  timestamp: z.string()
});
