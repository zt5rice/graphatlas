---
title: Operations Runbooks
type: runbook
owner: Infrastructure Team
updated: 2026-08-02
---

# Operations Runbooks

## Service restart (Merlin search)

1. Confirm the incident is not a known alert (see Datadog).
2. Restart the Merlin pods in the affected region.
3. Verify p95 query latency returns below 200 ms.
4. If latency persists, escalate to the on-call engineer, then to the manager.

## Incident severity definitions

- **SEV1** — customer-facing outage. Escalate immediately to Infrastructure Manager
  (Nora Al-Sayed), then Director (David Kim), then VP Engineering (Grace Liu).
- **SEV2** — degraded experience. Escalate to on-call engineer; page the manager if
  unresolved after 30 minutes.

## On-call escalation path

On-call engineer → Nora Al-Sayed → David Kim → Grace Liu.
