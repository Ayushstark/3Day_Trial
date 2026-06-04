import { writeFile } from "node:fs/promises";

const baseUrl = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

const prompts = [
  {
    id: 1,
    category: "standard",
    prompt:
      "Build a CRM for a real estate agency. Agents manage leads, properties, and deals. Admin sees analytics. WhatsApp notifications when a deal closes.",
    expectedIntegrations: ["whatsapp"]
  },
  {
    id: 2,
    category: "standard",
    prompt:
      "Task manager for an engineering team. Tasks have due dates, assignees, priorities, and status. Team lead gets a Slack message when a task is overdue.",
    expectedIntegrations: ["slack"]
  },
  {
    id: 3,
    category: "standard",
    prompt: "Inventory system for a warehouse. Products, stock movements, suppliers. Low stock triggers an email alert.",
    expectedIntegrations: ["gmail"]
  },
  {
    id: 4,
    category: "standard",
    prompt:
      "HR tool for a 50-person company. Track employees, leave requests, and performance reviews. Notify manager on Slack when leave is approved.",
    expectedIntegrations: ["slack"]
  },
  {
    id: 5,
    category: "standard",
    prompt: "E-commerce backend. Products, orders, customers, payments via Stripe. Order confirmation sent via Gmail.",
    expectedIntegrations: ["stripe", "gmail"]
  },
  {
    id: 6,
    category: "standard",
    prompt: "Event management platform. Organizers create events, attendees register, QR check-in at the door. Confirmation via WhatsApp.",
    expectedIntegrations: ["whatsapp"]
  },
  {
    id: 7,
    category: "standard",
    prompt: "Project tracker. Projects, milestones, tasks. Sync tasks to Jira. Update a Google Sheet with weekly progress.",
    expectedIntegrations: ["jira", "google_sheets"]
  },
  {
    id: 8,
    category: "edge",
    prompt: "An app.",
    expectedIntegrations: []
  },
  {
    id: 9,
    category: "edge",
    prompt: "Build something like Notion for doctors.",
    expectedIntegrations: ["notion"]
  },
  {
    id: 10,
    category: "edge",
    prompt:
      "A platform with login, payments, roles, real-time chat, file uploads, native mobile, analytics, and a marketplace.",
    expectedIntegrations: ["stripe"]
  },
  {
    id: 11,
    category: "edge",
    prompt: "A CRM but also a project manager but also an invoicing tool.",
    expectedIntegrations: []
  },
  {
    id: 12,
    category: "edge",
    prompt: "Task manager, but make it smart.",
    expectedIntegrations: []
  }
];

const malformedRepairFixtures = [
  { stage: "schema", errorHint: "missing_tenant_id" },
  { stage: "schema", errorHint: "unknown_relation_target" },
  { stage: "schema", errorHint: "missing_inverse_relation" },
  { stage: "appSpec", errorHint: "page_without_api" },
  { stage: "appSpec", errorHint: "unknown_workflow_action" },
  { stage: "appSpec", errorHint: "unknown_workflow_entity" }
];

async function main() {
  await assertServerAvailable();

  const startedAt = new Date().toISOString();
  const promptResults = [];

  for (const item of prompts) {
    const result = await safeEvaluatePrompt(item);
    promptResults.push(result);
    console.log(`${result.success ? "PASS" : "FAIL"} prompt ${item.id}: ${result.promptShort}`);
    await writeEvaluationOutput(startedAt, promptResults, []);
  }

  const malformedRepairChecks = await safeRunMalformedRepairChecks();
  const summary = summarize(promptResults, malformedRepairChecks);
  await writeEvaluationOutput(startedAt, promptResults, malformedRepairChecks, summary);
  console.log("Wrote evaluation-results.json");
  console.log(summary.text);
}

async function safeEvaluatePrompt(item) {
  try {
    return await evaluatePrompt(item);
  } catch (error) {
    return {
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      promptShort: item.prompt.slice(0, 80),
      success: false,
      failedStage: "network_or_runner",
      repairStrategyUsed: [],
      retryCount: 0,
      latencyMs: 0,
      latencyByStage: {},
      estimatedTokenCost: 0,
      costBreakdown: [],
      expectedIntegrations: item.expectedIntegrations,
      detectedIntegrations: [],
      integrationsCorrectlyDetected: false,
      assumptions: [],
      validationErrorCount: 0,
      validationErrorCodes: [],
      failureMessage: error instanceof Error ? error.message : String(error),
      entityCount: 0,
      pageCount: 0,
      endpointCount: 0,
      workflowCount: 0
    };
  }
}

async function evaluatePrompt(item) {
  const started = performance.now();
  const created = await postJson("/api/generate", { prompt: item.prompt });
  const runPromise = postJson(`/api/generate/${created.jobId}/run`, {});
  const job = await pollJob(created.jobId);
  await runPromise.catch(() => undefined);
  const latencyMs = Math.round(performance.now() - started);
  const failedStage = findFailedStage(job);
  const failedEvent = findFailedEvent(job);
  const detectedIntegrations = job.intent?.integrations_requested ?? [];
  const integrationsCorrectlyDetected = item.expectedIntegrations.every((integration) => detectedIntegrations.includes(integration));
  const estimatedTokenCost = sum(job.costBreakdown?.map((row) => row.estimatedUsd) ?? []);
  const validationErrors = failedEvent?.error?.validationErrors ?? job.validationErrors ?? [];

  return {
    id: item.id,
    category: item.category,
    prompt: item.prompt,
    promptShort: item.prompt.slice(0, 80),
    success: job.stages?.appSpec === "complete" && !failedStage,
    failedStage,
    repairStrategyUsed: unique(job.repairLog?.map((entry) => entry.strategy) ?? []),
    retryCount: 0,
    latencyMs,
    latencyByStage: job.latencyByStage,
    estimatedTokenCost,
    costBreakdown: job.costBreakdown,
    expectedIntegrations: item.expectedIntegrations,
    detectedIntegrations,
    integrationsCorrectlyDetected,
    assumptions: job.intent?.assumptions ?? [],
    validationErrorCount: job.validationErrors?.length ?? 0,
    validationErrorCodes: validationErrors.map((error) => `${error.code}:${error.path?.join(".") ?? ""}`),
    failureMessage: failedEvent?.error?.message ?? null,
    entityCount: job.dataSchema?.entities?.length ?? 0,
    pageCount: job.appSpec?.pages?.length ?? 0,
    endpointCount: job.appSpec?.apiEndpoints?.length ?? 0,
    workflowCount: job.appSpec?.workflowStubs?.length ?? 0
  };
}

async function safeRunMalformedRepairChecks() {
  try {
    return await runMalformedRepairChecks();
  } catch (error) {
    return malformedRepairFixtures.map((fixture) => ({
      stage: fixture.stage,
      errorHint: fixture.errorHint,
      beforeErrorCodes: [],
      afterErrorCodes: [],
      repairStrategies: [],
      success: false,
      failureMessage: error instanceof Error ? error.message : String(error)
    }));
  }
}

async function runMalformedRepairChecks() {
  const created = await postJson("/api/generate", {
    prompt:
      "Build a CRM for a real estate agency. Agents manage leads, properties, and deals. WhatsApp notifications when a deal closes."
  });
  const runPromise = postJson(`/api/generate/${created.jobId}/run`, {});
  await pollJob(created.jobId);
  await runPromise.catch(() => undefined);

  const checks = [];
  for (const fixture of malformedRepairFixtures) {
    const repaired = await postJson(`/api/generate/${created.jobId}/repair`, fixture);
    checks.push({
      stage: fixture.stage,
      errorHint: fixture.errorHint,
      beforeErrorCodes: repaired.beforeErrors.map((error) => error.code),
      afterErrorCodes: repaired.afterErrors.map((error) => error.code),
      repairStrategies: repaired.repairLog.map((entry) => entry.strategy),
      success: repaired.beforeErrors.length > 0 && repaired.afterErrors.length === 0 && repaired.repairLog.length > 0
    });
  }

  return checks;
}

async function writeEvaluationOutput(startedAt, promptResults, malformedRepairChecks, summary = summarize(promptResults, malformedRepairChecks)) {
  const output = {
    startedAt,
    completedAt: new Date().toISOString(),
    baseUrl,
    promptResults,
    malformedRepairChecks,
    summary
  };

  await writeFile("evaluation-results.json", `${JSON.stringify(output, null, 2)}\n`, "utf-8");
}

function summarize(promptResults, malformedRepairChecks) {
  const successCount = promptResults.filter((result) => result.success).length;
  const successRate = Number(((successCount / promptResults.length) * 100).toFixed(2));
  const failureTypes = countBy(promptResults.flatMap((result) => (result.validationErrorCount > 0 ? ["validation"] : [])));
  const failedStages = countBy(promptResults.map((result) => result.failedStage).filter(Boolean));
  const weakestStage = Object.entries(failedStages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
  const commonFailureType = Object.entries(failureTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
  const repairPassCount = malformedRepairChecks.filter((check) => check.success).length;
  const totalCost = sum(promptResults.map((result) => result.estimatedTokenCost));
  const averageLatencyMs = Math.round(sum(promptResults.map((result) => result.latencyMs)) / promptResults.length);

  const text =
    `Evaluation completed on ${promptResults.length} prompts. Success rate was ${successCount}/${promptResults.length} (${successRate}%). ` +
    `Average latency was ${averageLatencyMs} ms and estimated total token cost was $${totalCost.toFixed(6)}. ` +
    `Most common failure type: ${commonFailureType}. Weakest stage: ${weakestStage}. ` +
    `Malformed repair fixtures passed ${repairPassCount}/${malformedRepairChecks.length}. ` +
    "The next concrete fix is to rerun the suite on the deployed multi-provider setup, then tune any provider-specific validation failures.";
  const submissionSummary =
    `The evaluation suite ran ${promptResults.length} prompts covering standard and edge-case app requests. ` +
    `${successCount} prompts completed successfully, giving a success rate of ${successCount}/${promptResults.length} (${successRate}%). ` +
    `The average latency was ${averageLatencyMs} ms and the estimated total token cost was $${totalCost.toFixed(6)}. ` +
    `The most common failure type was ${commonFailureType}, and the weakest stage was ${weakestStage}. ` +
    `Malformed repair fixtures passed ${repairPassCount}/${malformedRepairChecks.length}, demonstrating targeted schema and AppSpec repair paths rather than blind full retries. ` +
    `The next concrete improvement is to keep expanding provider-output normalizers and rerun the suite after quota resets so failures caused by rate limits are separated from schema-quality issues.`;

  return {
    successCount,
    totalPrompts: promptResults.length,
    successRate,
    commonFailureType,
    weakestStage,
    malformedRepairPassCount: repairPassCount,
    malformedRepairTotal: malformedRepairChecks.length,
    totalEstimatedTokenCost: Number(totalCost.toFixed(6)),
    averageLatencyMs,
    text,
    submissionSummary
  };
}

async function assertServerAvailable() {
  try {
    const response = await fetch(`${baseUrl}/api/integrations`);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
  } catch (error) {
    throw new Error(`Evaluation server is not reachable at ${baseUrl}. Start the app with npm.cmd run dev first. ${error}`);
  }
}

async function postJson(path, body) {
  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(json)}`);
  }

  return json;
}

async function pollJob(jobId) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const response = await fetchWithRetry(`${baseUrl}/api/generate/${jobId}`);
    const job = await response.json();

    if (job.stages?.appSpec === "complete" || job.stages?.intent === "failed" || job.stages?.schema === "failed" || job.stages?.appSpec === "failed") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await wait(1000 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      await wait(1000 * (attempt + 1));
    }
  }

  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFailedStage(job) {
  for (const stage of ["intent", "schema", "appSpec"]) {
    if (job.stages?.[stage] === "failed") {
      return stage;
    }
  }
  return null;
}

function findFailedEvent(job) {
  return [...(job.events ?? [])].reverse().find((event) => event.type === "stage_failed") ?? null;
}

function unique(values) {
  return Array.from(new Set(values));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
