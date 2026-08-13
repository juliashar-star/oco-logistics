# OCO Logistics — working rules

Read this before doing anything in this repository. It is binding.

## What this is

OCO is a logistics orchestration platform for Russian e-commerce sellers. **Model F:** the seller
connects THEIR OWN carrier accounts (CDEK, Yandex Delivery, Почта, …) and OCO acts inside those
accounts on the seller's behalf. OCO signs no carrier contracts and touches no delivery money.
Yandex Delivery and CDEK are connected today; more carriers are coming, so nothing may couple the
neutral contract or the UI to one carrier.

The project documents live in `docs/` — `master-plan.md`, `DECISIONS.md`, `ROADMAP.md` and the
canon files. Read them from the repository; do not restate their content here, because a second copy
rots.

**But do not treat them as automatically current.** A documentation rewrite is unfinished:
`ARCHITECTURE.md`, `GLOSSARY.md` and `DATABASE.md` were brought in line with the current model;
`PRD.md`, `USER_STORIES.md`, `NONFUNCTIONAL.md`, `DECISION_ENGINE.md` and the older specs were not,
and still describe an earlier aggregator-style design. **The code is the source of truth for how the
system behaves.** `docs/DECISIONS.md` is authoritative for decisions and is **append-only** — never
restructure it; note that it carries two layers, dated ADR headings and earlier undated journal
bullets, and both are binding.

**When a document and the code disagree, trust the code and say so explicitly in your report.** Do
not silently follow either one.

## Priority order — weigh every decision against these three, in this order

1. **IT security.**
2. **Legal safety** (152-ФЗ, personal data, carrier contract terms).
3. **Usefulness to the seller.**

Efficiency and elegance come after all three.

## Hard prohibitions

- **Never modify `.env` or any environment file.** It has repeatedly lost keys. If a variable is
  missing, say so and stop.
- **Never print, echo or copy a secret value** — anything from `.env`, a token, a password, a
  decrypted credential — into the chat, a log line, a test fixture, an error message or a commit.
  You can read these files; that is not permission to reproduce what is in them. Report the NAME of
  a variable and whether it is set, never its value.
- **Never create, modify or cancel anything in a production carrier account.** Sandboxes only:
  `CDEK_BASE_URL` must be `https://api.edu.cdek.ru`, `YANDEX_DELIVERY_BASE_URL` must be the tst host.
  Print the resolved base URL before any call that writes, and stop if it is not a sandbox.
- **Never commit or push without explicit approval** for that specific commit.
- **Never start a long-running process** (`npm run dev`, watch modes) unless asked. It never returns
  and looks like a hang. If a change needs a browser check, SAY SO — the human does browser checks.
- **Never invent a fact.** If a carrier's behaviour, field or status code has not been measured or
  read from official documentation, say "not measured" and propose a probe. A guessed API shape is
  worse than an admitted gap.
- **Never put provider response bodies into error messages or into anything stored.** They echo
  submitted fields and can contain the recipient's name, phone and address. Errors carry the HTTP
  status or a code-like string, never the body.
- **Never send a carrier's internal provider key to the browser.** Carrier names shown to a seller
  are masked and resolved server-side.

## How to work

**One task, one thin slice.** A slice changes one thing and can be reviewed in a few minutes. If a
task needs a schema change plus a service plus UI, that is three slices, and the migration goes alone
so a rollback is cheap.

**Spec-first.** Before writing code for anything non-trivial: read the relevant files, report what
you found, and state the design. Then implement. **The reporting is not a formality** — a human
reviews the design before the code exists, and cannot review what was never shown.

**Report evidence, not conclusions.** When you inspect the repository or call an API, show what you
actually saw: file paths, line numbers, exact response bodies, observed exit codes and test counts.
"Everything looks fine" is not a report.

**Stop on contradiction.** If what you read contradicts what the task assumed, stop and say so
before editing anything. This has repeatedly caught a real gap before code was written.

**Measure before fixing.** Most hypotheses about carrier behaviour turn out wrong. A read-only probe
is cheap; a fix built on an unmeasured hypothesis is wasted work.

**Read before you specify.** Never write a field name, an id, an endpoint or a command from memory
when it can be read from the repository or from a measured response.

**A slice that decides something ends with an entry in `docs/DECISIONS.md`.** A code comment
explains the local HOW to whoever is reading that file; `DECISIONS.md` holds the WHAT and the WHY,
written so it can be read from any chat with no access to the code. A decision that lives only in a
comment is lost the moment nobody opens that file.

## Anti-regression rules

1. **Shrink the route to nothing.** Decisions — which adapters to call, what counts as empty, how to
   validate input — belong in a service or a pure function that a unit test reaches in milliseconds.
   Routes parse the request, call the service, and map the result to HTTP. Route tests are
   impractical here (auth + Prisma + Next), so a decision left inside a route is a decision nothing
   can prove.
2. **Pin behaviour before changing it.** Write the test that records how the code behaves NOW, run
   it, and **report it passing against the unchanged code**. Then change. Then invert it. A guard
   nobody watched fail has proved nothing.
3. **Capture the baseline, do not remember it.** Before touching anything visible, save the artefact
   — the response body, the exact strings on screen — so before/after comparison is mechanical.
4. **Every review finding becomes a test.** That is what turns review from something spent once into
   something that accumulates.
5. **Run the build when a slice touches `packages/core`.** `typecheck`, `test:unit` and `test:db`
   never build the Next client bundle, so a Node builtin reaching the browser, a wrong export path or
   a client/server boundary error passes every gate. Ask the human to stop the dev server first —
   `.next` is shared and building underneath a running dev server breaks it. **A new entry in
   `packages/core/package.json` `exports` requires a dev-server restart:** Next reads that map at
   startup, so correct code will keep reporting "Package path is not exported" until it is bounced.

**A guard built on a fallback does not guard.** A consistency test must assert KEY PRESENCE in the
second structure, not the resolved value, whenever the lookup has a default — otherwise the very
drift it exists to catch resolves to the default and passes.

**No browser end-to-end tests.** Slow, brittle, and muted the moment they flake, which leaves false
confidence. A short fixed manual check list is cheaper and more honest.

## Environment facts

- **Windows / PowerShell.** The console mangles UTF-8 on output; Cyrillic prints as mojibake. That is
  display only — files are fine. To prove Cyrillic landed, print the file's content.
- **Monorepo.** Prisma schema is at `packages/db/prisma/schema.prisma`. A read-only migration check
  MUST be `npx prisma migrate status --schema packages/db/prisma/schema.prisma`; a bare invocation
  always fails for the wrong reason. `npm run db:migrate` is `migrate dev`, which WRITES — never use
  it as a check.
- **Test runner shape:** `test:unit` = `node --import tsx --test tests/*.test.mjs` — **top level of
  `tests/` only, not recursive.** `tests/db/*.db.test.mjs` is the separate `test:db` suite. A test
  file dropped anywhere else silently never runs.
- Postgres runs in Docker on host port **15432** (`npm run docker:up`, compose at
  `infra/docker-compose.yml`, not the repo root). Dev server on port **3000**.
- Migrations: generate in isolation (`npm run db:migrate --name …`), then **print `migration.sql` and
  confirm it is additive and nullable before writing any dependent code**. Folder convention
  `YYYYMMDDHHMMSS_snake_case`. Run `npm run db:test:setup` before `test:db`.
- **Carrier sandboxes return intermittent HTTP 500.** Measured on three endpoints: the same request
  gave 200, then 500, then 200, with no code change. When something stops working, read the server
  log before suspecting our code.
- A `prisma:error … Unique constraint failed on (companyId, idempotencyKey)` line prints on every
  re-quote and is **harmless by design** — the duplicate is caught and the existing draft reused.

## Verification and commits

Before proposing a commit, run and report the **observed** results of: `npm run typecheck`,
`npm run test:unit`, and `npm run test:db` when the database is involved. Report the actual counts,
not "all green".

`git diff` does **not** show untracked files. A slice that adds a file must print that file. Use
`git add -A` — `git add -u` misses new files — and check `git status --porcelain=v1` for the `A`
line before committing.

Commit messages are **English**, plain `git commit -m "subject" -m "body"`. The body explains **why**
in prose a person can read a year later — not a list of changed files. Never mention tooling or
assistants in a commit message. Only use a message file for Cyrillic, written explicitly as UTF-8,
deleted immediately, and verified with `git --no-pager log -1 --format=%B`.

Quote git paths containing `[id]` — git reads brackets as a character class.

## Seller-facing Russian

- A status says **where the parcel is** or **what happened** — never how we feel about it. A return is
  a normal process, not a problem.
- **Phrase around count-noun agreement** so the wording is correct for every number:
  `не обновлено заказов: 5`, not `5 заказов не обновлено`.
- Never show a raw provider code or an internal key to a seller.
- Never invent a time of day. A carrier that quotes a calendar day gets rendered as a day.
