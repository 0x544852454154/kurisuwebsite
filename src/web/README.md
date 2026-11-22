# Kurisu Security - website

`index.html` at the project root is the whole site (one file, no build step). It can
be dropped on any static host as-is.

The hero numbers - users, communities and the server list - are filled from the
bot's live Discord data instead of placeholders.

## Live counts (one process)

```powershell
npm run web
```

`web.js` starts the bot and a small HTTP server on the same client:

| Route | What it returns |
| --- | --- |
| `GET /` | `index.html` |
| `GET /api/stats` | `{ users, communities, servers, ready, updated }` |
| `GET /healthz` | `{ ok, ready }` |

The page calls `/api/stats` on load and again every 60 seconds, so the counts update
as servers are added or members join. If the endpoint is missing (static hosting,
or `node index.js` without `SERVE_WEB=true`), the page keeps its placeholders
instead of showing zeros.

Environment variables:

- `WEB_PORT` - port for the site (default `8080`).
- `PORT` - overrides `WEB_PORT`; hosting panels such as Pterodactyl set it.
- `SERVE_WEB=true` - serve the site from the normal `node index.js` start too.
