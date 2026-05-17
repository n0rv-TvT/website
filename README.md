# U&U Movers Website

Static marketing pages with a small Node backend for quote requests.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Production Deployment

Run Node behind a reverse proxy. The included examples are:

- `deploy/Caddyfile`: HTTPS, compression, static file serving, sensitive path blocking, and `/api/*` proxying.
- `deploy/nginx.conf`: HTTPS redirect, static asset caching, sensitive path blocking, gzip, and `/api/` proxying.
- `ecosystem.config.cjs`: PM2 process config for keeping the Node backend alive.

Typical PM2 flow:

```bash
npm install --omit=dev
cp .env.example .env
npm run pm2:start
```

Use the proxy to serve only public static files and forward only `/api/` to `127.0.0.1:3000`. The safest deployment is to copy only `index.html`, `services.html`, `faq.html`, `admin.html`, `privacy.html`, `terms.html`, `styles.css`, `app.js`, and `assets/` into the public web root.

If Node is behind Nginx, Caddy, or another trusted proxy, set `TRUSTED_PROXY_IPS` in `.env` to the proxy IPs allowed to supply `X-Forwarded-For`. Leave it empty when Node is directly exposed.

The Node server also sets baseline security headers directly for local and fallback deployments: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy`.

The Node static server only serves `index.html`, `services.html`, `faq.html`, `admin.html`, `privacy.html`, `terms.html`, `styles.css`, `app.js`, and files under `/assets/`. It intentionally does not serve `.env`, database files, backend source, package files, deployment configs, scripts, backups, logs, or `node_modules`.

## Spam Protection

Cloudflare Turnstile is optional. If `TURNSTILE_SECRET_KEY` is configured, quote requests must include a valid Turnstile token. Set both values in `.env`:

```bash
PUBLIC_TURNSTILE_SITE_KEY=your_public_site_key
TURNSTILE_SECRET_KEY=your_private_secret_key
```

If these values are empty, the quote form still works with honeypot and rate-limit protections.

## Quote Requests

The form posts to `POST /api/quotes`. Requests are saved in SQLite at `data/quotes.sqlite`.

SQLite uses WAL mode and a `busy_timeout` for better low-to-medium traffic behavior. Back up `data/quotes.sqlite` and related WAL files regularly, for example with a daily cron job.

To view saved requests in the browser, open `http://localhost:3000/admin.html` and sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`. If `ADMIN_PASSWORD` is empty, the browser login uses `ADMIN_TOKEN` as the password. Use HTTPS in production because browser admin access sends Basic credentials to `/api/quotes`.

`ADMIN_TOKEN` is still accepted as a bearer token for scripts or automation:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/quotes
```

Credential-based API access also works:

```bash
curl -u "admin:YOUR_PASSWORD" http://localhost:3000/api/quotes
```

## Backups

Create a consistent SQLite backup with:

```bash
npm run backup
```

Optional backup variables:

```bash
BACKUP_DIR=backups
BACKUP_RETENTION=14
AWS_S3_BACKUP_URI=s3://your-bucket/uu-movers/
```

If `AWS_S3_BACKUP_URI` is set, the script uses the AWS CLI to upload the backup. Example cron entry:

```bash
15 2 * * * cd /var/www/uu-movers && npm run backup >> logs/backup.log 2>&1
```

## Email Notifications

Copy `.env.example` to `.env` and set the SMTP values. If SMTP is not configured, quote requests are still saved to SQLite, but no email is sent.

Required email variables:

```bash
QUOTE_NOTIFY_EMAIL=owner@example.com
QUOTE_FROM_EMAIL=website@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=website@example.com
SMTP_PASS=replace-with-smtp-password
```

## Pages

- `index.html`: concise homepage and quote form
- `services.html`: complete service catalog
- `faq.html`: FAQ categories
- `admin.html`: quote request dashboard
- `privacy.html`: privacy policy
- `terms.html`: website terms

## Logs

The server writes structured JSON logs to stdout/stderr. PM2 can persist these into `logs/output.log` and `logs/error.log` using `ecosystem.config.cjs`.
