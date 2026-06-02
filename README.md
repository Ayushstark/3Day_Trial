# OneAtlas AppSpec Generation Pipeline

Multi-stage AI generation pipeline for the OneAtlas 3-day AI Engineer trial. It converts a natural-language app request into a validated machine-readable `AppSpec` through:

1. `AppIntent`
2. `DataSchema`
3. `AppSpec`

The pipeline uses live AI providers when keys are configured, and deterministic generators as fallback when providers are unavailable or return invalid output.

## Quick Start

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Paste real keys into `.env.local`, not `.env.example`.

```env
OPENAI_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
```

Live adapters currently implemented:

- OpenAI
- Groq
- Google Gemini

Configurable/stubbed provider options:

- Anthropic
- Google AI
- DeepSeek
- OpenRouter
- Mistral

The gateway supports all eight providers as config entries, while the live integration minimum is satisfied by OpenAI, Groq, and Gemini.

## Scripts

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run evaluate
```

`npm.cmd run evaluate` runs all 12 required prompts and writes `evaluation-results.json`.

## API Routes

- `POST /api/generate`
- `GET /api/generate/:jobId`
- `GET /api/generate/:jobId/stream`
- `GET /api/generate/:jobId/repair`
- `GET /api/integrations`

## Pipeline Architecture

### Stage 1: Intent Extraction

Input: raw prompt.

Output: `AppIntent` with:

- `appName`
- `appType`
- `features`
- `entities`
- `integrations_requested`
- `assumptions`

Provider route:

- Primary: Groq `llama-3.1-8b-instant`
- Fallback: OpenAI `gpt-4o-mini`
- Deterministic fallback if AI is unavailable or invalid

### Stage 2: Schema Generation

Input: `AppIntent`.

Output: `DataSchema` with:

- entities
- fields
- relations
- `tenantId` on every entity
- bidirectional relation validation

Provider route:

- Primary: OpenAI `gpt-4o`
- Fallback: Gemini `gemini-1.5-pro`
- Deterministic fallback if AI is unavailable or invalid

### Stage 3: AppSpec Generation

Input: `DataSchema`.

Output: `AppSpec` with:

- pages
- API endpoints
- auth rules
- integration hooks
- workflow stubs

Provider route:

- Primary: Gemini `gemini-1.5-pro`
- Fallback: OpenAI `gpt-4o`
- Deterministic fallback if AI is unavailable or invalid

## Validation

Validation runs after every stage and returns structured error objects. It checks:

- Zod schema shape
- required fields
- entity references
- relation consistency
- page/API consistency
- auth role/entity references
- integration/action references

## Repair Engine

Implemented repair strategies:

- Structural/field repair for schema issues such as missing `tenantId`
- Consistency repair for unknown relation targets
- Consistency repair for missing inverse relations
- AppSpec repair for page/API gaps
- AppSpec repair for unknown entity references
- AppSpec repair for invalid integration or workflow actions

Manual repair endpoint:

```http
POST /api/generate/:jobId/repair
```

Body:

```json
{
  "stage": "schema",
  "errorHint": "missing_tenant_id"
}
```

Supported test hints:

- `missing_tenant_id`
- `unknown_relation_target`
- `missing_inverse_relation`
- `page_without_api`
- `unknown_workflow_action`
- `unknown_workflow_entity`

## Integration Registry

Implemented integration metadata/actions:

- Slack
- WhatsApp via Twilio
- Gmail / Google Workspace
- Stripe
- Jira

Stubbed with clear metadata/interface:

- Google Sheets
- Salesforce
- HubSpot
- Webhook

Additional registry IDs are represented in validation schemas for future expansion.

## Evaluation Results

Latest live-provider evaluation:

- Prompt success rate: `12/12`
- Malformed repair fixtures: `6/6`
- Average latency: `6413 ms`
- Estimated token cost: `$0.241336`
- Most common failure type: `none`
- Weakest stage: `none`

Full results are in:

```text
evaluation-results.json
```

## Scope Cuts

- Live OAuth/API calls for third-party integrations are not implemented.
- Integration actions are metadata stubs suitable for downstream implementation.
- Provider gateway has live adapters for three providers and config entries for all eight.
- Job storage is in-memory for the trial prototype.
- Deterministic generation remains as a fallback and regression baseline.

## Notes For Reviewers

The system is intentionally not a single LLM call. Each stage has typed contracts, validation, repair, progress events, cost logging, and deterministic fallback behavior. The evaluation suite includes both the required prompts and malformed-output repair checks.
