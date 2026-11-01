# Fictional sample database

## New cohort

`app/lib/samples.js` adds **30 admissions once**: IDs `IPD-2026-100201` through `IPD-2026-100230`. Twenty-five are active and five have recorded departure. Fifteen use the insured pathway and fifteen self-pay. Together with the original two cases, a fresh installation has 32 admissions: 27 active and five previous. Existing hosted records are preserved, so totals can be higher after team activity.

The cohort varies names, wards, task completion and processing stages. Three insured active cases start with a verified fictional insurer receipt more than three hours old. Some have final checks in progress. Completed historical records are retained under Previous cases. Times are generated relative to when the cohort is first added and remain stored afterwards; they do not reset on refresh.

All people, clinicians and insurer names are fictional. Starting task statuses are snapshots. A `fictional_sample_created` event records their origin; the seed does not invent a sequence of earlier staff actions.

`sample_batches` records the cohort version. An atomic batch and unique keys prevent repeating it. Existing cases and password hashes are not replaced. Tests can disable this seed with `ENABLE_SAMPLE_COHORT='0'`.

## Account IDs

| ID | Equivalent email | Access |
|---|---|---|
| STAFF-000001 | coordinator@dischargeflow.test | Coordinator workspace |
| REL-000002 | relative@dischargeflow.test | Original insured admission DF-104 |
| PAT-000003 | patient@dischargeflow.test | Original self-pay admission DF-105 |

The original `coordinator@demo.local`, `family@demo.local` and `patient@demo.local` usernames remain valid. IDs and new emails are aliases for those accounts, not separate users. Aliases become available after the first coordinator case-list request.

Passwords are intentionally not stored here. The owner shares live prototype credentials privately; local copies use the BOOTSTRAP_PASSWORD chosen during setup. Prototype accounts are not suitable for real patient information.

**Thirty extra admissions do not mean thirty automatically created login accounts.** To demonstrate another patient's view, the coordinator opens Patient access, selects that admission and provisions a patient or authorised-relative account. The app issues a unique ID and random temporary password, requires password replacement before data access, and supports revocation. Temporary passwords are four groups of six hexadecimal characters, expire after two hours, and are displayed only on issue/reissue. The database stores salted hashes, not recoverable passwords.
