import { integrationRegistry } from "@/lib/integrations/registry";
import { appSpecSchema } from "@/lib/schemas";
import type { AppIntent, AppSpec, DataSchema } from "@/lib/types";
import { toSnakeCase } from "@/lib/utils/text";

const defaultRoles = ["admin", "manager", "member"];

export function generateAppSpecDeterministic(intent: AppIntent, dataSchema: DataSchema): AppSpec {
  const pages = makePages(dataSchema);
  const apiEndpoints = makeApiEndpoints(dataSchema);
  const authRules = makeAuthRules(dataSchema);
  const workflowStubs = makeWorkflowStubs(intent, dataSchema);
  const integrationHooks = workflowStubs.map((workflow) => ({
    name: `${workflow.name} Hook`,
    integration: workflow.integration,
    trigger: {
      entity: workflow.trigger.entity,
      event: workflow.trigger.event
    },
    action: workflow.action
  }));

  return appSpecSchema.parse({
    pages,
    apiEndpoints,
    authRules,
    integrationHooks,
    workflowStubs
  });
}

function makePages(dataSchema: DataSchema): AppSpec["pages"] {
  const entityPages = dataSchema.entities.flatMap((entity) => {
    const route = `/app/${toSnakeCase(entity.name).replace(/_/g, "-")}`;
    return [
      {
        name: `${entity.name} List`,
        route,
        layout: "list" as const,
        boundEntity: entity.name,
        components: ["table", "form"] as Array<"table" | "form" | "chart" | "card">
      },
      {
        name: `${entity.name} Detail`,
        route: `${route}/:id`,
        layout: "detail" as const,
        boundEntity: entity.name,
        components: ["card", "form"] as Array<"table" | "form" | "chart" | "card">
      }
    ];
  });

  const dashboardEntity = dataSchema.entities.find((entity) => hasStatusField(entity)) ?? dataSchema.entities[0];

  return [
    {
      name: "Dashboard",
      route: "/app/dashboard",
      layout: "dashboard",
      boundEntity: dashboardEntity.name,
      components: ["chart", "card", "table"]
    },
    ...entityPages,
    {
      name: "Settings",
      route: "/app/settings",
      layout: "settings",
      boundEntity: "User",
      components: ["form", "card"]
    }
  ];
}

function makeApiEndpoints(dataSchema: DataSchema): AppSpec["apiEndpoints"] {
  return dataSchema.entities.flatMap((entity) => {
    const basePath = `/api/${toSnakeCase(entity.name).replace(/_/g, "-")}`;
    return [
      {
        path: basePath,
        method: "GET" as const,
        handlerDescription: `List ${entity.name} records for the active tenant.`,
        boundEntity: entity.name,
        authRequired: true,
        rateLimit: true
      },
      {
        path: basePath,
        method: "POST" as const,
        handlerDescription: `Create a ${entity.name} record for the active tenant.`,
        boundEntity: entity.name,
        authRequired: true,
        rateLimit: true
      },
      {
        path: `${basePath}/:id`,
        method: "GET" as const,
        handlerDescription: `Read one ${entity.name} record by id.`,
        boundEntity: entity.name,
        authRequired: true,
        rateLimit: true
      },
      {
        path: `${basePath}/:id`,
        method: "PATCH" as const,
        handlerDescription: `Update one ${entity.name} record by id.`,
        boundEntity: entity.name,
        authRequired: true,
        rateLimit: true
      },
      {
        path: `${basePath}/:id`,
        method: "DELETE" as const,
        handlerDescription: `Delete one ${entity.name} record by id.`,
        boundEntity: entity.name,
        authRequired: true,
        rateLimit: true
      }
    ];
  });
}

function makeAuthRules(dataSchema: DataSchema): AppSpec["authRules"] {
  return {
    roles: defaultRoles,
    permissions: Object.fromEntries(
      defaultRoles.map((role) => [
        role,
        Object.fromEntries(
          dataSchema.entities.map((entity) => [
            entity.name,
            {
              read: true,
              write: role !== "member" || !["User", "Payment"].includes(entity.name),
              delete: role === "admin"
            }
          ])
        )
      ])
    )
  };
}

function makeWorkflowStubs(intent: AppIntent, dataSchema: DataSchema): AppSpec["workflowStubs"] {
  return intent.integrations_requested.flatMap((integrationId) => {
    const integration = integrationRegistry.find((candidate) => candidate.id === integrationId);
    if (!integration) {
      return [];
    }

    const action = chooseAction(integrationId);
    const triggerEntity = chooseTriggerEntity(integrationId, dataSchema);
    const event = chooseEvent(triggerEntity, dataSchema);
    const condition = chooseCondition(triggerEntity, integrationId);

    return [
      {
        name: `${integration.displayName} ${triggerEntity} Automation`,
        description: `Trigger ${integration.displayName} action ${action} when ${triggerEntity} ${event.replace("_", " ")}.`,
        trigger: {
          entity: triggerEntity,
          event,
          ...(condition ? { condition } : {})
        },
        integration: integrationId,
        action,
        payload: makePayload(triggerEntity, action)
      }
    ];
  });
}

function chooseAction(integrationId: AppIntent["integrations_requested"][number]): string {
  switch (integrationId) {
    case "slack":
      return "send_channel_message";
    case "whatsapp":
      return "send_template_message";
    case "gmail":
      return "send_email";
    case "stripe":
      return "create_customer";
    case "jira":
      return "create_issue";
    case "google_sheets":
      return "append_row";
    case "salesforce":
      return "upsert_lead";
    case "hubspot":
      return "update_deal_stage";
    case "webhook":
      return "post_payload";
    default:
      return integrationRegistry.find((integration) => integration.id === integrationId)?.actions[0]?.id ?? "post_payload";
  }
}

function chooseTriggerEntity(integrationId: AppIntent["integrations_requested"][number], dataSchema: DataSchema): string {
  const entityNames = dataSchema.entities.map((entity) => entity.name);

  if (integrationId === "whatsapp" && entityNames.includes("Deal")) {
    return "Deal";
  }

  if (integrationId === "slack" && entityNames.includes("Task")) {
    return "Task";
  }

  if (integrationId === "gmail" && entityNames.includes("Order")) {
    return "Order";
  }

  if (integrationId === "stripe" && entityNames.includes("Customer")) {
    return "Customer";
  }

  if (integrationId === "jira" && entityNames.includes("Task")) {
    return "Task";
  }

  if (integrationId === "google_sheets" && entityNames.includes("Project")) {
    return "Project";
  }

  return dataSchema.entities.find((entity) => hasStatusField(entity))?.name ?? dataSchema.entities[0].name;
}

function chooseEvent(entityName: string, dataSchema: DataSchema): "created" | "updated" | "deleted" | "status_changed" {
  const entity = dataSchema.entities.find((candidate) => candidate.name === entityName);
  return entity && hasStatusField(entity) ? "status_changed" : "created";
}

function chooseCondition(entityName: string, integrationId: AppIntent["integrations_requested"][number]): string | undefined {
  if (entityName === "Deal" && integrationId === "whatsapp") {
    return "status === 'closed'";
  }

  if (entityName === "Task" && integrationId === "slack") {
    return "status === 'overdue'";
  }

  if (entityName === "LeaveRequest" && integrationId === "slack") {
    return "status === 'approved'";
  }

  return undefined;
}

function makePayload(entityName: string, action: string): Record<string, string> {
  switch (action) {
    case "send_template_message":
      return {
        to: `${entityName}.contactPhone`,
        templateName: `${toSnakeCase(entityName)}_status_update`,
        variables: `${entityName}.id, ${entityName}.status`
      };
    case "send_channel_message":
      return {
        channelId: "settings.slackChannelId",
        text: `${entityName}.title || ${entityName}.name`,
        blocks: `${entityName}.status, ${entityName}.dueDate`
      };
    case "send_email":
      return {
        to: `${entityName}.email || Customer.email`,
        subject: `${entityName} notification`,
        body: `${entityName}.summary`
      };
    case "create_customer":
      return {
        email: `${entityName}.email`,
        name: `${entityName}.name`,
        metadata: `${entityName}.id, tenantId`
      };
    case "create_issue":
      return {
        projectKey: "settings.jiraProjectKey",
        summary: `${entityName}.title`,
        description: `${entityName}.description`,
        assignee: `${entityName}.assigneeId`
      };
    case "append_row":
      return {
        spreadsheetId: "settings.spreadsheetId",
        tabName: "Progress",
        row: `${entityName}.id, ${entityName}.status, ${entityName}.updatedAt`
      };
    default:
      return {
        payload: `${entityName} fields mapped to ${action}`
      };
  }
}

function hasStatusField(entity: DataSchema["entities"][number]): boolean {
  return entity.fields.some((field) => field.name === "status");
}
