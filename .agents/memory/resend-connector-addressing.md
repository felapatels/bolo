---
name: Resend connector addressing
description: How to call the Replit Resend connector proxy and its key restrictions
---

`connectors.proxy()` must be addressed by **connector name** (`"resend"`), not the `conn_…` connection id.

**Why:** The id form started returning 404 "No connection found for this customer" even while the connection showed status=added; the platform snippet documents the name form. Re-binding via ProposeIntegration alone did not fix the id form.

**How to apply:** Any new connector call site: use the connector name string. Also: the Resend connector's key is send-only — `GET /emails` returns 401 `restricted_api_key`, so delivery status can't be queried through it; verify sends by the send call succeeding + recipient checking the mailbox. Sender config details live in docs/CODEBASE-FACTS.md §7a2.
