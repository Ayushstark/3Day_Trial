import { integrationRegistry } from "@/lib/integrations/registry";
import type { AppSpec, DataSchema, RepairLogEntry, ValidationError } from "@/lib/types";

export type AppSpecRepairResult = {
  appSpec: AppSpec;
  repairLog: RepairLogEntry[];
};

export function repairAppSpec(appSpec: AppSpec, dataSchema: DataSchema, errors: ValidationError[]): AppSpecRepairResult {
  let next = cloneAppSpec(appSpec);
  const repairLog: RepairLogEntry[] = [];

  if (errors.some((error) => error.code === "unknown_page_entity" || error.code === "unknown_endpoint_entity" || error.code === "unknown_auth_entity")) {
    next = removeUnknownEntityReferences(next, dataSchema);
    repairLog.push(makeLog("consistency", "unknown_entity_reference", "repaired", "Removed or remapped AppSpec references to entities outside the DataSchema."));
  }

  if (errors.some((error) => error.code === "page_without_api")) {
    next = addMissingPageEndpoints(next);
    repairLog.push(makeLog("consistency", "page_without_api", "repaired", "Created GET endpoints for pages that did not have a matching API route."));
  }

  if (errors.some((error) => error.code === "unknown_auth_role")) {
    next = removeUnknownAuthRoles(next);
    repairLog.push(makeLog("field", "unknown_auth_role", "repaired", "Removed permission matrix entries for roles not declared in authRules.roles."));
  }

  if (errors.some((error) => error.code.includes("integration") || error.code.includes("workflow"))) {
    next = repairIntegrationReferences(next, dataSchema);
    repairLog.push(makeLog("consistency", "integration_or_workflow_reference", "repaired", "Dropped invalid hooks/workflows and normalized invalid actions to the registry default."));
  }

  return { appSpec: next, repairLog };
}

function removeUnknownEntityReferences(appSpec: AppSpec, dataSchema: DataSchema): AppSpec {
  const entityNames = new Set(dataSchema.entities.map((entity) => entity.name));
  const fallbackEntity = dataSchema.entities[0].name;

  return {
    ...appSpec,
    pages: appSpec.pages.map((page) => ({
      ...page,
      boundEntity: entityNames.has(page.boundEntity) ? page.boundEntity : fallbackEntity
    })),
    apiEndpoints: appSpec.apiEndpoints.filter((endpoint) => entityNames.has(endpoint.boundEntity)),
    authRules: {
      ...appSpec.authRules,
      permissions: Object.fromEntries(
        Object.entries(appSpec.authRules.permissions).map(([role, permissions]) => [
          role,
          Object.fromEntries(Object.entries(permissions).filter(([entityName]) => entityNames.has(entityName)))
        ])
      )
    },
    integrationHooks: appSpec.integrationHooks.filter((hook) => entityNames.has(hook.trigger.entity)),
    workflowStubs: appSpec.workflowStubs.filter((workflow) => entityNames.has(workflow.trigger.entity))
  };
}

function addMissingPageEndpoints(appSpec: AppSpec): AppSpec {
  const endpoints = [...appSpec.apiEndpoints];

  for (const page of appSpec.pages) {
    const matchingEndpoint = endpoints.some((endpoint) => endpoint.boundEntity === page.boundEntity);
    if (matchingEndpoint) {
      continue;
    }

    endpoints.push({
      path: page.route,
      method: "GET",
      handlerDescription: `Load data for ${page.name}.`,
      boundEntity: page.boundEntity,
      authRequired: true,
      rateLimit: true
    });
  }

  return { ...appSpec, apiEndpoints: endpoints };
}

function removeUnknownAuthRoles(appSpec: AppSpec): AppSpec {
  const roleSet = new Set(appSpec.authRules.roles);
  return {
    ...appSpec,
    authRules: {
      ...appSpec.authRules,
      permissions: Object.fromEntries(Object.entries(appSpec.authRules.permissions).filter(([role]) => roleSet.has(role)))
    }
  };
}

function repairIntegrationReferences(appSpec: AppSpec, dataSchema: DataSchema): AppSpec {
  const entityNames = new Set(dataSchema.entities.map((entity) => entity.name));
  const registry = new Map(integrationRegistry.map((integration) => [integration.id, integration]));

  const integrationHooks = appSpec.integrationHooks
    .filter((hook) => entityNames.has(hook.trigger.entity))
    .flatMap((hook) => {
      const integration = registry.get(hook.integration);
      if (!integration) {
        return [];
      }

      return [
        {
          ...hook,
          action: integration.actions.some((action) => action.id === hook.action) ? hook.action : integration.actions[0].id
        }
      ];
    });

  const workflowStubs = appSpec.workflowStubs
    .filter((workflow) => entityNames.has(workflow.trigger.entity))
    .flatMap((workflow) => {
      const integration = registry.get(workflow.integration);
      if (!integration) {
        return [];
      }

      return [
        {
          ...workflow,
          action: integration.actions.some((action) => action.id === workflow.action) ? workflow.action : integration.actions[0].id
        }
      ];
    });

  return { ...appSpec, integrationHooks, workflowStubs };
}

function cloneAppSpec(appSpec: AppSpec): AppSpec {
  return {
    pages: appSpec.pages.map((page) => ({ ...page, components: [...page.components] })),
    apiEndpoints: appSpec.apiEndpoints.map((endpoint) => ({ ...endpoint })),
    authRules: {
      roles: [...appSpec.authRules.roles],
      permissions: Object.fromEntries(
        Object.entries(appSpec.authRules.permissions).map(([role, permissions]) => [
          role,
          Object.fromEntries(Object.entries(permissions).map(([entityName, rule]) => [entityName, { ...rule }]))
        ])
      )
    },
    integrationHooks: appSpec.integrationHooks.map((hook) => ({
      ...hook,
      trigger: { ...hook.trigger }
    })),
    workflowStubs: appSpec.workflowStubs.map((workflow) => ({
      ...workflow,
      trigger: { ...workflow.trigger },
      payload: { ...workflow.payload }
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
    stage: "appSpec",
    strategy,
    errorInput,
    outcome,
    message,
    timestamp: new Date().toISOString()
  };
}
