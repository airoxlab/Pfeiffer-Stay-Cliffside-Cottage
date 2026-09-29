/* Cliffside Cottage — booking request endpoint.
 *
 * Accepts POST /api/booking from the website form and sends two emails
 * through Resend: the booking request to the host, and a confirmation
 * to the guest.
 *
 * No dependencies — Node 18+ only (uses built-in fetch).
 *
 * Environment:
 *   RESEND_API_KEY   required   Resend API key
 *   HOST_EMAIL       optional   where bookings go   (default pfeifferisaac@gmail.com)
 *   FROM_EMAIL       optional   verified sender     (default Cliffside Cottage <pfeiffer@airoxlab.com>)
 *   PORT             optional   listen port         (default 3000)
 *   ALLOWED_ORIGIN   optional   CORS origin allow-list, comma separated
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const HOST_EMAIL = process.env.HOST_EMAIL || 'pfeifferisaac@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Cliffside Cottage <pfeiffer@airoxlab.com>';
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN ||
  'https://pfeiffer-stay-cliffside-cottage.airoxlab.com,https://airoxlab.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);

const PHONE = '+1 419-544-0969';
const COTTAGE = '561 Cliffside Dr, Mansfield, OH 44904';

/* ---------- helpers ---------- */

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function prettyDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function nights(a, b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b || '')) return null;
  const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  const n = Math.round(ms / 86400000);
  return n > 0 ? n : null;
}

function send(res, status, obj, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

/* ---------- email templates ---------- */

const SHELL = (title, preheader, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EFE8D8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE8D8;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFDF6;border:1px solid #DFD6C1;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
${inner}
<tr><td style="background:#EFE8D8;padding:18px 28px;border-top:1px solid #DFD6C1;font-size:12px;line-height:1.6;color:#6F6A5E;text-align:center">
Cliffside Cottage &middot; Pfeiffer Stay Co. LLC<br>
${esc(COTTAGE)} &middot; <a href="tel:+14195440969" style="color:#2E6B4F;text-decoration:none">${esc(PHONE)}</a>
</td></tr>
</table></td></tr></table></body></html>`;

const HEADER = subtitle => `<tr><td style="background:#2E6B4F;padding:22px 28px">
<div style="font-size:19px;font-weight:700;color:#FFFDF6;letter-spacing:-0.01em">Cliffside Cottage</div>
<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B0D8C4;margin-top:3px">${esc(subtitle)}</div>
</td></tr>`;

function row(label, value, accent) {
  if (!value) return '';
  return `<tr>
<td style="padding:9px 0;border-bottom:1px solid #EFE8D8;font-size:13px;color:#6F6A5E;width:38%;vertical-align:top">${esc(label)}</td>
<td style="padding:9px 0;border-bottom:1px solid #EFE8D8;font-size:15px;color:${accent ? '#9E2B25' : '#2C2A24'};font-weight:${accent ? '700' : '500'};vertical-align:top">${esc(value)}</td>
</tr>`;
}

function hostEmail(d) {
  const n = nights(d.checkin, d.checkout);
  const stay = n ? `${n} night${n === 1 ? '' : 's'}` : '';
  const inner = `${HEADER('New booking request')}
<tr><td style="padding:26px 28px 6px">
<p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1D4735">${esc(d.name)} wants to book</p>
<p style="margin:0;font-size:15px;color:#6F6A5E">${esc(prettyDate(d.checkin))} &rarr; ${esc(prettyDate(d.checkout))}${stay ? ' &middot; ' + esc(stay) : ''}</p>
</td></tr>
<tr><td style="padding:14px 28px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Check-in', prettyDate(d.checkin), true)}
${row('Check-out', prettyDate(d.checkout), true)}
${row('Nights', stay)}
${row('Guests', d.guests)}
${row('Occasion', d.occasion)}
${row('Phone', d.phone)}
${row('Email', d.email)}
</table></td></tr>
${d.message ? `<tr><td style="padding:14px 28px 0">
<div style="font-size:13px;color:#6F6A5E;margin-bottom:6px">Their message</div>
<div style="background:#F8F4EA;border-left:3px solid #2E6B4F;border-radius:0 8px 8px 0;padding:13px 15px;font-size:15px;color:#2C2A24;line-height:1.6">${esc(d.message).replace(/\n/g, '<br>')}</div>
</td></tr>` : ''}
<tr><td style="padding:22px 28px 26px">
<a href="mailto:${esc(d.email)}?subject=${encodeURIComponent('Re: your Cliffside Cottage booking request')}" style="background:#9E2B25;color:#FFFDF6;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px;display:inline-block">Reply to ${esc(d.name.split(' ')[0])}</a>
<a href="tel:${esc((d.phone || '').replace(/[^\d+]/g, ''))}" style="color:#2E6B4F;text-decoration:none;font-weight:600;font-size:15px;padding:12px 10px;display:inline-block">Or call them</a>
</td></tr>`;
  return SHELL('New booking request', `${d.name} — ${prettyDate(d.checkin)}`, inner);
}

function guestEmail(d) {
  const n = nights(d.checkin, d.checkout);
  const stay = n ? `${n} night${n === 1 ? '' : 's'}` : '';
  const inner = `${HEADER('Request received')}
<tr><td style="padding:26px 28px 6px">
<p style="margin:0 0 10px;font-size:20px;font-weight:700;color:#1D4735">Thanks, ${esc(d.name.split(' ')[0])} &mdash; we've got your request.</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#2C2A24">We'll come straight back to you to confirm availability and the rate. If you need us sooner, call or text <a href="tel:+14195440969" style="color:#9E2B25;font-weight:600;text-decoration:none">${esc(PHONE)}</a> any hour.</p>
</td></tr>
<tr><td style="padding:18px 28px 4px">
<div style="font-size:13px;color:#6F6A5E;margin-bottom:8px">What you asked for</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Check-in', prettyDate(d.checkin), true)}
${row('Check-out', prettyDate(d.checkout), true)}
${row('Nights', stay)}
${row('Guests', d.guests)}
${row('Occasion', d.occasion)}
</table></td></tr>
<tr><td style="padding:20px 28px 26px">
<div style="background:#F8F4EA;border:1px solid #DFD6C1;border-radius:10px;padding:15px 17px">
<div style="font-size:14px;font-weight:700;color:#1D4735;margin-bottom:5px">The cottage</div>
<div style="font-size:14px;line-height:1.6;color:#6F6A5E">${esc(COTTAGE)}<br>
Hot tub, full-size pool table, foosball, cornhole and 45+ board games &mdash; minutes from Mohican, Malabar Farm, Mid-Ohio and the Reformatory.</div>
</div></td></tr>`;
  return SHELL('We received your booking request', `We'll confirm your ${prettyDate(d.checkin)} dates shortly`, inner);
}

/* ---------- Resend ---------- */

async function sendMail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

/* ---------- server ---------- */

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const allowed = origin && ALLOWED_ORIGIN.includes(origin) ? origin : null;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowed || ALLOWED_ORIGIN[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    });
    return res.end();
  }

  if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health')) {
    return send(res, 200, { ok: true, configured: Boolean(RESEND_API_KEY) }, allowed);
  }

  if (req.method !== 'POST' || !req.url.startsWith('/api/booking')) {
    return send(res, 404, { error: 'Not found' }, allowed);
  }

  let raw = '';
  let tooBig = false;
  req.on('data', c => {
    raw += c;
    if (raw.length > 20000) { tooBig = true; req.destroy(); }
  });

  req.on('end', async () => {
    if (tooBig) return send(res, 413, { error: 'Too large' }, allowed);

    let d;
    try { d = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }, allowed); }

    // Honeypot: real guests never fill this hidden field.
    if (d.website) return send(res, 200, { ok: true }, allowed);

    const clean = v => String(v == null ? '' : v).trim().slice(0, 2000);
    const data = {
      name: clean(d.name), phone: clean(d.phone), email: clean(d.email),
      checkin: clean(d.checkin), checkout: clean(d.checkout),
      guests: clean(d.guests), occasion: clean(d.occasion), message: clean(d.message),
    };

    const missing = ['name', 'phone', 'email', 'checkin', 'checkout'].filter(k => !data[k]);
    if (missing.length) return send(res, 400, { error: 'Missing: ' + missing.join(', ') }, allowed);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
      return send(res, 400, { error: 'That email address does not look right.' }, allowed);
    }
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set');
      return send(res, 500, { error: 'Email is not configured on the server.' }, allowed);
    }

    try {
      await sendMail({
        from: FROM_EMAIL,
        to: [HOST_EMAIL],
        reply_to: data.email,
        subject: `Booking request — ${prettyDate(data.checkin)} — ${data.name}`,
        html: hostEmail(data),
      });

      // Guest confirmation is a courtesy: never fail the request over it.
      try {
        await sendMail({
          from: FROM_EMAIL,
          to: [data.email],
          reply_to: HOST_EMAIL,
          subject: 'We received your Cliffside Cottage booking request',
          html: guestEmail(data),
        });
      } catch (e) {
        console.error('guest confirmation failed:', e.message);
      }

      return send(res, 200, { ok: true }, allowed);
    } catch (e) {
      console.error('booking send failed:', e.message);
      return send(res, 502, { error: 'Could not send right now. Please call or text us.' }, allowed);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Cliffside Cottage booking API on :${PORT}`);
  if (!RESEND_API_KEY) console.warn('WARNING: RESEND_API_KEY not set — sends will fail.');
});
