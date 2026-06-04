import type { AppIntent, DataSchema } from "@/lib/types";
import { integrationRegistry } from "@/lib/integrations/registry";

export function buildIntentPrompt(prompt: string): string {
  return [
    "Return only JSON for AppIntent.",
    "Schema keys: appName, appType, features, entities, integrations_requested, assumptions.",
    "appType enum: crm, project_management, ecommerce, hr_tool, inventory, content_platform, analytics, custom.",
    "integrations_requested must use registry ids only: slack, salesforce, hubspot, whatsapp, gmail, notion, airtable, stripe, twilio_sms, webhook, google_sheets, jira, github, zapier.",
    "If the prompt is vague, proceed with documented assumptions rather than asking a question.",
    "Preserve the user's full domain. Do not collapse a broad system into one feature just because one noun matches a known appType.",
    "For messy prompts that combine multiple products, extract each capability as a first-class feature and entity group.",
    "Examples: talk/chat implies Conversation and Message; TikTok/social feed implies Post or Video plus Follow/Like; shopping implies Product, Order, OrderItem, Review; bank/wallet implies Wallet, PaymentMethod, Transaction; games implies Game, GameSession, Score, Challenge or LeaderboardEntry.",
    "If the requested domain is healthcare, hospital, clinic, education, legal, finance, or another unsupported enum, use appType custom and include all core domain entities.",
    "For a hospital/clinic system, likely entities include Patient, Doctor, Appointment, BillingRecord, PharmacyItem, Prescription, and User unless the prompt says otherwise.",
    "For secure role-based access, include User or Role as an entity and include role-based access as a feature.",
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
    "Preserve every major AppIntent feature. If a feature is chat, social feed, shopping, banking/wallet, games, analytics, or role-based access, include concrete entities and relations for it.",
    "Use join entities where needed. For ecommerce orders, prefer OrderItem between Order and Product instead of directly making Order hasMany Product.",
    `AppIntent JSON: ${JSON.stringify(intent)}`
  ].join("\n");
}

export function buildAppSpecPrompt(intent: AppIntent, dataSchema: DataSchema): string {
  return [
    "Return only JSON for AppSpec.",
    "Schema keys: pages, apiEndpoints, authRules, integrationHooks, workflowStubs.",
    "Every page must have at least one API endpoint for the same boundEntity.",
    "Every workflowStub must reference a valid entity from DataSchema.",
    "Create user-facing pages for each major feature area, not just generic CRUD. Include feed/chat pages for social entities, catalog/cart/order pages for commerce entities, wallet/payment pages for finance entities, and game/challenge/leaderboard pages for game entities when those entities exist.",
    "Generate authRules.permissions for every role and every DataSchema entity.",
    "Integration hooks and workflow actions must reference this registry:",
    JSON.stringify(integrationRegistry),
    `AppIntent JSON: ${JSON.stringify(intent)}`,
    `DataSchema JSON: ${JSON.stringify(dataSchema)}`
  ].join("\n");
}
