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
  integrations_requested: z.array(integrationIdSchema),
  assumptions: z.array(z.string().min(2)),
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

export const relationSchema = z.object({
  type: z.enum(["hasMany", "belongsTo", "hasOne"]),
  target: z.string().min(1),
  foreignKey: z.string().min(1),
  onDelete: z.enum(["cascade", "restrict", "setNull"])
});

export const entitySchemaSchema = z.object({
  name: z.string().min(1),
  tableName: z.string().regex(/^[a-z][a-z0-9_]*$/),
  fields: z.array(entityFieldSchema).min(2),
  relations: z.array(relationSchema)
});

export const dataSchemaSchema = z.object({
  entities: z.array(entitySchemaSchema).min(1)
});

export const pageSchema = z.object({
  name: z.string().min(1),
  route: z.string().startsWith("/"),
  layout: z.enum(["list", "detail", "dashboard", "settings"]),
  boundEntity: z.string().min(1),
  components: z.array(z.enum(["table", "form", "chart", "card"])).min(1)
});

export const apiEndpointSchema = z.object({
  path: z.string().startsWith("/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  handlerDescription: z.string().min(1),
  boundEntity: z.string().min(1),
  authRequired: z.boolean(),
  rateLimit: z.boolean()
});

export const authRulesSchema = z.object({
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
});

export const integrationHookSchema = z.object({
  name: z.string().min(1),
  integration: integrationIdSchema,
  trigger: z.object({
    entity: z.string().min(1),
    event: z.enum(["created", "updated", "deleted", "status_changed"])
  }),
  action: z.string().min(1)
});

export const workflowStubSchema = z.object({
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
});

export const appSpecSchema = z.object({
  pages: z.array(pageSchema).min(1),
  apiEndpoints: z.array(apiEndpointSchema).min(1),
  authRules: authRulesSchema,
  integrationHooks: z.array(integrationHookSchema),
  workflowStubs: z.array(workflowStubSchema)
});

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
