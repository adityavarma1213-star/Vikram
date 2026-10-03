# VIKRAM backend — Oracle Cloud Always Free deployment requirements

**Status: PLANNING DOCUMENT. Nothing in this file has been run on Oracle Cloud.**
No Oracle VM, hostname, IP, OCID, credential or connection string exists in this repository, and none
are invented here. Every `<placeholder>` below must be filled in by the operator.

**FREE-ONLY rule: no paid Oracle resource may be created without explicit written approval from the
owner. Read section 10 before creating anything in the Oracle console.**

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
(`dotfiles: 'deny'` in the `express.static` options) is now applied in `server/src/index.js` on the
`backend-oracle-hardening` branch. Tested locally on that code: `/.git/config` and `/.git/HEAD` went from
200 to 404, while `/`, `/index.html`, `/scanner`, `/robots.txt`, `/manifest.json` and `/api/health` stayed 200.
Note that `/server/*` and other non-dot paths are still served; the proxy block and the
deploy-without-`.git` advice above still apply.

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

Provisioning the VM, DNS, TLS issuance, PostgreSQL install and tuning, scheduling backups (cron/systemd
timer) and copying them off the VM (section 12 covers only the local dump/restore commands, tested on a
local machine, not on Oracle), monitoring, pointing the GitHub Pages mirror at the backend (`window.ACCUMULATION_API_BASE`;
`js/runtimeConfig.js` on `main` still defaults to the Render URL), and verifying NSE ingestion from the
VM. None of these was done or verified.

## 10. FREE-ONLY rule (cost guard)

This deployment must stay inside Oracle Cloud **Always Free** limits.

- **No paid Oracle resource may be created, upgraded or enabled without explicit approval from the owner.**
  This includes any non-Always-Free VM shape, extra block or boot volume, load balancer, paid database
  service, reserved public IP, extra bandwidth or storage tier, and any other billable service.
- **Do not convert the account to Pay As You Go (or any paid plan)** to avoid idle reclaim (section 11) or for
  any other reason, unless the owner explicitly approves it.
- Before creating any resource, check that the console marks it **Always Free eligible**. If it does not,
  or if the console shows any estimated cost, stop and ask the owner.
- Always Free limits are set by Oracle and can change. Check Oracle's current "Always Free Resources"
  page before provisioning; do not rely on numbers copied into this file.
- If a step in this document seems to need a paid resource, stop and report it instead of working around it.

## 11. Idle-reclaim warning

Oracle's documentation says idle Always Free compute instances **may be reclaimed by Oracle**. At the time of
writing, Oracle's "Always Free Resources" page describes an instance as idle if, over a 7-day period, all of
these are true: 95th-percentile CPU utilization is below 20%, network utilization is below 20%, and (A1 shapes
only) memory utilization is below 20%. Oracle has changed these thresholds before, so re-check the current page.

What this means here:

- This backend is a low-traffic API. Node idles around 80 MB RSS on an empty database (section 3), so the VM may
  look idle to Oracle. Nothing in this repository was tested against Oracle's idle check.
- **Treat the VM as disposable.** Keep an off-VM backup (section 12) so the service can be rebuilt on a new
  VM if the instance is stopped or reclaimed.
- Do not rely on Pay As You Go conversion to avoid reclaim (see section 10).
- Third-party "keep-alive" or CPU-burner scripts are not part of this plan. Do not install one without the
  owner's decision, because it runs arbitrary code on the VM and may break provider terms.
- Monitor the instance state in the console and plan to rebuild from backup if it is stopped.

## 12. Backups and restore (dump/restore tested locally; NOT tested on Oracle)

### 12.1 What was tested

Local test on Ubuntu 24.04 x86_64, PostgreSQL 16.15 (`pg_dump`/`pg_restore` 16.15), Node 22.22.2:

1. Schema created with the real `node server/src/migrate.js` (15 tables).
2. A user was created through the real `POST /api/auth/register` endpoint. The database also held rows in
   `cm_eod` (260), `saved_scans` (1), `scanner_matches_seen` (1) and `users` (3); the other 11 tables were
   empty. So empty-table restore is covered, but a large real data set was **not**.
3. Backup with the command in 12.2 (about 33 KB).
4. Restore into a **new empty** database with the command in 12.3: exit code 0.
5. Every one of the 15 tables was compared before and after (row count plus an MD5 of all rows): identical.
6. The server was started against the restored database: `GET /api/health` returned `database: connected`
   and the registered user logged in successfully with the same password (HTTP 200).
7. `node server/src/migrate.js` run on the restored database exited 0 and left the data identical.
8. Restoring the same dump into a database that already had the tables **failed with an error**
   (`relation ... already exists`), which is the safe outcome. Always restore into a new empty database.

Not tested: Oracle Cloud, arm64, large data volumes or timing, backup scheduling, copying a backup off the VM,
encrypted backups, restoring across PostgreSQL major versions.

### 12.2 Backup (run on the VM as the OS user that can reach the database)

    umask 077
    pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f /var/backups/vikram/vikram-$(date +%F).dump
    sha256sum /var/backups/vikram/vikram-$(date +%F).dump
    pg_restore --list /var/backups/vikram/vikram-$(date +%F).dump > /dev/null && echo "dump readable"

`-Fc` is the compressed custom format. `--no-owner --no-privileges` makes the dump restorable under a
different database user (the user name will differ on a new VM). The `/var/backups/vikram` directory is a
placeholder path; create it first with owner-only permissions.

### 12.3 Restore (always into a NEW, EMPTY database)

    createdb vikram_restore
    pg_restore --exit-on-error --no-owner --no-privileges -d "<restore database url>" /path/to/vikram-YYYY-MM-DD.dump
    DATABASE_URL="<restore database url>" node server/src/migrate.js     # safe and idempotent
    # then point the service at the restored database and check GET /api/health

Compare the SHA-256 from 12.2 with the copy you are restoring before you start. Do the restore test again on
the real VM before relying on it.

### 12.4 Backup considerations

- **The dump contains user data**: account emails, password hashes and push subscriptions. Treat it as
  secret. Keep permissions owner-only. **This repository is public: never commit a dump or an env file.**
- A database dump does **not** contain `AUTH_SECRET`, `DATABASE_URL` or other environment values. Keep a
  separate, private copy of the env file (for example `/etc/vikram/server.env`). Losing `AUTH_SECRET`
  does not lose accounts, but existing login tokens become invalid if it changes.
- **Keep at least one copy off the VM** (for example your own computer). A backup that lives only on the VM
  is lost if the VM is reclaimed or deleted (section 11). Any off-VM storage service must itself be free
  or already approved by the owner (section 10); its free limits were not verified here.
- Restore with the same or a newer PostgreSQL major version than the one that made the dump. Do not restore
  a newer dump into an older server.
- Schedule backups only after the manual backup and restore have worked on the real VM. Check that old dumps
  are pruned so the free boot volume does not fill up (disk size limits are not verified here).
- Re-run a restore test regularly. A backup that was never restored is not proven.
- Data that can be re-fetched (NSE bhavcopy ingestion) is lower priority than user accounts, saved scans and
  alert settings, but re-ingestion time and NSE availability were not measured.
