# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — Boot-time one-shot scheduling calls against Redis/Valkey (e.g. registering a BullMQ repeatable job) should use a short-lived connection with a timeout, not the shared long-lived singleton, so a broker outage at boot cannot leave the singleton connection stuck retrying and block subsequent worker/queue use.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `queue` · harmful: 0
- features: newsletter-semanal
- evidence: backend/src/modules/newsletter/newsletter.queue.ts:80-89 (SPEC_DEVIATION) (queue)
- last seen: 2026-09-04T01:47:15Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
