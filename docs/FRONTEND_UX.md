# OLTAVYN — Frontend & UI/UX Specification

## UX objective
Make the next safe, useful action obvious. The interface should feel like a calm workbench for evidence and experiments, not a noisy AI chat or an engineer console.

## Primary navigation
- **Overview:** current experiment, next recommended action, loop status and recent activity.
- **Research:** evidence ledger, filters, source details and collection notes.
- **Opportunities:** ranked candidates, supporting evidence, counter-signals and review actions.
- **Content Studio:** briefs, variants, editor, provenance, versions and approval.
- **Experiments:** publication log, observations, comparisons and next-test recommendations.
- **Settings:** workspace goals, sources, integrations, privacy, export and deletion.

## Core screen states
Every screen supports loading, empty, success, partial-data and error states. Empty states explain the next action without pretending data exists. Stale integrations and missing metrics are visible. Distinguish “not collected,” “not available,” “failed,” and a real zero.

## Key interactions
- Evidence items open source details and provenance.
- Opportunity cards show “why this,” evidence count, limitations and review status.
- Content editor separates supported claims from claims requiring verification.
- Approval preview shows exact content, destination, account and action before publishing.
- Experiment metrics display unit, period and source; no chart if data is absent.
- Destructive actions require confirmation and explain consequences.

## Visual direction
Premium, focused, readable and modern; restrained color, strong hierarchy, generous spacing and accessible contrast. Avoid clutter, fake live indicators, celebratory revenue claims and overuse of dashboards. Responsive desktop-first with usable mobile layouts; keyboard navigation and clear focus states are required.

## Content language
Use plain Indonesian by default where the user selects Indonesian, with consistent English support later if needed. Explain confidence as a limitation, not as a guarantee. Prefer “evidence found” and “hypothesis to test” over “viral opportunity” or “guaranteed winner.”

## Accessibility and usability
Semantic headings, labels for inputs, keyboard-operable controls, meaningful error messages, sufficient contrast, reduced-motion support and no status conveyed by color alone.

## Frontend technical rules
- Server-side authorization is authoritative; hiding a button is not security.
- Validate API responses and render safe text; never render model HTML unsanitized.
- Keep secrets and privileged provider keys server-side.
- Use optimistic updates only where rollback is safe; show pending/failure state for side effects.
- Do not add charts until there are enough meaningful observations.