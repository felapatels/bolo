---
name: Background shell jobs die
description: Long-running processes started via ShellExec do not survive after the command returns.
---

`nohup ... &` / `setsid` processes launched from a shell command are killed once the command exits — the log file stops growing and `ps` shows nothing, which looks like a hang.

**Why:** a "backgrounded" long-running generator silently died shortly after launch while appearing to have started fine.

**How to apply:** run long scripts in the foreground with `timeout 290 ...` and re-invoke until done — design such scripts to be resumable/idempotent (skip already-complete work) so chunked runs converge.
