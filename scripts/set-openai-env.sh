#!/usr/bin/env bash
# Prompts for the OpenAI credentials and appends them to ~/bolo/.env.
#
# The key is read with -s so it is never echoed to the terminal, never lands in
# shell history, and never appears in a chat transcript. .env is gitignored
# (.gitignore line 78, `.env*`), so neither value can be committed.
#
# Both are needed. The OpenAI SDK reads OPENAI_BASE_URL from the environment on
# its own, which is why nothing in the repo references it: copy the key alone
# and every call goes to api.openai.com carrying a proxy token it will reject.
set -euo pipefail

ENV_FILE="/Users/aakeshpatel/bolo/.env"

read -r -s -p "OPENAI_API_KEY (input hidden): " KEY; echo
read -r -p "OPENAI_BASE_URL: " BASE

[ -n "$KEY" ]  || { echo "Key was empty. Nothing written." >&2; exit 1; }
[ -n "$BASE" ] || { echo "Base URL was empty. Nothing written." >&2; exit 1; }

# Replace rather than append, so running this twice does not leave two values
# with the later one silently winning.
tmp="$(mktemp)"
grep -v '^OPENAI_API_KEY=' "$ENV_FILE" 2>/dev/null | grep -v '^OPENAI_BASE_URL=' > "$tmp" || true
{ echo "OPENAI_API_KEY=$KEY"; echo "OPENAI_BASE_URL=$BASE"; } >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo
echo "Written to $ENV_FILE (mode 600)."
echo "OPENAI_API_KEY  ${#KEY} chars"
echo "OPENAI_BASE_URL $BASE"
