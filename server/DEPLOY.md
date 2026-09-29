# Booking API — deploy notes

The site posts booking requests to `/api/booking`. This small Node service
receives them and sends two emails through Resend:

1. **To Isaac** — the booking request, with reply-to set to the guest.
2. **To the guest** — a confirmation that the request arrived.

No dependencies, no database. Node 18+ only.

---

## Where it needs to run

`pfeiffer-stay-cliffside-cottage.airoxlab.com` is served by nginx on
**46.250.224.153**, so the API should run on that same box and be proxied at
`/api/`. Same origin means no CORS complications and nothing else to configure.

## 1. Copy the folder up

```bash
scp -r server/ youruser@46.250.224.153:/opt/cliffside-booking
```

## 2. Run it as a service

Create `/etc/systemd/system/cliffside-booking.service`:

```ini
[Unit]
Description=Cliffside Cottage booking API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/cliffside-booking
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=PORT=3021
Environment=RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
Environment=HOST_EMAIL=pfeifferisaac@gmail.com
Environment=FROM_EMAIL=Cliffside Cottage <pfeiffer@airoxlab.com>
Environment=ALLOWED_ORIGIN=https://pfeiffer-stay-cliffside-cottage.airoxlab.com

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cliffside-booking
sudo systemctl status cliffside-booking
```

**Put the real Resend key in `RESEND_API_KEY`.** It must never appear in the
website's HTML or JavaScript — anyone could read it there and send mail as
the domain. It only ever lives on the server.

## 3. Proxy `/api/` in nginx

In the `server { }` block for the site:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3021;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Check it

```bash
curl https://pfeiffer-stay-cliffside-cottage.airoxlab.com/api/health
# {"ok":true,"configured":true}
```

`configured: false` means `RESEND_API_KEY` did not reach the process.

Then submit the real form once and confirm both emails arrive.

---

## Environment variables

| Variable | Required | Default |
|---|---|---|
| `RESEND_API_KEY` | **yes** | — |
| `HOST_EMAIL` | no | `pfeifferisaac@gmail.com` |
| `FROM_EMAIL` | no | `Cliffside Cottage <pfeiffer@airoxlab.com>` |
| `PORT` | no | `3000` |
| `ALLOWED_ORIGIN` | no | the custom domain + `airoxlab.github.io` |

`FROM_EMAIL` must stay on a domain verified in Resend. `airoxlab.com` is
verified; a different domain would need verifying first.

## If the API is down

The form falls back to opening the guest's own mail app with the details
pre-filled, and tells them so. Enquiries are never silently lost — but
Resend sending is the path that actually works without guest effort, so
keep an eye on the service.

## Endpoints

- `POST /api/booking` — JSON body: `name`, `phone`, `email`, `checkin`,
  `checkout`, `guests`, `occasion`, `message`, plus a `website` honeypot.
  Returns `{"ok":true}` or `{"error":"..."}`.
- `GET /api/health` — liveness and whether the key is configured.

## Protections already in place

- Required fields and email format validated server-side, not just in the browser.
- Hidden `website` honeypot field — bots fill it, humans never see it; those
  submissions are silently accepted and discarded.
- Request bodies capped at 20 KB and each field at 2,000 characters.
- CORS limited to the site's own origins.
- All guest input HTML-escaped before it goes into an email template.
