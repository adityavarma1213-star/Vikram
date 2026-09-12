# server/package-lock.json — provenance and status (#9 remediation)

**What this lockfile is:** the real, npm-generated `package-lock.json` (lockfileVersion 3, real
`registry.npmjs.org` URLs, real `sha512` integrity hashes — 100 resolved packages) that was
produced by an earlier, network-connected `npm install` of this exact server package. It was
recovered from `vikram-accumulation-scanner-changed-files_tar.gz` (one of the files attached
alongside the main ZIP) and copied in as-is. It was **not** hand-written or fabricated.

**Why it's still correct:** `server/package.json`'s dependency version ranges for `csv-parse`,
`express`, `pg` and `unzipper` are byte-for-byte identical between the snapshot that produced this
lockfile and the current `package.json` in this ZIP. A lockfile resolved against those exact
ranges is still valid evidence of a real, reproducible dependency tree for those four packages.

**What's missing:** `package.json` now also depends on `web-push@^3.6.7`, which did not exist when
this lockfile was generated. My environment for this task has no network access, so I cannot
resolve `web-push`'s real version/integrity/transitive-dependency data myself — doing so without
the registry would mean inventing hashes, which is exactly the kind of fabrication this
remediation explicitly forbids. I added `web-push` to the root manifest's `dependencies` (the
top-level mirror of `package.json`, not a resolved entry) so the intent is visible, but I did
**not** add a `node_modules/web-push` resolved entry.

**Consequence (by design, not a bug):** `npm ci` will currently fail fast with something like
`Missing: web-push@^3.6.7 from lock file`, rather than installing successfully. That is the
correct, safe behavior — it surfaces the gap loudly instead of silently installing an unverified
or invented package tree.

**To finish (one-time, needs network):**
```
cd server
npm install        # resolves web-push + its transitive deps and updates this lockfile in place
npm ci              # now verifies clean, reproducible install from the completed lockfile
npm test
npm run test:integration   # requires DATABASE_URL
```
After that one `npm install`, this lockfile is complete and `npm ci` becomes fully reproducible
going forward — no further manual edits should be needed unless dependencies change again.

**Status:** lockfile CREATED from real, non-fabricated data (COMPLETE for 4/5 dependencies).
`npm ci` / `npm test` execution: **NOT VERIFIED** — no network access in this environment, and one
dependency (`web-push`) still needs a single network-connected `npm install` to fully resolve.
