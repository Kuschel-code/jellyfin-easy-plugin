#!/bin/bash
# PreToolUse(Bash): keep build and test output out of the context window.
#
# Whatever a run prints stays in context for the rest of the session and is re-read on every
# later turn, so one noisy build is paid for many times over. This keeps only the lines the
# outcome depends on: errors, warnings, failed tests, assertion detail, the summary — plus
# the plugin's own DLL-size report, which is the point of running the Release build here.
#
# Passes through untouched when the caller already shaped the output (pipe, redirect,
# explicit --logger/--verbosity/-q), so "show me everything" still works.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

passthrough() { echo '{}'; exit 0; }

[ -n "$cmd" ] || passthrough
case "$cmd" in
  dotnet\ test*|dotnet\ build*|npm\ test*|npm\ run\ test*|node\ --test*) ;;
  *) passthrough ;;
esac
case "$cmd" in
  *\|*|*'>'*|*--logger*|*--verbosity*|*\ -v\ *|*\ -q*|*--quiet*) passthrough ;;
esac

# MSBuild/xUnit and node --test failure vocabulary, plus the EpCheckSize line.
keep='error|warning|[Ff]ailed|FAILED|not ok |^# (fail|pass)|Passed!|Failed!|Skipped!|Assert|Expected:|Actual:|expected:|^\s+at .*\.cs:line|Easy Plugin: .* bytes'

wrapped="_o=\$(mktemp); $cmd > \"\$_o\" 2>&1; _rc=\$?; grep -aE '$keep' \"\$_o\" | head -120; \
echo \"--- filtered by .claude/hooks/filter-build-output.sh · \$(wc -l < \"\$_o\") lines total · exit \$_rc ---\"; \
rm -f \"\$_o\"; exit \$_rc"

jq -n --arg c "$wrapped" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: { command: $c }
  }
}'
