"use client";

import { AlertCircle, CheckCircle2, Loader2, Moon, Send, ServerCog, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppIntent, AppSpec, DataSchema, GenerationJob, IntegrationRegistry, StageEvent } from "@/lib/types";

const samplePrompt =
  "Build a CRM for a real estate agency. Agents manage leads, properties, and deals. Admin sees analytics. WhatsApp notifications when a deal closes.";

export default function Home() {
  const [prompt, setPrompt] = useState(samplePrompt);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRegistry>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("oneatlas-theme");
    const nextTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("oneatlas-theme", theme);
  }, [theme]);

  useEffect(() => {
    void fetch("/api/integrations")
      .then((response) => response.json())
      .then((data: IntegrationRegistry) => setIntegrations(data));
  }, []);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    const source = new EventSource(`/api/generate/${jobId}/stream`);

    const handleEvent = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as StageEvent;
      setEvents((current) => [...current.filter((item) => item.id !== event.id), event]);
      void fetch(`/api/generate/${jobId}`)
        .then((response) => response.json())
        .then((data: GenerationJob) => setJob(data));
    };

    source.addEventListener("stage_start", handleEvent);
    source.addEventListener("stage_complete", handleEvent);
    source.addEventListener("stage_failed", handleEvent);

    return () => source.close();
  }, [jobId]);

  const intent = job?.intent;
  const latestEvent = useMemo(() => events.at(-1), [events]);

  async function submitPrompt() {
    setIsSubmitting(true);
    setJob(null);
    setEvents([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = (await response.json()) as { jobId?: string; error?: string };

      if (!response.ok || !data.jobId) {
        throw new Error(data.error ?? "Unable to start generation");
      }

      setJobId(data.jobId);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <header className="grid gap-5 border-b border-line pb-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-accent">
                <ServerCog className="h-4 w-4" />
                OneAtlas AppSpec Pipeline
              </div>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink shadow-sm"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-ink">Intent And Schema Pipeline</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Generate validated intent, data schema, and AppSpec outputs with visible provider failures and repair logs.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Live Route" value="7-provider chain" />
              <MetricCard label="Fallback" value="Auto failover" />
              <MetricCard label="Validation" value="Strict JSON" />
            </div>
          </div>
          <PipelineScene />
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
            <label htmlFor="prompt" className="mb-2 block text-sm font-medium text-ink">
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-36 w-full resize-y rounded-md border border-line bg-panel p-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={submitPrompt}
                disabled={isSubmitting}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                title="Run intent extraction"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Generate
              </button>
            </div>
          </div>

          <StageProgress job={job} latestEvent={latestEvent} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <IntentPanel intent={intent} />
          <ErrorPanel job={job} latestEvent={latestEvent} />
        </section>

        <SchemaPanel schema={job?.dataSchema} />

        <AppSpecPanel appSpec={job?.appSpec} />

        <IntegrationPanel integrations={integrations} />
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-sm">
      <div className="text-xs font-semibold uppercase text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function PipelineScene() {
  const nodes = [
    { label: "Intent", className: "left-1/2 top-2 -translate-x-1/2" },
    { label: "Schema", className: "bottom-8 left-6" },
    { label: "Spec", className: "bottom-8 right-6" }
  ];

  return (
    <div className="pipeline-scene hidden min-h-52 items-center justify-center rounded-lg border border-line bg-surface shadow-sm lg:flex">
      <div className="relative h-44 w-44">
        <div className="pipeline-ring absolute inset-5 rounded-full border border-accent/40 shadow-[0_0_50px_rgb(var(--color-accent)/0.18)]" />
        <div className="absolute inset-10 rounded-full border border-line" />
        <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-accent/40 bg-panel shadow-lg shadow-accent/10" />
        {nodes.map((node, index) => (
          <div
            key={node.label}
            className={`pipeline-node absolute ${node.className} flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-panel text-[10px] font-semibold text-accent shadow-md`}
            style={{ animationDelay: `${index * 0.35}s` }}
          >
            {node.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function StageProgress({ job, latestEvent }: { job: GenerationJob | null; latestEvent?: StageEvent }) {
  const stages = [
    { id: "intent", label: "Intent" },
    { id: "schema", label: "Schema" },
    { id: "appSpec", label: "AppSpec" }
  ] as const;

  return (
    <aside className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Stage Progress</h2>
      <div className="mt-4 space-y-3">
        {stages.map((stage) => {
          const status = job?.stages[stage.id] ?? "pending";
          return (
            <div key={stage.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <div className="flex items-center gap-2">
                {status === "complete" ? (
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                ) : status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-warn" />
                ) : status === "failed" ? (
                  <AlertCircle className="h-4 w-4 text-danger" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-line" />
                )}
                <span className="text-sm font-medium">{stage.label}</span>
              </div>
              <span className="text-xs text-muted">{job?.latencyByStage[stage.id] ? `${job.latencyByStage[stage.id]} ms` : status}</span>
            </div>
          );
        })}
      </div>
      {latestEvent ? <p className="mt-4 text-xs text-muted">Latest event: {latestEvent.type}</p> : null}
    </aside>
  );
}

function IntentPanel({ intent }: { intent?: AppIntent }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">AppIntent Output</h2>
      {intent ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoBlock label="App Name" values={[intent.appName]} />
          <InfoBlock label="App Type" values={[intent.appType]} />
          <InfoBlock label="Entities" values={intent.entities} />
          <InfoBlock label="Features" values={intent.features} />
          <InfoBlock label="Integrations" values={intent.integrations_requested.length ? intent.integrations_requested : ["None detected"]} />
          <InfoBlock label="Assumptions" values={intent.assumptions.length ? intent.assumptions : ["No assumptions needed"]} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Submit a prompt to generate the first structured stage.</p>
      )}
    </section>
  );
}

function InfoBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-muted">{label}</h3>
      <ul className="mt-2 space-y-1 text-sm text-ink">
        {values.map((value) => (
          <li key={value} className="rounded-md bg-panel px-2 py-1">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SchemaPanel({ schema }: { schema?: DataSchema }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">DataSchema Output</h2>
      {schema ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {schema.entities.map((entity) => (
            <article key={entity.name} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{entity.name}</h3>
                <span className="rounded bg-panel px-2 py-1 text-xs text-muted">{entity.tableName}</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel text-muted">
                    <tr>
                      <th className="px-2 py-2 font-medium">Field</th>
                      <th className="px-2 py-2 font-medium">Type</th>
                      <th className="px-2 py-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity.fields.map((field) => (
                      <tr key={field.name} className="border-t border-line">
                        <td className="px-2 py-2 text-ink">{field.name}</td>
                        <td className="px-2 py-2 text-muted">{field.type}</td>
                        <td className="px-2 py-2 text-muted">{fieldFlags(field)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-semibold uppercase text-muted">Relations</h4>
                {entity.relations.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-ink">
                    {entity.relations.map((relation) => (
                      <li key={`${relation.type}-${relation.target}-${relation.foreignKey}`} className="rounded bg-panel px-2 py-1">
                        {relation.type} {relation.target} via {relation.foreignKey}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">No relations</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Schema will appear after Stage 2 completes.</p>
      )}
    </section>
  );
}

function fieldFlags(field: DataSchema["entities"][number]["fields"][number]): string {
  const flags = [];
  if (field.isPrimary) {
    flags.push("primary");
  }
  if (field.isUnique) {
    flags.push("unique");
  }
  if (field.isRelation) {
    flags.push("relation");
  }
  if (field.nullable) {
    flags.push("nullable");
  }

  return flags.length ? flags.join(", ") : "required";
}

function AppSpecPanel({ appSpec }: { appSpec?: AppSpec }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">AppSpec Output</h2>
      {appSpec ? (
        <div className="mt-4 space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <PagesTable pages={appSpec.pages} />
            <EndpointsTable endpoints={appSpec.apiEndpoints} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <AuthRulesPanel authRules={appSpec.authRules} />
            <IntegrationHooksPanel hooks={appSpec.integrationHooks} />
            <WorkflowStubsPanel workflows={appSpec.workflowStubs} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Final AppSpec will appear after Stage 3 completes.</p>
      )}
    </section>
  );
}

function PagesTable({ pages }: { pages: AppSpec["pages"] }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="bg-panel px-3 py-2 text-xs font-semibold uppercase text-muted">Pages</div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Route</th>
            <th className="px-3 py-2 font-medium">Entity</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={`${page.name}-${page.route}`} className="border-t border-line">
              <td className="px-3 py-2 text-ink">{page.name}</td>
              <td className="px-3 py-2 text-muted">{page.route}</td>
              <td className="px-3 py-2 text-muted">{page.boundEntity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointsTable({ endpoints }: { endpoints: AppSpec["apiEndpoints"] }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="bg-panel px-3 py-2 text-xs font-semibold uppercase text-muted">API Endpoints</div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Method</th>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">Entity</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((endpoint) => (
            <tr key={`${endpoint.method}-${endpoint.path}`} className="border-t border-line">
              <td className="px-3 py-2 text-ink">{endpoint.method}</td>
              <td className="px-3 py-2 text-muted">{endpoint.path}</td>
              <td className="px-3 py-2 text-muted">{endpoint.boundEntity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuthRulesPanel({ authRules }: { authRules: AppSpec["authRules"] }) {
  return (
    <div className="rounded-md border border-line p-3">
      <h3 className="text-xs font-semibold uppercase text-muted">Auth Rules</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {authRules.roles.map((role) => (
          <span key={role} className="rounded bg-panel px-2 py-1 text-xs text-ink">
            {role}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{Object.keys(authRules.permissions).length} permission matrices generated.</p>
    </div>
  );
}

function IntegrationHooksPanel({ hooks }: { hooks: AppSpec["integrationHooks"] }) {
  return (
    <div className="rounded-md border border-line p-3">
      <h3 className="text-xs font-semibold uppercase text-muted">Integration Hooks</h3>
      {hooks.length ? (
        <ul className="mt-2 space-y-2 text-xs">
          {hooks.map((hook) => (
            <li key={hook.name} className="rounded bg-panel px-2 py-1">
              <span className="font-medium text-ink">{hook.integration}</span>
              <span className="text-muted">: {hook.trigger.entity} {hook.trigger.event} {"->"} {hook.action}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">No integrations requested.</p>
      )}
    </div>
  );
}

function WorkflowStubsPanel({ workflows }: { workflows: AppSpec["workflowStubs"] }) {
  return (
    <div className="rounded-md border border-line p-3">
      <h3 className="text-xs font-semibold uppercase text-muted">Workflow Stubs</h3>
      {workflows.length ? (
        <ul className="mt-2 space-y-2 text-xs">
          {workflows.map((workflow) => (
            <li key={workflow.name} className="rounded bg-panel px-2 py-2">
              <div className="font-medium text-ink">{workflow.name}</div>
              <div className="mt-1 text-muted">{workflow.trigger.entity} {workflow.trigger.event} {"->"} {workflow.integration}.{workflow.action}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">No workflow stubs generated.</p>
      )}
    </div>
  );
}

function ErrorPanel({ job, latestEvent }: { job: GenerationJob | null; latestEvent?: StageEvent }) {
  const errors = job?.validationErrors ?? latestEvent?.error?.validationErrors ?? [];
  const eventErrors = (job?.events ?? [])
    .filter((event) => event.error?.message)
    .map((event) => ({
      stage: event.stage,
      message: event.error?.message ?? ""
    }));
  const latestError = latestEvent?.error?.message
    ? [{ stage: latestEvent.stage, message: latestEvent.error.message }]
    : [];
  const visibleEventErrors = eventErrors.length ? eventErrors : latestError;

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Error And Repair Panel</h2>
      {errors.length === 0 && visibleEventErrors.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No validation errors logged yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visibleEventErrors.map((error, index) => (
            <li key={`${error.stage}-${index}`} className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
              <div className="font-medium text-danger">{error.stage} failed</div>
              <div className="mt-1 break-words text-ink">{error.message}</div>
            </li>
          ))}
          {errors.map((error, index) => (
            <li key={`${error.code}-${index}`} className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
              <div className="font-medium text-danger">{error.code}</div>
              <div className="mt-1 text-ink">{error.message}</div>
            </li>
          ))}
        </ul>
      )}
      {job?.repairLog.length ? <p className="mt-4 text-sm text-muted">{job.repairLog.length} repair attempts logged.</p> : null}
    </section>
  );
}

function IntegrationPanel({ integrations }: { integrations: IntegrationRegistry }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Integration Registry</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <article key={integration.id} className="rounded-md border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{integration.displayName}</h3>
                <p className="mt-1 text-xs text-muted">{integration.authType}</p>
              </div>
              <span className="rounded bg-panel px-2 py-1 text-xs text-muted">{integration.implemented ? "implemented" : "stubbed"}</span>
            </div>
            <p className="mt-3 text-xs text-muted">{integration.actions.map((action) => action.id).join(", ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
