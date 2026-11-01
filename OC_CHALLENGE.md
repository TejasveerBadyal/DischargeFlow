# OC challenge: directory, appointments, attendance and history

## One staff person

The platform administrator manages hospital/doctor directory entries. Hospital coordinators see only their assigned hospital's admissions. Patients/relatives see only their linked admission. See HOSPITAL_ROLES.md for the current model. There is no public staff signup; the original coordinator login remains valid within Cedar Valley.

The original coordinator account is created in `app/lib/backend.js` when the database has no users. The initial password comes from the server-held `BOOTSTRAP_PASSWORD` setting and is stored as a salted PBKDF2 hash. `STAFF-000001` is a login alias for that account, created by the sample cohort in `app/lib/samples.js`. Initial names/emails/roles are synthetic bootstrap records. This is a prototype setup, not hospital HR verification or staff SSO.

Temporary patient/relative passwords serve a different purpose: handing a newly provisioned account to its verified owner. They expire after two hours and must be replaced before case access. They are not an SMS OTP. They may work until replaced/expired/reissued/revoked; the application does not promise that they can be used for only one login. Reissue ends existing sessions and replaces the credential. The patient chooses their own password, which staff cannot retrieve in readable form. Those rules are in `app/lib/accounts.js`.

## Hospital and doctor selection

A fictional directory contains four hospitals and twelve doctors. Only platform admins can create/edit hospital and doctor profiles and activate/deactivate entries under Hospitals and doctors. No hard deletion is available, preserving references from old appointments. Inactive hospitals and their doctors disappear from new patient selection lists. Being in the directory is not medical credential verification or live availability.

Patients choose a hospital, then a doctor belonging to that hospital, and request a preferred time. The server derives the specialty from the selected doctor and rejects inactive or mismatched selections. The coordinator checks availability externally before confirming a doctor, time and clinic. Doctor changes require an explanation. Existing requests from the earlier version remain visible and can receive directory selections at confirmation.

File map: `public/app.js` - `directoryPage`, `patientFollowup`, `appointmentPage`, `bindAppointmentActions`; `app/lib/directory.js` - seeding and admin management; `app/lib/followup.js` - appointment validation and writes. Tables: `hospitals`, `doctors`, `appointment_requests`, `appointment_events`.

## Missed appointments

A confirmed appointment whose time has passed is flagged as attendance needing review. The app does not assume the patient missed it. A coordinator must verify attendance, provide a factual note and mark it attended or missed. Future appointments cannot be marked missed/attended, and patients cannot set their own attendance status.

Patients can request another visit from a missed/cancelled/declined appointment. The app creates a new request linked by `rescheduled_from`, retaining the old outcome and event history. A new request still requires hospital confirmation. Patients cannot cancel a past confirmed visit to bypass staff attendance review.

The coordinator can explicitly load three fictional attendance examples once: one missed, one attended and one past confirmed visit awaiting review. They are labelled snapshots, not real observations. Earlier events are not fabricated. Existing appointments remain saved. The example action is coordinator-only and does not change login credentials.

The prototype prevents an exact duplicate confirmed start time for the same directory doctor. It does not model appointment length, overlapping time ranges, real rosters or hospital calendar availability.

## Case history

A coordinator can choose stored admissions belonging to their hospital; the platform admin can choose across hospitals under Case history. Patients can open only the admission linked to their account. The view combines clearance, recorded departure, current discharge stages, task events and linked appointment outcomes. Each appointment also has a separate event history.

This is operational case history, not an electronic medical record: no diagnoses, prescriptions or clinical test results are stored. Internal task-event notes do not appear in the patient's history. Contact-desk private notes are not included. Initial snapshots and older requests without events remain explicitly identified.

Files: `app/lib/case-history.js`; browser functions `caseHistoryPage`, `patientCaseHistory`, `caseHistoryMarkup`.

## Scope and presentation answers

- Admin access: a separate platform admin has cross-hospital oversight and directory administration.
- Doctor appointment: patient selection plus manual hospital confirmation.
- Missed appointment: staff-verified outcome, not an automatic assumption from elapsed time.
- Case history: admission-scoped operational timeline and appointment outcomes.
- Hospital lists: maintained fictional directory, not a real hospital integration.
- Credentials: original staff bootstrap and separate temporary patient-account handover.

Coordinators now have hospital-specific access, with cross-hospital oversight reserved for the platform admin. The prototype uses fictional assignments. Production use still requires credential verification, security review, governance and approved interfaces.
