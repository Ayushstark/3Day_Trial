import type { AppIntent, DataSchema } from "@/lib/types";
import { integrationRegistry } from "@/lib/integrations/registry";

export function buildIntentPrompt(prompt: string): string {
  return [
    "Return only JSON for AppIntent.",
    "Schema keys: appName, appType, features, entities, integrations_requested, assumptions.",
    "appType enum: crm, project_management, ecommerce, hr_tool, inventory, content_platform, analytics, custom.",
    "integrations_requested must use registry ids only: slack, salesforce, hubspot, whatsapp, gmail, notion, airtable, stripe, twilio_sms, webhook, google_sheets, jira, github, zapier.",
    "If the prompt is vague, proceed with documented assumptions rather than asking a question.",
    `User prompt: ${prompt}`
  ].join("\n");
}

export function buildSchemaPrompt(intent: AppIntent): string {
  return [
    "Return only JSON for DataSchema.",
    "Schema keys: { entities: EntitySchema[] }.",
    "Each entity: name, tableName snake_case, fields, relations.",
    "Each field: name, type, nullable, isRelation, isPrimary, isUnique.",
    "Field type enum: string, number, boolean, date, datetime, enum, json, text, uuid.",
    "Every entity must include id uuid primary unique and tenantId uuid required.",
    "Relations must be bidirectionally consistent.",
    `AppIntent JSON: ${JSON.stringify(intent)}`
  ].join("\n");
}

export function buildAppSpecPrompt(intent: AppIntent, dataSchema: DataSchema): string {
  return [
    "Return only JSON for AppSpec.",
    "Schema keys: pages, apiEndpoints, authRules, integrationHooks, workflowStubs.",
    "Every page must have at least one API endpoint for the same boundEntity.",
    "Every workflowStub must reference a valid entity from DataSchema.",
    "Integration hooks and workflow actions must reference this registry:",
    JSON.stringify(integrationRegistry),
    `AppIntent JSON: ${JSON.stringify(intent)}`,
    `DataSchema JSON: ${JSON.stringify(dataSchema)}`
  ].join("\n");
}
