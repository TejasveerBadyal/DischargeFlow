# DischargeFlow — MU20 Opportunity Summit 2026

A hospital discharge and follow-up coordination prototype with separate platform admin, hospital coordinator and patient/relative workspaces.

**Live prototype:** https://dischargeflow-mu20.wildknot.chatgpt.site

See [Three roles and four hospitals](docs/HOSPITAL_ROLES.md) for the current access model and demonstration limits.

## What works

- Account login, server-side role checks, linked-admission patient access and session expiry.
- Separate coordinator pages: overview, active cases, new discharge, patient access, alerts, simulator, help desk, previous cases and mock integration.
- Documentation and pharmacy in parallel; billing follows both; insurance for cashless cases; final checks and separately recorded departure.
- Tasks with owners, start/complete/hold/resume actions, timestamps and change history.
- Patient/relative account provisioning with temporary passwords, forced first password replacement and revocation.
- Rules-based patient chatbot and saved messages to a human coordinator.
- Insurance investigation desk: verified delay causes, accountable owners, next-follow-up times, reviewed contact drafts and actual contact-outcome records.
- Structured billing/support tickets with common issue categories, references, owners, replies and resolution states.
- Hospital/doctor directory selection with manual appointment confirmation, staff-verified attended/missed outcomes, rescheduling and appointment event history.
- Separate admin dashboard across four hospitals; admin-only hospital/doctor directory management.
- Hospital-specific coordinators with server-enforced case boundaries, plus linked patient/relative access.
- Admission-scoped operational case history for patients and coordinators.
- Saved personal preparation checklist, separate from hospital clearance.
- Explainable threshold alerts; verified insurer-receipt timer and sourced information for cashless authorisation delays.
- Read-only discrete-event what-if simulation of staffing capacity changes, with baseline/scenario charts.
- Thirty additional fictional admissions: 25 active and five previous records, added once during initial setup and distributed across four hospitals.

See [expanded features and code locations](docs/EXPANDED_FEATURES.md) for the new workflows and their limits.

See [OC challenge and credential explanation](docs/OC_CHALLENGE.md) for directory management, attendance and case history.

## What is not implemented

No trained predictive AI, automatic insurer contact, live clinician calendar, payment/refund processing, real hospital/TPA/NHCX connection, clinical decision-making, automated insurance approval, SMS/email notifications or validated digital twin. Timing inputs are explicit assumptions; simulation outcomes are not measured hospital improvements. The chatbot uses rules, not an LLM.

## Technology

JavaScript for browser and application logic; HTML/CSS for the interface; TypeScript for framework/configuration and database schema; SQL for persistent data. The retained Vinext/Vite starter builds a Cloudflare Worker with a D1 database and Drizzle migrations. Some React/UI/connector starter files are retained infrastructure; the main product UI is `public/app.js` and `public/styles.css`.

## Start reading here

1. [Code walkthrough and presentation questions](docs/CODE_WALKTHROUGH.md)
2. [GitHub submission instructions](docs/GITHUB_SUBMISSION.md)
3. [Sample data and account IDs](docs/SAMPLE_DATA.md)
4. [Account lifecycle details](ACCOUNT_ACCESS.md)
5. [Starter infrastructure reference](docs/STARTER_REFERENCE.md)

## Run a separate local copy

Use **Node.js 22.13+ with `node:sqlite` available** (Node 24 LTS is suitable), npm, and an extracted copy of this source. Install dependencies and build from the project folder:

```sh
npm run install:ci
npm run build
```

On a **fresh local database only**, apply these migrations once, in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_magical_zarek.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_previous_morlocks.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_curvy_zodiak.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_fantastic_masque.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_curvy_lady_bullseye.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_warm_puppet_master.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_aspiring_slipstream.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_careless_electro.sql
```

Create an ignored file **`dist/server/.dev.vars`** after the build containing one line, replacing the example with a password of your choice:

```text
BOOTSTRAP_PASSWORD="choose-your-own-local-password"
```

Then run:

```sh
npm start
```

Open the local URL printed by the server. First sign in as `coordinator@demo.local` using your chosen local password. Initial setup adds the extra samples and ID aliases. The original coordinator is restricted to Cedar Valley Hospital. Afterwards `STAFF-000001`, `REL-000002` and `PAT-000003` work with that same local bootstrap password. The live site's passwords are managed separately and are intentionally absent from this repository.

Do not reapply old migrations on the same local database. On later updates apply only newly added migrations. A rebuild may remove `dist/server/.dev.vars`; recreate it if needed. Changing BOOTSTRAP_PASSWORD does not reset accounts already created in a persistent database. The local copy has its own data and does not connect to the hosted database.

## Verify the application

```sh
node --test tests/*.test.mjs
```

The tests use isolated in-memory SQLite databases with the same SQL migrations and a D1-compatible adapter. They cover access restrictions, account provisioning/replacement/revocation, workflow changes, support, simulation, sample seeding and insurance timer rules. They do not establish real hospital performance or clinical/regulatory certification.

## Source versus database

`db/schema.ts` defines tables. `drizzle/*.sql` creates them. `app/lib/samples.js` supplies the expanded synthetic records; `app/lib/backend.js` bootstraps the original two cases and three accounts. Actual hosted data persists in Cloudflare D1, not in the browser or a downloadable password file. The source archive includes the recipe to reproduce fictional data, not a dump of live accounts, sessions or patient records.

The `.openai/hosting.json` project ID identifies this existing Sites deployment. Merely pushing the repository to GitHub does not publish changes to the live app. GitHub Pages cannot run this server/database application. To deploy independently, provision your own Worker/D1 environment; do not try to reuse someone else's Site identity.

## Submission and attribution

Add the four team members' names and actual contributions before submission. Disclose AI-assisted development according to the OC's rules. This project retains framework and UI starter code and third-party licences; keep those notices. Do not claim the prototype is a new invention of digital discharge tracking or that its prediction accuracy has been validated.
