# VIKRAM backend — Oracle Cloud Always Free deployment requirements

**Status: PLANNING DOCUMENT. Nothing in this file has been run on Oracle Cloud.**
No Oracle VM, hostname, IP, OCID, credential or connection string exists in this repository, and none
are invented here. Every `<placeholder>` below must be filled in by the operator.

## 1. What was and was not verified

Verified locally (Ubuntu 24.04 x86_64 container, Node 22.22.2, PostgreSQL 16.15, empty database):

- `node server/src/migrate.js` succeeds and is idempotent (run twice, exit 0, 15 tables).
- `npm start` (migrate, then server) starts; `GET /api/health` returns `database: connected`.
- `POST /api/auth/register` and `/api/auth/login` return tokens.
- Server exits with a clear message when `DATABASE_URL` or `AUTH_SECRET` (>=16 chars) is missing.
- Tests on unmodified `main` (commit f224b18): the 28 unit tests in `npm test` give 26 pass, 2 fail
  (`researchStatic.test.js`, `bhavcopyDateNormalization.test.js`: historical-data date checks);
  the 5 DB-backed tests in `npm run test:integration` give 4 pass, 1 fail (`integration.test.js`,
  a `derivativesSupported` metric assertion). These failures pre-date this document and are unrelated to hosting.

NOT verified: anything on Oracle Cloud, arm64, real NSE ingestion, real data volumes, systemd,
Caddy/nginx, firewall rules, backups, or production load. Do not treat a local pass as a deployment.

## 2. Oracle vs PostgreSQL

The backend uses **PostgreSQL** through the `pg` library (`server/package.json`). It has no Oracle
Database driver, no OCI SDK and no Oracle-specific configuration. "Oracle" here means only the
*hosting provider* (an Always Free VM). PostgreSQL runs on the same VM as the Node process.

## 3. Requirements

| Item | Requirement | Basis |
|---|---|---|
| OS | Any Linux that runs Node 20+ and PostgreSQL. Ubuntu 22.04/24.04 recommended (tested on 24.04 only). | `server/package.json` `engines.node >=20`; local test |
| Node.js | >= 20 (tested 22.22.2) | `engines` field |
| PostgreSQL | Tested 16.15. Minimum version not determined. | local test |
| Native builds | None. No `.node` addons in `server/node_modules`; runs the same on x86_64 and arm64 in principle (arm64 untested). | `find -name '*.node'` |
| RAM | Node idle RSS about 80 MB with an EMPTY database. Real-data memory not measured. | local measurement |
| Disk | Working tree about 335 MB (excluding `.git`, `node_modules`) + about 10 MB `node_modules` + database (real size not measured). | `du` |
| CPU | Not measured under load. | n/a |

Always Free shapes: Oracle's documentation lists `VM.Standard.E2.1.Micro` (AMD, up to two per tenancy;
1/8 OCPU, 1 GB RAM per third-party descriptions) and `VM.Standard.A1.Flex` (Arm). Sources disagree on
the current A1 allowance (Oracle's docs page shows 3,000 OCPU-hours and 18,000 GB-hours per month; one
third-party page says it drops to half from June 2026). **Check the OCI console under Limits, Quotas and
Usage before sizing.** 1 GB RAM shared by Node and PostgreSQL is tight; if the Micro shape is used, add
swap and measure with real data first.

## 4. Network, ports and firewall

| Port | Purpose | Exposure |
|---|---|---|
| 3000 (or `PORT`) | Node/Express | Bind behind the reverse proxy; do not open publicly if a proxy is used |
| 5432 | PostgreSQL | **localhost only**; never open in the VCN security list |
| 80 / 443 | Reverse proxy (HTTP/HTTPS) | Public |
| 22 | SSH | Restrict source CIDR where possible |

Two independent firewall layers must both allow traffic (Oracle documentation and tutorials):
1. OCI VCN Security List or Network Security Group: add ingress rules for 80/443.
2. The instance OS firewall. Oracle-provided Ubuntu images use iptables rules in
   `/etc/iptables/rules.v4` that end in a REJECT rule; new ACCEPT rules must be inserted **before** it.

## 5. Reverse proxy

Not required for the app to run. **Required in practice for HTTPS**: if the frontend is served from
GitHub Pages (an `https://` page), browsers block calls to a plain `http://` backend (mixed content), so
the backend needs a browser-trusted certificate, which needs a domain name (not a bare IP).

Code facts (grep of `server/src`): no `trust proxy` setting, no use of `req.ip`, `x-forwarded-*`,
`req.protocol` or `req.secure`, so no proxy-specific app configuration is needed. Auth is a Bearer
token in the `Authorization` header (no cookies). The API has **no inbound request rate limiting** (only outbound NSE throttling in ingestion); apply it at the
proxy if needed.

### Security finding: static file exposure (verified locally)

`server/src/index.js` serves the whole repository root with `express.static`. On Express 4.22.2 /
send 0.19.2 only the final path segment is checked for dotfiles, so with a `git clone` deployment:

    GET /.git/config  -> 200   (served)
    GET /.git/HEAD    -> 200   (served)
    GET /.env.example -> 404
    GET /server/src/auth.js, /server/package.json, /data/*.json -> 200

If the clone's remote URL embeds a token, `/.git/config` would leak it. Mitigate **without code
changes** by (a) deploying without `.git` (`git archive` or rsync with `--exclude .git`) and (b)
blocking these paths at the proxy (template in section 8). Keep secrets outside the repository
directory (e.g. `/etc/vikram/server.env`). A one-line code hardening
(`dotfiles: 'deny'` in the `express.static` options) was tested in isolation and returns 404 for
`/.git/config`; it is proposed separately and is NOT part of this change.

## 6. Environment variables (read by `server/src`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | `postgres://<user>:<url-encoded-password>@127.0.0.1:5432/<dbname>`. Percent-encode special characters in the password. |
| `AUTH_SECRET` | Yes | At least 16 characters (enforced in `server/src/index.js`). Use a random value, e.g. `openssl rand -hex 32`. Changing it invalidates all sessions. |
| `PORT` | No | Default 3000 |
| `ADMIN_EMAILS` | For admin routes | Comma-separated, case-insensitive. If unset, admin ingestion routes return 503 (fails closed). |
| `CORS_ALLOWED_ORIGIN` | If frontend is on another origin | Single exact origin; default `https://adityavarma1213-star.github.io`. Never `*`. |
| `LIVE_MARKET_DATA_ENABLED`, `INDSTOCKS_*` | No | Live-data provider; disabled by default |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM` | No | Email alerts |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` | No | Web push |
| `VIKRAM_PUBLIC_URL`, `BACKFILL_CALENDAR_DAYS` | No | See `server/src` |

SSL: the pool enables SSL only if `DATABASE_URL` contains `sslmode=require`, and then with
`rejectUnauthorized:false` (certificate not verified). For same-VM PostgreSQL leave `sslmode` out.

## 7. Commands (all relative to the repository root on the VM)

    cd server && npm ci                       # install (uses package-lock.json)
    node src/migrate.js                       # migration (idempotent; verified)
    npm start                                 # = node src/migrate.js && node src/index.js
    node src/migrate.js && node src/ingest.js # EOD ingestion (one run)

Constraints: the server needs the **whole checkout**, not only `server/`. It `require`s
`../../accumulation/*` and `../../hiddenGems/*`, reads `data/researchIntelligence.json`,
`data/market-history/`, `data/nse-coverage-report.json` and `backtest/REAL_1YEAR_BACKTEST_RESULT.json`,
and serves the frontend from the repo root. `ingest.js` writes raw files to `data/raw-archive/`, so the
service user needs write access to the checkout's `data/` directory.
The existing schedule in `render.yaml` is `30 13 * * 1-5`. On a VM, cron uses the system timezone;
confirm with `timedatectl` and set the schedule explicitly (that Render schedule is assumed to be UTC;
not verified).

## 8. Templates (UNTESTED on Oracle; replace placeholders)

`/etc/systemd/system/vikram.service`

    [Unit]
    Description=VIKRAM API
    After=network.target postgresql.service

    [Service]
    User=<service-user>
    WorkingDirectory=<checkout>/server
    EnvironmentFile=/etc/vikram/server.env
    ExecStartPre=/usr/bin/node src/migrate.js
    ExecStart=/usr/bin/node src/index.js
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target

`/etc/vikram/server.env` (mode 600, owned by root; no quotes, no spaces around `=`)

    DATABASE_URL=postgres://<user>:<encoded-password>@127.0.0.1:5432/<dbname>
    AUTH_SECRET=<random, >=16 chars>
    ADMIN_EMAILS=<admin email>
    PORT=3000

Ingestion cron (service user)

    30 13 * * 1-5 cd <checkout>/server && set -a && . /etc/vikram/server.env && set +a && /usr/bin/node src/migrate.js && /usr/bin/node src/ingest.js >> <log-path> 2>&1

Caddy (requires a real domain name)

    <your-domain> {
        @blocked path /.git* /server/* /node_modules/*
        respond @blocked 404
        reverse_proxy 127.0.0.1:3000
    }

(No frontend code in this repository fetches `/server/`, `/.git` or `/node_modules` paths; this
was checked by grep.)

## 9. Not covered / still manual

Provisioning the VM, DNS, TLS issuance, PostgreSQL install and tuning, `pg_dump` backups and restore
tests, monitoring, pointing the GitHub Pages mirror at the backend (`window.ACCUMULATION_API_BASE`;
`js/runtimeConfig.js` on `main` still defaults to the Render URL), and verifying NSE ingestion from the
VM. None of these was done or verified.
