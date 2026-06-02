import type { z } from "zod";
import { appIntentSchema, appSpecSchema, dataSchemaSchema } from "@/lib/schemas";
import type { AppSpec, DataSchema, PipelineStage, ValidationError } from "@/lib/types";
import { integrationRegistry } from "@/lib/integrations/registry";

function zodErrorsToValidationErrors(stage: PipelineStage, result: z.SafeParseError<unknown>): ValidationError[] {
  return result.error.issues.map((issue) => ({
    stage,
    code: issue.code,
    message: issue.message,
    path: issue.path.map(String),
    severity: "error"
  }));
}

export function validateIntent(output: unknown): ValidationError[] {
  const result = appIntentSchema.safeParse(output);
  return result.success ? [] : zodErrorsToValidationErrors("intent", result);
}

export function validateDataSchema(output: unknown): ValidationError[] {
  const result = dataSchemaSchema.safeParse(output);
  if (!result.success) {
    return zodErrorsToValidationErrors("schema", result);
  }

  const errors: ValidationError[] = [];
  const schema = result.data;
  const entityNames = new Set(schema.entities.map((entity) => entity.name));

  for (const entity of schema.entities) {
    if (!entity.fields.some((field) => field.name === "tenantId")) {
      errors.push({
        stage: "schema",
        code: "missing_tenant_id",
        message: `${entity.name} must include tenantId`,
        path: ["entities", entity.name, "fields"],
        severity: "error"
      });
    }

    for (const relation of entity.relations) {
      if (!entityNames.has(relation.target)) {
        errors.push({
          stage: "schema",
          code: "unknown_relation_target",
          message: `${entity.name} relation targets missing entity ${relation.target}`,
          path: ["entities", entity.name, "relations", relation.target],
          severity: "error"
        });
      }

      const target = schema.entities.find((candidate) => candidate.name === relation.target);
      const inverseExists = target?.relations.some((candidate) => candidate.target === entity.name);
      if (!inverseExists) {
        errors.push({
          stage: "schema",
          code: "missing_inverse_relation",
          message: `${entity.name}.${relation.target} relation needs an inverse relation`,
          path: ["entities", entity.name, "relations"],
          severity: "error"
        });
      }
    }
  }

  return errors;
}

export function validateAppSpec(output: unknown, dataSchema: DataSchema): ValidationError[] {
  const result = appSpecSchema.safeParse(output);
  if (!result.success) {
    return zodErrorsToValidationErrors("appSpec", result);
  }

  const appSpec = result.data;
  const errors: ValidationError[] = [];
  const entityNames = new Set(dataSchema.entities.map((entity) => entity.name));
  const registry = new Map(integrationRegistry.map((integration) => [integration.id, integration]));

  for (const page of appSpec.pages) {
    if (!entityNames.has(page.boundEntity)) {
      errors.push(makeAppSpecError("unknown_page_entity", `${page.name} references missing entity ${page.boundEntity}`, ["pages", page.name]));
    }

    const matchingEndpoint = appSpec.apiEndpoints.some((endpoint) => endpoint.boundEntity === page.boundEntity);
    if (!matchingEndpoint) {
      errors.push(makeAppSpecError("page_without_api", `${page.name} needs a corresponding API endpoint`, ["pages", page.name]));
    }
  }

  for (const endpoint of appSpec.apiEndpoints) {
    if (!entityNames.has(endpoint.boundEntity)) {
      errors.push(makeAppSpecError("unknown_endpoint_entity", `${endpoint.path} references missing entity ${endpoint.boundEntity}`, ["apiEndpoints", endpoint.path]));
    }
  }

  for (const [role, permissions] of Object.entries(appSpec.authRules.permissions)) {
    if (!appSpec.authRules.roles.includes(role)) {
      errors.push(makeAppSpecError("unknown_auth_role", `Permission matrix references missing role ${role}`, ["authRules", "permissions", role]));
    }

    for (const entityName of Object.keys(permissions)) {
      if (!entityNames.has(entityName)) {
        errors.push(makeAppSpecError("unknown_auth_entity", `Auth rules reference missing entity ${entityName}`, ["authRules", role, entityName]));
      }
    }
  }

  validateIntegrationReferences(appSpec, entityNames, registry, errors);

  return errors;
}

function validateIntegrationReferences(
  appSpec: AppSpec,
  entityNames: Set<string>,
  registry: Map<string, (typeof integrationRegistry)[number]>,
  errors: ValidationError[]
) {
  for (const hook of appSpec.integrationHooks) {
    const integration = registry.get(hook.integration);
    if (!integration) {
      errors.push(makeAppSpecError("unknown_integration", `${hook.name} references unregistered integration ${hook.integration}`, ["integrationHooks", hook.name]));
      continue;
    }

    if (!entityNames.has(hook.trigger.entity)) {
      errors.push(makeAppSpecError("unknown_hook_entity", `${hook.name} references missing entity ${hook.trigger.entity}`, ["integrationHooks", hook.name]));
    }

    if (!integration.actions.some((action) => action.id === hook.action)) {
      errors.push(makeAppSpecError("unknown_integration_action", `${hook.name} references unsupported action ${hook.action}`, ["integrationHooks", hook.name, "action"]));
    }
  }

  for (const workflow of appSpec.workflowStubs) {
    const integration = registry.get(workflow.integration);
    if (!entityNames.has(workflow.trigger.entity)) {
      errors.push(makeAppSpecError("unknown_workflow_entity", `${workflow.name} references missing entity ${workflow.trigger.entity}`, ["workflowStubs", workflow.name]));
    }

    if (!integration) {
      errors.push(makeAppSpecError("unknown_workflow_integration", `${workflow.name} references unregistered integration ${workflow.integration}`, ["workflowStubs", workflow.name]));
      continue;
    }

    if (!integration.actions.some((action) => action.id === workflow.action)) {
      errors.push(makeAppSpecError("unknown_workflow_action", `${workflow.name} references unsupported action ${workflow.action}`, ["workflowStubs", workflow.name, "action"]));
    }
  }
}

function makeAppSpecError(code: string, message: string, path: string[]): ValidationError {
  return {
    stage: "appSpec",
    code,
    message,
    path,
    severity: "error"
  };
}
