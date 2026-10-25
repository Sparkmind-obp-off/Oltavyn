# OLTAVYN — North Star & Measurement

**Status:** Baseline proposal v1.0

## North Star metric
**Weekly Evidence-to-Learning Loops (WELL):** number of distinct content experiments in a week that (1) cite at least one inspectable evidence item, (2) produce a user-approved asset, (3) are marked published or deliberately not published with a reason, and (4) have an outcome observation or explicit “not yet available” status plus a recorded next decision.

This metric rewards complete, honest learning loops rather than raw AI output. Report the count and the share with observed results separately so missing metrics are not hidden.

## Supporting metrics
- Time from workspace setup to first evidence-backed opportunity.
- Opportunity review rate: accepted / reviewed opportunities.
- Content approval rate and median edits before approval.
- Experiment completion rate: published or intentionally stopped / started.
- Outcome capture rate within the chosen observation window.
- Repeat usage: users who start another loop within 7 days.
- User-reported time saved and usefulness, collected with a lightweight prompt.

## Guardrail metrics
- Percentage of claims with inspectable provenance.
- Unsupported/fabricated evidence incidents (target: zero tolerated, investigate every report).
- Publishing actions without explicit approval (target: zero).
- Unauthorized or policy-violating source/channel use (target: zero).
- Cost per completed loop and failed integration rate.
- Data deletion/export requests completed within the documented policy.

## Metric rules
- Never infer sales, clicks, reach or conversion from generated content.
- Keep observed, user-entered, imported and estimated values distinct.
- Store the observation source and timestamp; preserve raw values where possible.
- Do not optimize a recommendation solely for engagement if the user's goal is different.
- Set numeric targets only after a baseline from actual tests; do not invent benchmarks.

## First validation gate
The first milestone is qualitative: at least one real operator completes a full loop and can explain which evidence influenced the decision. The next gate should be defined after several observed sessions, not guessed in advance.