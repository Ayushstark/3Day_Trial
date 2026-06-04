import { appIntentSchema, type appTypeSchema } from "@/lib/schemas";
import type { AppIntent } from "@/lib/types";
import { countMeaningfulWords, singularize, titleCase } from "@/lib/utils/text";

type AppType = typeof appTypeSchema._type;

const appTypeSignals: Array<{ type: AppType; signals: string[]; defaultEntities: string[]; defaultFeatures: string[] }> = [
  {
    type: "crm",
    signals: ["crm", "lead", "deal", "sales", "real estate", "contact"],
    defaultEntities: ["Lead", "Contact", "Deal"],
    defaultFeatures: ["lead management", "pipeline tracking", "role-based analytics"]
  },
  {
    type: "project_management",
    signals: ["task", "project", "milestone", "engineering team", "assignee"],
    defaultEntities: ["Project", "Task", "User"],
    defaultFeatures: ["task assignment", "status tracking", "deadline monitoring"]
  },
  {
    type: "ecommerce",
    signals: ["e-commerce", "ecommerce", "order", "product", "payment", "customer"],
    defaultEntities: ["Product", "Order", "Customer"],
    defaultFeatures: ["catalog management", "order tracking", "payment operations"]
  },
  {
    type: "hr_tool",
    signals: ["hr", "employee", "leave", "performance", "manager"],
    defaultEntities: ["Employee", "LeaveRequest", "PerformanceReview"],
    defaultFeatures: ["employee records", "leave approvals", "performance review tracking"]
  },
  {
    type: "inventory",
    signals: ["inventory", "warehouse", "stock", "supplier"],
    defaultEntities: ["Product", "StockMovement", "Supplier"],
    defaultFeatures: ["stock tracking", "supplier management", "low stock alerts"]
  },
  {
    type: "content_platform",
    signals: ["notion", "content", "document", "article", "page"],
    defaultEntities: ["Workspace", "Page", "User"],
    defaultFeatures: ["content organization", "collaborative editing", "permissions"]
  },
  {
    type: "analytics",
    signals: ["analytics", "dashboard", "report", "metric"],
    defaultEntities: ["Metric", "Report", "Dashboard"],
    defaultFeatures: ["dashboard views", "reporting", "metric tracking"]
  }
];

const integrationSignals = [
  { id: "slack", signals: ["slack"] },
  { id: "salesforce", signals: ["salesforce"] },
  { id: "hubspot", signals: ["hubspot"] },
  { id: "whatsapp", signals: ["whatsapp", "what's app"] },
  { id: "gmail", signals: ["gmail", "email", "google workspace"] },
  { id: "notion", signals: ["notion"] },
  { id: "airtable", signals: ["airtable"] },
  { id: "stripe", signals: ["stripe", "payment", "payments"] },
  { id: "twilio_sms", signals: ["sms", "otp"] },
  { id: "webhook", signals: ["webhook"] },
  { id: "google_sheets", signals: ["google sheet", "google sheets", "sheet"] },
  { id: "jira", signals: ["jira"] },
  { id: "github", signals: ["github", "pull request", "workflow dispatch"] },
  { id: "zapier", signals: ["zapier"] }
] as const;

const entityNouns = [
  "agents",
  "leads",
  "properties",
  "deals",
  "tasks",
  "assignees",
  "users",
  "projects",
  "milestones",
  "products",
  "stock movements",
  "suppliers",
  "employees",
  "leave requests",
  "performance reviews",
  "orders",
  "customers",
  "payments",
  "events",
  "organizers",
  "attendees",
  "doctors",
  "patients",
  "invoices",
  "conversations",
  "messages",
  "posts",
  "videos",
  "games",
  "game sessions",
  "challenges",
  "scores",
  "leaderboard entries",
  "wallets",
  "transactions",
  "payment methods",
  "reviews",
  "order items"
];

const capabilityHints: Array<{
  signals: string[];
  features: string[];
  entities: string[];
  assumptions?: string[];
}> = [
  {
    signals: ["talk", "chat", "message", "conversation", "dm", "people can talk"],
    features: ["real-time messaging", "conversation threads"],
    entities: ["Conversation", "Message"]
  },
  {
    signals: ["tiktok", "tik tok", "social", "feed", "short video", "video feed", "creator"],
    features: ["social media feed", "short-form content"],
    entities: ["Post", "Video"]
  },
  {
    signals: ["shop", "shopping", "amazon", "marketplace", "cart", "checkout", "ecommerce", "e-commerce"],
    features: ["shopping catalog", "checkout flow", "product reviews"],
    entities: ["Product", "Order", "OrderItem", "Review"]
  },
  {
    signals: ["bank", "wallet", "balance", "finance", "payment method", "transaction"],
    features: ["wallet management", "payment method management", "transaction history"],
    entities: ["Wallet", "Transaction", "PaymentMethod"]
  },
  {
    signals: ["game", "games", "gaming", "play", "challenge", "leaderboard", "score"],
    features: ["gameplay sessions", "challenges", "leaderboards"],
    entities: ["Game", "GameSession", "Challenge", "Score", "LeaderboardEntry"]
  }
];

export function extractIntentDeterministic(prompt: string): AppIntent {
  const normalized = prompt.toLowerCase();
  const matchedType = appTypeSignals.find((candidate) => candidate.signals.some((signal) => normalized.includes(signal)));
  const typeConfig = matchedType ?? {
    type: "custom" as const,
    defaultEntities: ["User", "Record"],
    defaultFeatures: ["record management", "role-based access"],
    signals: []
  };

  const explicitEntities = entityNouns
    .filter((noun) => normalized.includes(noun))
    .map((noun) => titleCase(singularize(noun).replace(/\s+/g, " ")).replace(/\s/g, ""));

  const entities = Array.from(new Set([...explicitEntities, ...typeConfig.defaultEntities]));
  const integrations = integrationSignals
    .filter((integration) => integration.signals.some((signal) => normalized.includes(signal)))
    .map((integration) => integration.id);

  const assumptions: string[] = [];
  if (countMeaningfulWords(prompt) < 10) {
    assumptions.push("Prompt is vague, so the pipeline proceeds with a small MVP instead of blocking for clarification.");
  }

  if (normalized.includes("smart")) {
    assumptions.push("Smart features are interpreted as prioritization, reminders, and simple automation suggestions.");
  }

  if (normalized.includes("login") || normalized.includes("roles")) {
    assumptions.push("Authentication and role-based permissions are included in the AppSpec, while live auth implementation is out of scope.");
  }

  if (normalized.includes("native mobile") || normalized.includes("marketplace") || normalized.includes("file uploads")) {
    assumptions.push("Overscoped platform features are reduced to a web MVP with extensible AppSpec stubs.");
  }

  if (normalized.includes("crm") && normalized.includes("project manager")) {
    assumptions.push("Conflicting domains are resolved by using CRM as the primary app type and project tracking as a feature area.");
  }

  const appName = inferAppName(prompt, typeConfig.type);
  const features = Array.from(new Set([...typeConfig.defaultFeatures, ...inferFeatures(normalized)]));

  return enrichIntentForPrompt(appIntentSchema.parse({
    appName,
    appType: typeConfig.type,
    features,
    entities,
    integrations_requested: integrations,
    assumptions
  }), prompt);
}

export function enrichIntentForPrompt(intent: AppIntent, prompt: string): AppIntent {
  const normalized = prompt.toLowerCase();
  const features = new Set(intent.features);
  const entities = new Set(intent.entities.map((entity) => normalizeEntityName(entity)));
  const assumptions = new Set(intent.assumptions);

  if (!entities.has("User")) {
    entities.add("User");
  }

  for (const hint of capabilityHints) {
    if (!hint.signals.some((signal) => normalized.includes(signal))) {
      continue;
    }

    hint.features.forEach((feature) => features.add(feature));
    hint.entities.forEach((entity) => entities.add(entity));
    hint.assumptions?.forEach((assumption) => assumptions.add(assumption));
  }

  const matchedCapabilities = capabilityHints.filter((hint) => hint.signals.some((signal) => normalized.includes(signal))).length;
  if (matchedCapabilities > 1) {
    assumptions.add("Prompt blends multiple product domains, so each detected capability is modeled as a first-class module.");
  }

  return appIntentSchema.parse({
    ...intent,
    features: Array.from(features),
    entities: Array.from(entities),
    assumptions: Array.from(assumptions)
  });
}

function inferAppName(prompt: string, appType: AppType): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("real estate")) {
    return "Real Estate CRM";
  }

  if (lower.includes("engineering team")) {
    return "Engineering Task Manager";
  }

  if (lower.includes("warehouse")) {
    return "Warehouse Inventory System";
  }

  if (lower.includes("50-person")) {
    return "Company HR Tool";
  }

  if (lower.includes("event management")) {
    return "Event Management Platform";
  }

  if ((lower.includes("social") || lower.includes("tiktok") || lower.includes("talk")) && (lower.includes("shop") || lower.includes("amazon"))) {
    return "Social Marketplace";
  }

  return `${titleCase(appType.replace(/_/g, " "))} App`;
}

function normalizeEntityName(entity: string): string {
  return titleCase(singularize(entity).replace(/[_-]+/g, " ")).replace(/\s/g, "");
}

function inferFeatures(normalized: string): string[] {
  const features: string[] = [];

  if (normalized.includes("analytics") || normalized.includes("dashboard")) {
    features.push("analytics dashboard");
  }

  if (normalized.includes("notification") || normalized.includes("message") || normalized.includes("alert")) {
    features.push("event notifications");
  }

  if (normalized.includes("qr")) {
    features.push("QR check-in");
  }

  if (normalized.includes("real-time chat")) {
    features.push("real-time messaging stub");
  }

  if (normalized.includes("payments") || normalized.includes("stripe")) {
    features.push("payment workflow stubs");
  }

  return features;
}
