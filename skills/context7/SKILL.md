---
name: context7
description: Pull current library documentation with ctx7 (Context7). Use when an API may have changed since training data, when targeting a specific library version, or before writing code against an unfamiliar framework.
---

# Library docs via ctx7

Two steps — resolve the library id, then query its docs. Both take the key
from the secret file and emit JSON:

```sh
export CTX7_TELEMETRY_DISABLED=1
CONTEXT7_API_KEY="$(cat "$CONTEXT7_API_KEY_FILE")" \
  ctx7 library nextjs "app router middleware" --json | jq -r '.[0].id'
CONTEXT7_API_KEY="$(cat "$CONTEXT7_API_KEY_FILE")" \
  ctx7 docs /vercel/next.js "how to redirect unauthenticated users in middleware" --json
```

## Steps

1. Resolve: `ctx7 library <name> [query] --json` and pick the `.id` from the
   results (e.g. `/vercel/next.js`). When the task targets a specific release,
   use the versioned id (e.g. `/vercel/next.js/v14.3.0-canary.87`).
2. Query: `ctx7 docs <libraryId> "<question>" --json` returns snippet-ranked,
   version-pinned documentation for that exact id.
3. Done when the snippets settle the API question. Refine the query wording
   before switching libraries; a vague query outranks a wrong library.

## Reference

- Auth: `$CONTEXT7_API_KEY_FILE` holds a `ctx7sk_...` key. The key raises
  rate limits; unauthenticated calls work but throttle quickly. Interactive
  setup flows (`ctx7 login --no-browser`, `ctx7 setup`) exist; headless use
  needs only the env key.
- REST fallback against the same index:
  `GET https://context7.com/api/v2/libs/search?query=<name>` and
  `GET https://context7.com/api/v2/context?libraryId=<id>&query=<q>` with
  `Authorization: Bearer $CONTEXT7_API_KEY`.
- Reach for ctx7 before scraping vendor docs sites: the results carry the
  version pin explicitly, which scraped HTML does not.
