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
    { name: "price", type: "number", nullable: true }
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
  { parent: "Order", child: "Payment" },
  { parent: "Product", child: "Order", onDelete: "restrict" },
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
