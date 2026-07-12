---
name: Server-signed evaluation tokens for progress
description: Why practice attempts are recorded from a signed token, not client-supplied scores
---

Progress-bearing data (pronunciation score/passed/feedback/transcript/target phrase)
must never be trusted from the client. `/openai/pronunciation` computes the
authoritative evaluation and returns it as an HMAC-signed, short-lived token
(signed with `SESSION_SECRET`); `/attempts` verifies the token (signature +
expiry + `userId` match) and inserts *those* values — it accepts only the token.

**Why:** the two endpoints are independent, so before this any client could
`POST /attempts` with `score:100, passed:true` for every phrase and self-grant
mastery/streak/XP without ever recording audio.

**How to apply:** any new endpoint or feature that writes user progress or
grants earned rewards (achievements, badges, leaderboards) must derive the
score from the signed token / server-side evaluation, not from request-body
fields. Don't reintroduce client-asserted score/passed/feedback into the
attempt input.
