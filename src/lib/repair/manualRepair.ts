import { pushEvent, setStage, updateJob } from "@/lib/jobs/store";
import { repairAppSpec } from "@/lib/repair/appSpecRepair";
import { repairDataSchema } from "@/lib/repair/schemaRepair";
import type { AppSpec, DataSchema, GenerationJob, PipelineStage, RepairLogEntry, StageStatus, ValidationError } from "@/lib/types";
import { validateAppSpec, validateDataSchema, validateIntent } from "@/lib/validation/validate";

export type ManualRepairResult = {
  job: GenerationJob;
  beforeErrors: ValidationError[];
  afterErrors: ValidationError[];
  repairLog: RepairLogEntry[];
};

export async function runManualRepair(job: GenerationJob, stage: PipelineStage, errorHint?: string): Promise<ManualRepairResult> {
  if (stage === "intent") {
    const beforeErrors = validateIntent(job.intent);
    const repaired = await updateJob(job.id, (current) =>
      pushEvent(current, {
        type: beforeErrors.length ? "stage_failed" : "stage_complete",
        stage: "intent",
        error: beforeErrors.length
          ? {
              message: "Intent stage cannot be programmatically repaired yet.",
              validationErrors: beforeErrors
            }
          : undefined,
        output: current.intent
      })
    );

    return {
      job: repaired ?? job,
      beforeErrors,
      afterErrors: beforeErrors,
      repairLog: []
    };
  }

  if (stage === "schema") {
    return repairSchemaStage(job, errorHint);
  }

  return repairAppSpecStage(job, errorHint);
}

async function repairSchemaStage(job: GenerationJob, errorHint?: string): Promise<ManualRepairResult> {
  if (!job.dataSchema) {
    throw new Error("schema output is not available for this job");
  }

  const schemaWithFault = applySchemaFault(job.dataSchema, errorHint);
  const beforeErrors = validateDataSchema(schemaWithFault);
  const repaired = repairDataSchema(schemaWithFault, beforeErrors);
  const afterErrors = validateDataSchema(repaired.schema);
  const nextStatus: StageStatus = afterErrors.length === 0 ? "complete" : "failed";

  const updated = await updateJob(job.id, (current) => {
    const next = {
      ...current,
      dataSchema: repaired.schema,
      repairLog: [...current.repairLog, ...repaired.repairLog],
      validationErrors: mergeValidationErrors(current.validationErrors, afterErrors)
    };

    return pushEvent(setStage(next, "schema", nextStatus), {
      type: nextStatus === "complete" ? "stage_complete" : "stage_failed",
      stage: "schema",
      output: repaired.schema,
      error:
        afterErrors.length > 0
          ? {
              message: "Manual schema repair left validation errors.",
              validationErrors: afterErrors,
              repairLog: repaired.repairLog
            }
          : undefined
    });
  });

  return {
    job: updated ?? job,
    beforeErrors,
    afterErrors,
    repairLog: repaired.repairLog
  };
}

async function repairAppSpecStage(job: GenerationJob, errorHint?: string): Promise<ManualRepairResult> {
  if (!job.dataSchema || !job.appSpec) {
    throw new Error("dataSchema and appSpec outputs are required for AppSpec repair");
  }

  const appSpecWithFault = applyAppSpecFault(job.appSpec, errorHint);
  const beforeErrors = validateAppSpec(appSpecWithFault, job.dataSchema);
  const repaired = repairAppSpec(appSpecWithFault, job.dataSchema, beforeErrors);
  const afterErrors = validateAppSpec(repaired.appSpec, job.dataSchema);
  const nextStatus: StageStatus = afterErrors.length === 0 ? "complete" : "failed";

  const updated = await updateJob(job.id, (current) => {
    const next = {
      ...current,
      appSpec: repaired.appSpec,
      repairLog: [...current.repairLog, ...repaired.repairLog],
      validationErrors: mergeValidationErrors(current.validationErrors, afterErrors)
    };

    return pushEvent(setStage(next, "appSpec", nextStatus), {
      type: nextStatus === "complete" ? "stage_complete" : "stage_failed",
      stage: "appSpec",
      output: repaired.appSpec,
      error:
        afterErrors.length > 0
          ? {
              message: "Manual AppSpec repair left validation errors.",
              validationErrors: afterErrors,
              repairLog: repaired.repairLog
            }
          : undefined
    });
  });

  return {
    job: updated ?? job,
    beforeErrors,
    afterErrors,
    repairLog: repaired.repairLog
  };
}

function applySchemaFault(schema: DataSchema, errorHint?: string): DataSchema {
  const next = structuredClone(schema) as DataSchema;
  const hint = errorHint?.toLowerCase() ?? "";

  if (hint.includes("missing_tenant") && next.entities[0]) {
    next.entities[0].fields = next.entities[0].fields.filter((field) => field.name !== "tenantId");
  }

  if (hint.includes("unknown_relation") && next.entities[0]) {
    next.entities[0].relations.push({
      type: "hasMany",
      target: "GhostEntity",
      foreignKey: "ghostEntityId",
      onDelete: "restrict"
    });
  }

  if (hint.includes("missing_inverse") && next.entities.length >= 2) {
    const [source, target] = next.entities;
    source.relations.push({
      type: "hasMany",
      target: target.name,
      foreignKey: `${target.name.charAt(0).toLowerCase()}${target.name.slice(1)}Id`,
      onDelete: "restrict"
    });
    target.relations = target.relations.filter((relation) => relation.target !== source.name);
  }

  return next;
}

function applyAppSpecFault(appSpec: AppSpec, errorHint?: string): AppSpec {
  const next = structuredClone(appSpec) as AppSpec;
  const hint = errorHint?.toLowerCase() ?? "";

  if (hint.includes("page_without_api") && next.pages[0]) {
    const entity = next.pages[0].boundEntity;
    next.apiEndpoints = next.apiEndpoints.filter((endpoint) => endpoint.boundEntity !== entity);
  }

  if (hint.includes("unknown_page_entity") && next.pages[0]) {
    next.pages[0].boundEntity = "GhostEntity";
  }

  if (hint.includes("unknown_workflow_action") && next.workflowStubs[0]) {
    next.workflowStubs[0].action = "ghost_action";
  }

  if (hint.includes("unknown_workflow_entity") && next.workflowStubs[0]) {
    next.workflowStubs[0].trigger.entity = "GhostEntity";
  }

  return next;
}

function mergeValidationErrors(existing: ValidationError[], latest: ValidationError[]): ValidationError[] {
  const nonManual = existing.filter((error) => !error.code.startsWith("manual_repair_"));
  return [
    ...nonManual,
    ...latest.map((error) => ({
      ...error,
      code: `manual_repair_${error.code}`
    }))
  ];
}
