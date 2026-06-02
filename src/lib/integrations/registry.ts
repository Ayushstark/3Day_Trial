import type { IntegrationRegistry } from "@/lib/types";

const implemented = true;
const stubbed = false;

export const integrationRegistry: IntegrationRegistry = [
  {
    id: "slack",
    displayName: "Slack",
    authType: "oauth2",
    triggers: [
      { event: "created", description: "Record created" },
      { event: "updated", description: "Record updated" },
      { event: "status_changed", description: "Status changed" }
    ],
    actions: [
      {
        id: "send_channel_message",
        description: "Send a message to a Slack channel",
        inputSchema: { channelId: "string", text: "string", blocks: "json optional" },
        outputSchema: { messageTs: "string" },
        implemented
      },
      {
        id: "send_dm",
        description: "Send a direct message to a Slack user",
        inputSchema: { userId: "string", text: "string" },
        outputSchema: { messageTs: "string" },
        implemented
      }
    ],
    implemented
  },
  {
    id: "whatsapp",
    displayName: "WhatsApp via Twilio",
    authType: "api_key",
    triggers: [{ event: "status_changed", description: "Business record reaches a notification state" }],
    actions: [
      {
        id: "send_template_message",
        description: "Send an approved WhatsApp template message",
        inputSchema: { to: "string", templateName: "string", variables: "json" },
        outputSchema: { messageSid: "string" },
        implemented
      }
    ],
    implemented
  },
  {
    id: "gmail",
    displayName: "Gmail / Google Workspace",
    authType: "oauth2",
    triggers: [
      { event: "created", description: "Record created" },
      { event: "updated", description: "Record updated" }
    ],
    actions: [
      {
        id: "send_email",
        description: "Send an email from a connected Google Workspace account",
        inputSchema: { to: "string", subject: "string", body: "text" },
        outputSchema: { messageId: "string" },
        implemented
      }
    ],
    implemented
  },
  {
    id: "stripe",
    displayName: "Stripe",
    authType: "api_key",
    triggers: [{ event: "created", description: "Payment or subscription record created" }],
    actions: [
      {
        id: "create_customer",
        description: "Create a Stripe customer",
        inputSchema: { email: "string", name: "string optional", metadata: "json optional" },
        outputSchema: { customerId: "string" },
        implemented
      },
      {
        id: "manage_subscription",
        description: "Create or update a subscription",
        inputSchema: { customerId: "string", priceId: "string", metadata: "json optional" },
        outputSchema: { subscriptionId: "string", status: "string" },
        implemented
      }
    ],
    implemented
  },
  {
    id: "jira",
    displayName: "Jira",
    authType: "oauth2",
    triggers: [
      { event: "created", description: "Task-like record created" },
      { event: "updated", description: "Task-like record updated" }
    ],
    actions: [
      {
        id: "create_issue",
        description: "Create a Jira issue from an app task",
        inputSchema: { projectKey: "string", summary: "string", description: "text", assignee: "string optional" },
        outputSchema: { issueKey: "string", issueUrl: "string" },
        implemented
      },
      {
        id: "update_status",
        description: "Update a Jira issue status",
        inputSchema: { issueKey: "string", status: "string" },
        outputSchema: { issueKey: "string", status: "string" },
        implemented
      }
    ],
    implemented
  },
  {
    id: "google_sheets",
    displayName: "Google Sheets",
    authType: "oauth2",
    triggers: [{ event: "exported", description: "Data export requested" }],
    actions: [
      {
        id: "append_row",
        description: "Append a row to a configured sheet",
        inputSchema: { spreadsheetId: "string", tabName: "string", row: "json" },
        outputSchema: { updatedRange: "string" },
        implemented: stubbed
      }
    ],
    implemented: stubbed,
    implementationNote: "Registry metadata is present; live Google Sheets action is stubbed."
  },
  {
    id: "salesforce",
    displayName: "Salesforce",
    authType: "oauth2",
    triggers: [{ event: "synced", description: "CRM entity sync requested" }],
    actions: [
      {
        id: "upsert_lead",
        description: "Create or update a Salesforce Lead",
        inputSchema: { email: "string", company: "string optional", fields: "json" },
        outputSchema: { salesforceId: "string" },
        implemented: stubbed
      }
    ],
    implemented: stubbed,
    implementationNote: "Stubbed for metadata validation only."
  },
  {
    id: "hubspot",
    displayName: "HubSpot",
    authType: "oauth2",
    triggers: [{ event: "updated", description: "Contact or deal changed" }],
    actions: [
      {
        id: "update_deal_stage",
        description: "Update a HubSpot deal stage",
        inputSchema: { dealId: "string", stage: "string" },
        outputSchema: { dealId: "string" },
        implemented: stubbed
      }
    ],
    implemented: stubbed,
    implementationNote: "Stubbed for metadata validation only."
  },
  {
    id: "webhook",
    displayName: "Generic Webhook",
    authType: "webhook_secret",
    triggers: [{ event: "created", description: "Any supported app event" }],
    actions: [
      {
        id: "post_payload",
        description: "POST signed payload to a configured URL",
        inputSchema: { url: "string", payload: "json", signatureHeader: "string" },
        outputSchema: { statusCode: "number" },
        implemented: stubbed
      }
    ],
    implemented: stubbed,
    implementationNote: "Stubbed; interface defines payload and signing requirements."
  }
];
