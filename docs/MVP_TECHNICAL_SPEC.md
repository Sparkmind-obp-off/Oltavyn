# OLTAVYN — MVP Technical Specification

**Purpose:** Implementation-ready contract for the first end-to-end workflow, without locking an unverified vendor stack.

## Required user journey
1. Sign in and create a workspace.
2. Set a topic, audience and goal.
3. Add at least one evidence item with source reference and observation/capture dates.
4. Create an opportunity linked to evidence; review its rationale and uncertainty.
5. Generate a content brief and variants from that opportunity.
6. Edit and approve one exact content version.
7. Record manual publication status and URL, or explicitly record that it was not published.
8. Add actual metrics or mark them not yet available.
9. Review a learning summary that references recorded experiments and proposes a next test.

## Initial service contracts
- `POST /api/workspaces`, `GET/PATCH /api/workspaces/:id`
- `POST /api/workspaces/:id/evidence`, `GET/PATCH/DELETE /api/evidence/:id`
- `POST /api/workspaces/:id/opportunities`, `GET/PATCH /api/opportunities/:id`
- `POST /api/opportunities/:id/generate-brief`
- `POST /api/assets/:id/versions`, `POST /api/asset-versions/:id/approval`
- `POST /api/workspaces/:id/experiments`, `PATCH /api/experiments/:id`
- `POST /api/experiments/:id/observations`
- `POST /api/workspaces/:id/learning-summary`
- `POST /api/workspaces/:id/export`, `DELETE /api/workspaces/:id`

Routes are proposed contracts; align naming to the chosen framework before implementation. All private routes require authentication and workspace authorization.

## Opportunity scoring baseline
Use transparent, editable factors: relevance to selected audience, evidence strength, repeat signal, feasibility to create content, and uncertainty/risk. Show factor values and evidence, not just a mysterious total. Do not claim statistical significance. Do not score an opportunity as validated solely because an AI model likes it.

## Model output contract
Use structured JSON validated server-side. Include `brief`, `variants[]`, `claims[]` with evidence IDs or `unsupported` status, `assumptions[]`, and `review_notes[]`. Reject unknown evidence IDs and never allow the model to mark an asset approved.

## Test requirements
- Cross-workspace reads/writes denied.
- Unauthenticated private API requests denied.
- Invalid evidence IDs and malformed model output rejected safely.
- Draft generation cannot publish or mutate approval state.
- Approval is bound to exact version; editing creates a new version requiring new approval.
- Observations require unit, origin and observation time/window.
- Provider timeout/cost cap produces visible failure, not a fabricated result.
- Export contains only the authorized workspace; deletion follows documented behavior.

## Definition of done
Typecheck, lint, unit/integration tests, migration test, authorization test, production build and manual walkthrough pass. Capture evidence of deployment and end-to-end behavior before describing anything as live. No GitHub Actions dependency is assumed.