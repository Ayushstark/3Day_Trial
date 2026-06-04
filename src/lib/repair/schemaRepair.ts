import type { DataSchema, RepairLogEntry, ValidationError } from "@/lib/types";
import { toSnakeCase } from "@/lib/utils/text";

export type SchemaRepairResult = {
  schema: DataSchema;
  repairLog: RepairLogEntry[];
};

export function repairDataSchema(schema: DataSchema, errors: ValidationError[]): SchemaRepairResult {
  let next = cloneSchema(schema);
  const repairLog: RepairLogEntry[] = [];

  if (errors.some((error) => error.code === "missing_tenant_id")) {
    next = addMissingTenantIds(next);
    repairLog.push(makeLog("field", "missing_tenant_id", "repaired", "Added tenantId to entities missing the required multitenancy field."));
  }

  if (errors.some((error) => error.code === "unknown_relation_target")) {
    next = removeUnknownRelations(next);
    repairLog.push(makeLog("consistency", "unknown_relation_target", "repaired", "Removed relations pointing to entities that do not exist in the schema."));
  }

  if (errors.some((error) => error.code === "missing_inverse_relation")) {
    next = addMissingInverseRelations(next);
    repairLog.push(makeLog("consistency", "missing_inverse_relation", "repaired", "Added inverse relations where a deterministic counterpart was missing."));
  }

  return { schema: addMissingInverseRelations(next), repairLog };
}

function addMissingTenantIds(schema: DataSchema): DataSchema {
  return {
    entities: schema.entities.map((entity) => {
      if (entity.fields.some((field) => field.name === "tenantId")) {
        return entity;
      }

      return {
        ...entity,
        fields: [
          ...entity.fields,
          { name: "tenantId", type: "uuid", nullable: false, isRelation: false, isPrimary: false, isUnique: false }
        ]
      };
    })
  };
}

function removeUnknownRelations(schema: DataSchema): DataSchema {
  const entityNames = new Set(schema.entities.map((entity) => entity.name));
  return {
    entities: schema.entities.map((entity) => ({
      ...entity,
      relations: entity.relations.filter((relation) => entityNames.has(relation.target))
    }))
  };
}

function addMissingInverseRelations(schema: DataSchema): DataSchema {
  const next = cloneSchema(schema);
  const entityMap = new Map(next.entities.map((entity) => [entity.name, entity]));

  for (const entity of next.entities) {
    for (const relation of entity.relations) {
      const target = entityMap.get(relation.target);
      if (!target || target.relations.some((candidate) => candidate.target === entity.name)) {
        continue;
      }

      const inverseType = relation.type === "belongsTo" ? "hasMany" : "belongsTo";
      const foreignKey = relation.foreignKey || `${toSnakeCase(entity.name)}Id`;

      target.relations.push({
        type: inverseType,
        target: entity.name,
        foreignKey,
        onDelete: relation.onDelete
      });

      if (inverseType === "belongsTo" && !target.fields.some((field) => field.name === foreignKey)) {
        target.fields.push({
          name: foreignKey,
          type: "uuid",
          nullable: relation.onDelete === "setNull",
          isRelation: true,
          isPrimary: false,
          isUnique: false
        });
      }
    }
  }

  return next;
}

function cloneSchema(schema: DataSchema): DataSchema {
  return {
    entities: schema.entities.map((entity) => ({
      ...entity,
      fields: entity.fields.map((field) => ({ ...field })),
      relations: entity.relations.map((relation) => ({ ...relation }))
    }))
  };
}

function makeLog(
  strategy: RepairLogEntry["strategy"],
  errorInput: string,
  outcome: RepairLogEntry["outcome"],
  message: string
): RepairLogEntry {
  return {
    stage: "schema",
    strategy,
    errorInput,
    outcome,
    message,
    timestamp: new Date().toISOString()
  };
}
