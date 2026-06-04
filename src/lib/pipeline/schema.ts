import type { AppIntent, DataSchema } from "@/lib/types";
import { dataSchemaSchema } from "@/lib/schemas";
import { toSnakeCase } from "@/lib/utils/text";

type FieldTemplate = {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "enum" | "json" | "text" | "uuid";
  nullable?: boolean;
  isUnique?: boolean;
};

const entityFieldHints: Record<string, FieldTemplate[]> = {
  User: [
    { name: "name", type: "string" },
    { name: "email", type: "string", isUnique: true },
    { name: "role", type: "enum" }
  ],
  Agent: [
    { name: "name", type: "string" },
    { name: "email", type: "string", isUnique: true },
    { name: "region", type: "string", nullable: true }
  ],
  Lead: [
    { name: "name", type: "string" },
    { name: "email", type: "string", nullable: true },
    { name: "source", type: "string", nullable: true },
    { name: "status", type: "enum" }
  ],
  Contact: [
    { name: "name", type: "string" },
    { name: "email", type: "string", nullable: true },
    { name: "phone", type: "string", nullable: true }
  ],
  Property: [
    { name: "address", type: "string" },
    { name: "price", type: "number" },
    { name: "status", type: "enum" }
  ],
  Deal: [
    { name: "title", type: "string" },
    { name: "value", type: "number" },
    { name: "status", type: "enum" },
    { name: "closedAt", type: "datetime", nullable: true }
  ],
  Project: [
    { name: "name", type: "string" },
    { name: "status", type: "enum" },
    { name: "deadline", type: "date", nullable: true }
  ],
  Milestone: [
    { name: "name", type: "string" },
    { name: "dueDate", type: "date" },
    { name: "status", type: "enum" }
  ],
  Task: [
    { name: "title", type: "string" },
    { name: "description", type: "text", nullable: true },
    { name: "dueDate", type: "date", nullable: true },
    { name: "priority", type: "enum" },
    { name: "status", type: "enum" }
  ],
  Product: [
    { name: "name", type: "string" },
    { name: "sku", type: "string", isUnique: true },
    { name: "description", type: "text", nullable: true },
    { name: "price", type: "number", nullable: true },
    { name: "stockQuantity", type: "number", nullable: true },
    { name: "imageUrl", type: "string", nullable: true }
  ],
  OrderItem: [
    { name: "quantity", type: "number" },
    { name: "unitPrice", type: "number" },
    { name: "lineTotal", type: "number" }
  ],
  Review: [
    { name: "rating", type: "number" },
    { name: "comment", type: "text", nullable: true }
  ],
  Conversation: [
    { name: "title", type: "string", nullable: true },
    { name: "conversationType", type: "enum" },
    { name: "lastMessageAt", type: "datetime", nullable: true }
  ],
  Message: [
    { name: "body", type: "text" },
    { name: "sentAt", type: "datetime" },
    { name: "readAt", type: "datetime", nullable: true }
  ],
  Post: [
    { name: "caption", type: "text", nullable: true },
    { name: "mediaUrl", type: "string", nullable: true },
    { name: "visibility", type: "enum" },
    { name: "publishedAt", type: "datetime", nullable: true }
  ],
  Video: [
    { name: "title", type: "string", nullable: true },
    { name: "videoUrl", type: "string" },
    { name: "durationSeconds", type: "number", nullable: true },
    { name: "viewCount", type: "number" }
  ],
  Game: [
    { name: "name", type: "string" },
    { name: "description", type: "text", nullable: true },
    { name: "genre", type: "string", nullable: true },
    { name: "isActive", type: "boolean" }
  ],
  GameSession: [
    { name: "startedAt", type: "datetime" },
    { name: "endedAt", type: "datetime", nullable: true },
    { name: "status", type: "enum" }
  ],
  Challenge: [
    { name: "name", type: "string" },
    { name: "description", type: "text", nullable: true },
    { name: "startsAt", type: "datetime", nullable: true },
    { name: "endsAt", type: "datetime", nullable: true },
    { name: "status", type: "enum" }
  ],
  Score: [
    { name: "points", type: "number" },
    { name: "achievedAt", type: "datetime" }
  ],
  LeaderboardEntry: [
    { name: "rank", type: "number" },
    { name: "points", type: "number" },
    { name: "period", type: "string", nullable: true }
  ],
  Wallet: [
    { name: "balance", type: "number" },
    { name: "currency", type: "string" },
    { name: "status", type: "enum" }
  ],
  Transaction: [
    { name: "amount", type: "number" },
    { name: "transactionType", type: "enum" },
    { name: "status", type: "enum" },
    { name: "processedAt", type: "datetime", nullable: true }
  ],
  PaymentMethod: [
    { name: "type", type: "enum" },
    { name: "details", type: "json" },
    { name: "isDefault", type: "boolean" }
  ],
  StockMovement: [
    { name: "quantity", type: "number" },
    { name: "movementType", type: "enum" },
    { name: "occurredAt", type: "datetime" }
  ],
  Supplier: [
    { name: "name", type: "string" },
    { name: "email", type: "string", nullable: true },
    { name: "phone", type: "string", nullable: true }
  ],
  Employee: [
    { name: "name", type: "string" },
    { name: "email", type: "string", isUnique: true },
    { name: "department", type: "string" },
    { name: "managerId", type: "uuid", nullable: true }
  ],
  LeaveRequest: [
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "status", type: "enum" }
  ],
  PerformanceReview: [
    { name: "reviewPeriod", type: "string" },
    { name: "rating", type: "number", nullable: true },
    { name: "notes", type: "text", nullable: true }
  ],
  Order: [
    { name: "orderNumber", type: "string", isUnique: true },
    { name: "status", type: "enum" },
    { name: "total", type: "number" }
  ],
  Customer: [
    { name: "name", type: "string" },
    { name: "email", type: "string", isUnique: true }
  ],
  Payment: [
    { name: "amount", type: "number" },
    { name: "status", type: "enum" },
    { name: "providerReference", type: "string", nullable: true }
  ],
  Event: [
    { name: "name", type: "string" },
    { name: "startsAt", type: "datetime" },
    { name: "location", type: "string", nullable: true }
  ],
  Organizer: [
    { name: "name", type: "string" },
    { name: "email", type: "string", isUnique: true }
  ],
  Attendee: [
    { name: "name", type: "string" },
    { name: "email", type: "string" },
    { name: "checkedInAt", type: "datetime", nullable: true }
  ],
  Record: [
    { name: "title", type: "string" },
    { name: "status", type: "enum" },
    { name: "metadata", type: "json", nullable: true }
  ]
};

const relationPairs: Array<{ parent: string; child: string; foreignKey?: string; onDelete?: "cascade" | "restrict" | "setNull" }> = [
  { parent: "Agent", child: "Lead" },
  { parent: "Agent", child: "Deal" },
  { parent: "Contact", child: "Deal" },
  { parent: "Property", child: "Deal" },
  { parent: "Project", child: "Milestone" },
  { parent: "Project", child: "Task" },
  { parent: "Milestone", child: "Task", onDelete: "setNull" },
  { parent: "User", child: "Task", foreignKey: "assigneeId", onDelete: "setNull" },
  { parent: "Product", child: "StockMovement" },
  { parent: "Supplier", child: "Product", onDelete: "setNull" },
  { parent: "Customer", child: "Order" },
  { parent: "User", child: "Order" },
  { parent: "Order", child: "Payment" },
  { parent: "Order", child: "OrderItem", onDelete: "cascade" },
  { parent: "Product", child: "OrderItem", onDelete: "restrict" },
  { parent: "User", child: "Review", onDelete: "cascade" },
  { parent: "Product", child: "Review", onDelete: "cascade" },
  { parent: "User", child: "Conversation", onDelete: "cascade" },
  { parent: "Conversation", child: "Message", onDelete: "cascade" },
  { parent: "User", child: "Message", foreignKey: "senderId", onDelete: "cascade" },
  { parent: "User", child: "Post", foreignKey: "authorId", onDelete: "cascade" },
  { parent: "Post", child: "Video", onDelete: "cascade" },
  { parent: "User", child: "Wallet", onDelete: "cascade" },
  { parent: "Wallet", child: "Transaction", onDelete: "cascade" },
  { parent: "User", child: "PaymentMethod", onDelete: "cascade" },
  { parent: "Game", child: "GameSession", onDelete: "cascade" },
  { parent: "User", child: "GameSession", foreignKey: "playerId", onDelete: "cascade" },
  { parent: "Game", child: "Challenge", onDelete: "cascade" },
  { parent: "Challenge", child: "Score", onDelete: "cascade" },
  { parent: "User", child: "Score", foreignKey: "playerId", onDelete: "cascade" },
  { parent: "Challenge", child: "LeaderboardEntry", onDelete: "cascade" },
  { parent: "User", child: "LeaderboardEntry", foreignKey: "playerId", onDelete: "cascade" },
  { parent: "Employee", child: "LeaveRequest" },
  { parent: "Employee", child: "PerformanceReview" },
  { parent: "Organizer", child: "Event" },
  { parent: "Event", child: "Attendee" }
];

export function generateDataSchemaDeterministic(intent: AppIntent): DataSchema {
  const entityNames = normalizeEntities(intent.entities);
  const entities = entityNames.map((name) => ({
    name,
    tableName: toSnakeCase(`${name}s`),
    fields: makeFields(name),
    relations: []
  }));

  const schema: DataSchema = { entities };
  addRelations(schema);

  return dataSchemaSchema.parse(schema);
}

function normalizeEntities(entities: string[]): string[] {
  const normalized = entities.map((entity) => entity.replace(/\s+/g, "")).filter(Boolean);

  if (!normalized.includes("User")) {
    normalized.unshift("User");
  }

  return Array.from(new Set(normalized));
}

function makeFields(entityName: string): DataSchema["entities"][number]["fields"] {
  const templates = entityFieldHints[entityName] ?? entityFieldHints.Record;
  return [
    { name: "id", type: "uuid", nullable: false, isRelation: false, isPrimary: true, isUnique: true },
    { name: "tenantId", type: "uuid", nullable: false, isRelation: false, isPrimary: false, isUnique: false },
    { name: "createdAt", type: "datetime", nullable: false, isRelation: false, isPrimary: false, isUnique: false },
    { name: "updatedAt", type: "datetime", nullable: false, isRelation: false, isPrimary: false, isUnique: false },
    ...templates.map((field) => ({
      name: field.name,
      type: field.type,
      nullable: field.nullable ?? false,
      isRelation: false,
      isPrimary: false,
      isUnique: field.isUnique ?? false
    }))
  ];
}

function addRelations(schema: DataSchema) {
  const entityMap = new Map(schema.entities.map((entity) => [entity.name, entity]));

  for (const pair of relationPairs) {
    const parent = entityMap.get(pair.parent);
    const child = entityMap.get(pair.child);

    if (!parent || !child) {
      continue;
    }

    const foreignKey = pair.foreignKey ?? `${toSnakeCase(pair.parent)}Id`;
    const onDelete = pair.onDelete ?? "restrict";

    if (!child.fields.some((field) => field.name === foreignKey)) {
      child.fields.push({
        name: foreignKey,
        type: "uuid",
        nullable: onDelete === "setNull",
        isRelation: true,
        isPrimary: false,
        isUnique: false
      });
    }

    if (!parent.relations.some((relation) => relation.target === child.name)) {
      parent.relations.push({ type: "hasMany", target: child.name, foreignKey, onDelete });
    }

    if (!child.relations.some((relation) => relation.target === parent.name)) {
      child.relations.push({ type: "belongsTo", target: parent.name, foreignKey, onDelete });
    }
  }
}
