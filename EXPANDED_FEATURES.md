# Expanded workflows and code locations

## Insurance investigation

Coordinator > Insurance desk lists active insured cases. Staff can filter cases beyond the three-hour window, follow-ups due, or cases with no verified cause. The Alerts page also identifies approaching three-hour deadlines and missed follow-up times.

Open Investigate and follow up to:
1. Record or correct the verified insurer receipt and acknowledgement. Insurer queries never restart that original clock.
2. Record the operational stage: preparation, submitted, query received, response sent, escalated, final authorisation or rejection recorded.
3. Keep the cause unknown until staff verify evidence. Categories include documents, queries, bill/package mismatch, coverage review, external processing, technical issue and other.
4. Assign a responsible owner and next follow-up time. Add a clear patient-facing update.
5. Prepare an editable contact draft. Copying a draft sends nothing.
6. Use the hospital's approved phone/email/portal channel, then record the actual attempt, contacted party, reference and factual outcome. Staff-only contact notes do not appear in the patient view.

The patient sees the recorded stage, verified cause, owner, next follow-up and public update. This is an operational record, not automatic root-cause detection, live insurer status or claim adjudication. The app cannot compel approval, calculate compensation or guarantee faster discharge. Rejected cases require human insurance review. Real integration requires an approved insurer/hospital interface and governance.

Files: `public/app.js` (`insuranceDeskPage`, `patientInsuranceOps`), `app/lib/insurance-ops.js` (workflow/contact routes), `app/lib/insurance.js` (verified receipt timer), `app/lib/backend.js` (permissions and alerts). Tables: `insurance_workflows`, `insurance_contact_events`, existing `insurance_receipts`.

## Appointment coordination

The patient view has Follow-up appointments. A patient or authorised relative requests a department and preferred time for the linked admission. Requests are not confirmed bookings. Coordinators open Follow-up appointments, check hospital availability, and confirm a clinician, time and location, or decline with a reason. Patients can cancel their own open requests/appointments. A declined/cancelled request remains in history.

The prototype blocks the exact same confirmed start time for the same clinician and guards against stale updates. It does not model appointment duration, overlapping time ranges, staff rosters, real calendar availability, payment or notifications. This is for follow-up coordination of linked admissions, rather than public new-patient registration.

Files: `public/app.js` (`patientFollowup`, `appointmentPage`, `bindAppointmentActions`), `app/lib/followup.js`. Tables: `appointment_requests` and its partial unique indexes.

## Billing and patient support

The help desk lets a patient create distinct issues. Billing options cover itemised bills, unclear charges, possible duplicates, payment not reflected, deposit adjustment, refund status, packages/tariffs, pharmacy charges and co-pay/deductible clarification. Insurance, documents, appointments and discharge coordination have their own categories. Other accommodates issues outside the listed options; the list cannot enumerate every possible hospital issue.

Each ticket has a HELP ID, admission, requester, reference, description, owner, saved replies and a state: open, waiting for patient, billing review, insurance review or resolved. Only staff control the resolution state. A patient reply reopens an unresolved waiting issue as open. Resolved tickets remain readable; a recurring issue can be reported separately. Previous general conversations remain available under General messages and previous conversations.

Staff must verify charges and process any adjustment/refund outside this prototype. A resolved ticket means staff recorded a resolution; it is not proof that a bank transaction happened. Do not enter bank/card credentials or real clinical data. This is not an emergency channel.

Files: `public/app.js` (`helpDesk`, `generalHelpDesk`), `app/lib/support.js`. Tables: `support_tickets`, `support_replies`. Existing `help_threads` and `help_messages` remain preserved.

## Personal departure preparation

Patients can save personal checks for belongings, transport/assistance and questions for the hospital team. They do not complete hospital tasks or authorise departure. File: `app/lib/followup.js`; UI: `preparationPanel`; table: `case_preparations`.

## Review demonstration

1. Coordinator > Insurance desk > an overdue fictional admission. Show verified receipt, unknown cause, evidence requirement, owner/follow-up, draft and contact history.
2. Patient > request a follow-up visit. Coordinator > confirm actual fictional arrangements. Patient > refresh and view confirmation.
3. Patient > help desk > billing > possible duplicate charge. Coordinator > reply, assign billing review and record a resolution.
4. Simulator > compare a staffing scenario. Explain that outcomes use assumptions and that no predictive AI is trained.

Use fictional details. A demo contact record must be explicitly labelled fictional, not presented as evidence that an insurer was contacted.
