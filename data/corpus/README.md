# Aurora Dynamics — English Corpus (GraphAtlas)

Fictional mid-size software company used as the GraphAtlas knowledge base. All content is
invented for this project (no real people or companies). The corpus is designed to support
the 50-question golden set (`data/eval/golden_questions.json`, ZHA-59) across four categories:

- **Single-hop facts** (e.g., "Who is the CTO?")
- **Multi-hop relations** (e.g., "Who does Ethan Brooks ultimately report to?")
- **Global / aggregation** (e.g., "Which teams own more than one active project?")
- **Hard / negative** (cross-document joins, near-duplicate names, out-of-scope questions)

## Files

| File | Type | Content |
|---|---|---|
| `01-org-chart.md` | reference | Leadership, reporting lines, roles |
| `02-teams.md` | reference | Team missions and leads |
| `03-projects.md` | reference | Active projects, owners, PMs, status |
| `04-customers.md` | reference | Key customers, plans, account owners |
| `05-vendors.md` | reference | Vendors and primary contacts |
| `06-runbooks.md` | runbook | Ops procedures, severity, escalation |
| `07-incidents.md` | record | Incident history |
| `08-roadmap.md` | plan | Q3 roadmap |
| `09-hiring.md` | reference | Open roles and hiring managers |
| `10-security-policy.md` | policy | Access tiers and approvals |
| `11-okrs.md` | plan | Team OKRs |
| `12-contracts.md` | reference | Customer/vendor contract summary |
| `headcount.csv` | data | Team, name, role, location, manager |
| `sales-pipeline.csv` | data | Deals, stage, ACV, owner, risk |

## Front matter convention

Markdown files use a minimal YAML front matter block:

```md
---
title: <Title>
type: <reference|runbook|record|plan|policy|data>
owner: <Team or role>
updated: <YYYY-MM-DD>
---
```

CSV files are validated for header consistency and row count.
