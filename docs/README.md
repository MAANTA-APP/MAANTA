# MAANTA Launch Handoff Pack

Portable markdown source for the launch documentation set. Notion is the
source of truth for editing and approval; these files are the export-ready
copies for Drive and, later, Obsidian. Keep them in sync: when a doc is
approved in Notion, re-export/update the matching file here.

| File | Audience | Purpose |
|---|---|---|
| [maanta-project-overview.md](maanta-project-overview.md) | Everyone | What MAANTA is, business model, launch strategy |
| [maanta-technical-handoff.md](maanta-technical-handoff.md) | Engineer | Repo, stack, environments, payments, schema, deferred items |
| [maanta-launch-readiness-tracker.md](maanta-launch-readiness-tracker.md) | Engineer / founder | Single view of launch blockers, owners, gating |
| [maanta-waitlist-data-schema.md](maanta-waitlist-data-schema.md) | Engineer / AI lead | Waitlist capture spec: fields, table design, API, CRM flow |
| [maanta-email-segmentation-plan.md](maanta-email-segmentation-plan.md) | AI lead / agency | Segments, lead scoring, CRM/email integration map |
| [maanta-shopper-email-sequence.md](maanta-shopper-email-sequence.md) | Agency | Shopper lifecycle emails |
| [maanta-merchant-email-sequence.md](maanta-merchant-email-sequence.md) | Agency | Merchant lifecycle emails |
| [maanta-mall-operator-email-sequence.md](maanta-mall-operator-email-sequence.md) | Agency | Mall-operator lifecycle emails |
| [maanta-marketing-agency-brief.md](maanta-marketing-agency-brief.md) | Agency | Positioning, audiences, offers, CTAs, KPIs, campaign plan |
| [maanta-launch-ops-runbook.md](maanta-launch-ops-runbook.md) | Founder / ops | Testing plan, QA smoke checklist, disputes, escalation |

Two deliverables from the engineering handoff live inside other docs rather
than as separate files:

- **QA smoke checklist** → section in `maanta-launch-ops-runbook.md`
- **CRM/email integration map** → section in `maanta-email-segmentation-plan.md`
