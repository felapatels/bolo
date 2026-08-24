#!/usr/bin/env bash
# Push from the Replit Shell, prompting for the GitHub token.
#
# WHY THIS EXISTS. The Repl cannot push to GitHub by any built-in route:
# Replit's Git pane fails with "Unknown Git Error" and a bare `git push` fails
# with "Invalid username or token". A personal access token works, but only in
# the one form that is easy to get wrong, so this file holds the form.
#
# THE TOKEN IS THE PASSWORD, NOT THE USERNAME. https://TOKEN@github.com/... puts
# it in the username slot, git then asks for a password, and Replit's
# replit-git-askpass helper answers with "unable to read askpass response".
# That error looks like a broken helper and is actually a malformed URL.
# GIT_ASKPASS= empty stops the helper hijacking the credential anyway.
#
# NOTHING IS STORED. The token is read with -s so it never appears on screen or
# in shell history, is used for exactly one push, and is never written to
# .git/config, where `git remote set-url` would leave it in plain text for every
# later command to leak into a log.
#
# Usage:
#   bash scripts/repl-push.sh                 push what is already committed
#   bash scripts/repl-push.sh "commit message"  commit staged changes, then push
set -euo pipefail

REMOTE_PATH="felapatels/bolo.git"
USER_NAME="felapatels"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
MSG="${1:-}"

if [ -n "$MSG" ]; then
  if git diff --cached --quiet; then
    echo "Nothing staged. Stage files first, or run with no message to push commits." >&2
    exit 1
  fi
  git commit -m "$MSG"
fi

AHEAD="$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")"
echo "Pushing $BRANCH, $AHEAD commit(s) ahead."

read -r -s -p "GitHub token (input hidden): " TOKEN; echo
[ -n "$TOKEN" ] || { echo "No token given. Nothing pushed." >&2; exit 1; }

# The sed masks the token out of anything git echoes back, so the output is safe
# to paste into a chat.
GIT_ASKPASS= GIT_TERMINAL_PROMPT=0 \
  git push "https://${USER_NAME}:${TOKEN}@github.com/${REMOTE_PATH}" "$BRANCH" 2>&1 \
  | sed 's#//[^@]*@#//***@#g'
