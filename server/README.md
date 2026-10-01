# Cliffside Cottage — booking API

Plain Node, zero dependencies. Receives the website's booking form and sends two
emails through Resend: the request to Isaac, and a confirmation to the guest.

## Deploy

Point any Docker-capable host (Coolify, Dokploy, Railway, Render, Fly) at this
repo with `server/` as the build context. There is a `Dockerfile` — nothing else
to configure.

Then set one environment variable:

| Variable | Required | Default |
|---|---|---|
| `RESEND_API_KEY` | **yes** | — |
| `HOST_EMAIL` | no | `pfeifferisaac@gmail.com` |
| `FROM_EMAIL` | no | `Cliffside Cottage <pfeiffer@airoxlab.com>` |
| `PORT` | no | `3000` |
| `ALLOWED_ORIGIN` | no | the live site + github.io |

`FROM_EMAIL` must be on a Resend-verified domain. `airoxlab.com` is verified.

**Never put the Resend key in the website's HTML or JavaScript.** It only ever
lives as an environment variable on the server — that is the entire reason this
service exists instead of calling Resend from the browser.

## Verify

    curl https://<your-api-host>/api/health
    # {"ok":true,"configured":true}

`configured: false` means `RESEND_API_KEY` never reached the process.

## Routing

The website posts to `/api/booking` on its own origin, so the API must be
reachable at `/api/` on `pfeiffer-stay-cliffside-cottage.airoxlab.com`. Either
proxy `/api/` to this container, or deploy the API on its own hostname and
update the `action` in `index.html` to the full URL.

## Endpoints

- `POST /api/booking` — JSON: `name`, `phone`, `email`, `checkin`, `checkout`,
  `guests`, `occasion`, `message`, plus a `website` honeypot. Returns
  `{"ok":true}` or `{"error":"..."}`.
- `GET /api/health` — `{"ok":true,"configured":true|false}`

## Already handled

Server-side required-field and email validation, hidden honeypot (bot
submissions are silently accepted and discarded), 20 KB body cap and 2,000
character field cap, CORS limited to the site's origins, and all guest input
HTML-escaped before it enters the email template.

If the API is unreachable the form falls back to opening the guest's own mail
app with the details pre-filled, and tells them so. Enquiries are never
silently lost.

See `DEPLOY.md` for the manual systemd + nginx route on a bare server.
