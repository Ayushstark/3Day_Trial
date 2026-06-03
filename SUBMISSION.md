# Submission Checklist

## GitHub

- Repository: `https://github.com/Ayushstark/3Day_Trial`
- README includes local setup, environment variables, architecture, provider routing, integrations, and scope cuts.
- `.env.example` documents AI provider keys and Redis/KV keys.

## Live URL

- Deployed app: `https://ai-engineer-3-day-trial-task-fronte.vercel.app/`
- Frontend and backend are deployed together as a fullstack Next.js app.
- Generation API routes are under `/api/generate`.

## Evaluation Log

- Evaluation file: `evaluation-results.json`
- Required prompts covered: 12/12
- Malformed repair fixtures covered: 6/6

## 300-Word Summary

The evaluation suite ran 12 required prompts covering standard app requests and edge cases. All 12 prompts completed successfully in the recorded run, giving a 12/12 success rate (100%). The average latency was 6413 ms and the estimated total token cost was $0.241336. The most common failure type was `none`, and the weakest stage was `none` for that run. Malformed repair fixtures passed 6/6, covering schema repairs such as missing `tenantId`, unknown relation targets, missing inverse relations, and AppSpec repairs such as page/API gaps, invalid workflow actions, and unknown workflow entities.

The pipeline is intentionally multi-stage rather than a single LLM call. It extracts `AppIntent`, converts that into `DataSchema`, and then generates a validated `AppSpec`. Each stage has typed schemas, validation, repair logging, cost tracking, latency tracking, and provider failover. The integration registry includes concrete metadata and action schemas for Slack, WhatsApp/Twilio, Gmail, Stripe, and Jira, while the remaining registry integrations are stubbed with clear interfaces. The main production hardening improvement already added after the first evaluation is Redis-backed job storage for Vercel reliability. The next concrete fix is to rerun the full evaluation on the final deployed multi-provider setup and tune any provider-specific output normalization issues found by unseen tester prompts.

## Final Pre-Submission Steps

1. Redeploy the latest GitHub commit on Vercel.
2. Confirm all AI keys and Redis/KV env vars are present in Vercel.
3. Run `npm.cmd run evaluate` locally against the deployed URL:

```powershell
$env:EVAL_BASE_URL="https://ai-engineer-3-day-trial-task-fronte.vercel.app"
npm.cmd run evaluate
```

4. Commit and push the refreshed `evaluation-results.json`.
