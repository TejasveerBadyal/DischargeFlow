# Three roles and four hospitals

The current prototype has three separate roles:

| Role | Access |
|---|---|
| Platform admin | All hospitals, cross-hospital overview, hospital/doctor directory management, and hospital operational workspaces |
| Hospital coordinator | Only admissions assigned to their hospital, including tasks, insurance, alerts, simulator, accounts, appointments and help requests |
| Patient / authorised relative | Only their linked admission, patient-facing history, follow-up requests and help desk |

Four fictional hospitals: Cedar Valley, Harborview, Northgate City and Sunrise Community. Each has three fictional doctors. Sixteen new admissions (four per hospital, including one previous discharge per hospital) supplement the preserved sample cohort. Four new patient/relative accounts each link to that hospital's first new admission. Each hospital also has one requested and one missed appointment snapshot plus one fictional billing help request.

The original coordinator is assigned to Cedar Valley. Existing passwords and patient links remain unchanged. The old synthetic 30-case cohort is distributed once across the four hospitals. Other existing cases are assigned to Cedar Valley. The migration does not delete records or invent historical actions.

## How isolation works

`users.hospital_id` records the coordinator assignment; `cases.hospital_id` records the owning hospital. `app/lib/hospital-scope.js` supplies scoped SQL read views to every operational module. Lists and the ID lookups that authorise writes use those views. A coordinator cannot override their assignment through a submitted hospital ID, URL query or admin hospital header.

The administrator starts at `/admin`. This shows per-hospital active/previous case counts and staff assignments. Opening a hospital sets an admin-only operational filter; it does not change the account's role. Admin banners remain visible on coordinator workflow pages. Coordinators start at `/coordinator` with their hospital name visible. Patients start at `/patient`.

The hospital/doctor directory is shared read-only reference information for appointment selection. Viewing public directory entries does not grant access to another hospital's admissions. A patient's owning hospital coordinator manages their follow-up requests, including requests selecting a doctor at another hospital; availability still requires external confirmation. This is appointment coordination, not a connected cross-hospital calendar or referral-record exchange.

Alert thresholds are stored independently for each hospital. Simulations run on only the cases visible in the selected workspace. Admin all-hospital views remain available; choose a hospital before registering a new discharge or sending a new mock-clearance event.

## Source map

- `public/app.js`: `adminPage`, `shell`, `dashboardPath`, `visiblePages` and the separate workflow screens.
- `app/lib/backend.js`: authenticates users, obtains hospital membership from the database, applies scopes and checks page/API access.
- `app/lib/hospital-scope.js`: reusable hospital boundary for case-related reads and mutation target checks.
- `app/lib/hospital-roles.js`: idempotent fictional accounts, fourth hospital and sample admissions. Seeded credentials are salted hashes; plaintext passwords are supplied separately to the project owner.
- `app/lib/directory.js`: admin-only directory changes, read-only appointment directory.
- `db/schema.ts` and `drizzle/0007_careless_electro.sql`: additive hospital membership and per-hospital alert settings.
- `tests/hospital-roles.test.mjs`: cross-hospital list, direct read, mutation, messaging, ticket, account, alert and simulator checks.

## Demonstration versus production

All names and cases are fictional. This establishes application-level hospital access boundaries in the prototype; it is not a claim of production security certification. No staff credential verification, staff-account onboarding UI, real hospital connection, insurer messaging or doctor calendar has been added. New patient provisioning and temporary-password controls continue to work. There is no general patient identity editing form.

Demo accounts are for presentations only. The private credential table is distributed outside the source archive; do not upload it to a public repository. New real deployments must replace sample accounts and use appropriate account provisioning and security review.
