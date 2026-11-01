import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const users=sqliteTable("users",{
id:integer("id").primaryKey(),
email:text("email").notNull(),
name:text("name").notNull(),
password_hash:text("password_hash").notNull(),
role:text("role").notNull(),
hospital_id:integer("hospital_id").references(()=>hospitals.id)
},t=>[uniqueIndex('users_unique_0').on(t.email),]);
export const cases=sqliteTable("cases",{
id:text("id").primaryKey(),
display_name:text("display_name").notNull(),
ward:text("ward").notNull(),
pathway:text("pathway").notNull(),
cleared_at:text("cleared_at").notNull(),
hospital_id:integer("hospital_id").references(()=>hospitals.id)
},t=>[]);
export const access=sqliteTable("access",{
user_id:integer("user_id"),
case_id:text("case_id")
},t=>[primaryKey({columns:[t.user_id,t.case_id]}),]);
export const tasks=sqliteTable("tasks",{
case_id:text("case_id"),
position:integer("position"),
label:text("label"),
owner:text("owner"),
status:text("status"),
updated_at:text("updated_at").notNull()
},t=>[primaryKey({columns:[t.case_id,t.position]}),]);
export const sessions=sqliteTable("sessions",{
token_hash:text("token_hash").primaryKey(),
user_id:integer("user_id"),
csrf:text("csrf").notNull(),
expires_at:integer("expires_at").notNull()
},t=>[]);
export const login_attempts=sqliteTable("login_attempts",{
bucket:text("bucket").primaryKey(),
failures:integer("failures").notNull(),
window_start:integer("window_start").notNull()
},t=>[]);
export const audit=sqliteTable("audit",{
id:integer("id").primaryKey(),
user_id:integer("user_id"),
event:text("event").notNull(),
occurred_at:text("occurred_at").notNull()
},t=>[]);
export const case_clearance=sqliteTable("case_clearance",{
case_id:text("case_id").primaryKey(),
clinician:text("clinician").notNull()
},t=>[]);
export const task_holds=sqliteTable("task_holds",{
case_id:text("case_id"),
position:integer("position"),
reason:text("reason").notNull()
},t=>[primaryKey({columns:[t.case_id,t.position]}),]);
export const task_events=sqliteTable("task_events",{
id:integer("id").primaryKey(),
case_id:text("case_id"),
position:integer("position"),
user_id:integer("user_id"),
action:text("action"),
old_status:text("old_status"),
new_status:text("new_status"),
note:text("note"),
occurred_at:text("occurred_at")
},t=>[]);
export const help_threads=sqliteTable("help_threads",{
id:integer("id").primaryKey(),
user_id:integer("user_id"),
case_id:text("case_id"),
state:text("state").notNull(),
updated_at:text("updated_at").notNull()
},t=>[uniqueIndex('help_threads_unique_0').on(t.user_id),]);
export const help_messages=sqliteTable("help_messages",{
id:integer("id").primaryKey(),
thread_id:integer("thread_id"),
user_id:integer("user_id"),
text:text("text").notNull(),
created_at:text("created_at").notNull()
},t=>[]);
export const alert_settings=sqliteTable("alert_settings",{
id:integer("id").primaryKey(),
settings:text("settings").notNull()
},t=>[]);
export const assistant_limits=sqliteTable("assistant_limits",{
user_id:integer("user_id").primaryKey(),
window_start:integer("window_start").notNull(),
count:integer("count").notNull()
},t=>[]);
export const departures=sqliteTable("departures",{
case_id:text("case_id").primaryKey(),
departed_at:text("departed_at").notNull(),
recorded_at:text("recorded_at").notNull(),
user_id:integer("user_id"),
note:text("note").notNull()
},t=>[]);
export const mock_events=sqliteTable("mock_events",{
event_id:text("event_id").primaryKey(),
case_id:text("case_id").notNull(),
event_type:text("event_type").notNull(),
received_at:text("received_at").notNull(),
user_id:integer("user_id")
},t=>[]);
export const account_access=sqliteTable('account_access',{
 user_id:integer('user_id').primaryKey().references(()=>users.id),
 case_id:text('case_id').notNull().references(()=>cases.id),
 relationship:text('relationship').notNull(),
 granted_by:integer('granted_by').references(()=>users.id),
 granted_at:text('granted_at').notNull(),
 verified_at:text('verified_at'),
 revoked_at:text('revoked_at'),
 revoked_by:integer('revoked_by').references(()=>users.id),
 must_change:integer('must_change').notNull().default(1),
 credential_expires_at:integer('credential_expires_at'),
 password_changed_at:text('password_changed_at')
});
export const insurance_receipts=sqliteTable('insurance_receipts',{
 case_id:text('case_id').primaryKey().references(()=>cases.id),
 received_at:text('received_at').notNull(),
 reference:text('reference').notNull(),
 insurer_name:text('insurer_name').notNull(),
 recorded_by:integer('recorded_by').references(()=>users.id),
 recorded_at:text('recorded_at').notNull()
});
export const login_aliases=sqliteTable('login_aliases',{
 alias:text('alias').primaryKey(),user_id:integer('user_id').notNull().references(()=>users.id)
});
export const sample_batches=sqliteTable('sample_batches',{
 key:text('key').primaryKey(),created_at:text('created_at').notNull()
});

export const appointment_requests=sqliteTable('appointment_requests',{
 id:integer('id').primaryKey(),case_id:text('case_id').notNull().references(()=>cases.id),requested_by:integer('requested_by').notNull().references(()=>users.id),department:text('department').notNull(),preferred_at:text('preferred_at').notNull(),confirmed_at:text('confirmed_at'),clinician:text('clinician'),location:text('location'),status:text('status').notNull(),note:text('note').notNull(),staff_note:text('staff_note').notNull().default(''),updated_at:text('updated_at').notNull(),hospital_id:integer('hospital_id').references(()=>hospitals.id),doctor_id:integer('doctor_id').references(()=>doctors.id),rescheduled_from:integer('rescheduled_from')
},t=>[uniqueIndex('appointment_confirmed_slot').on(sql`lower(${t.clinician})`,t.confirmed_at).where(sql`${t.status} = 'confirmed' AND ${t.doctor_id} IS NULL`),uniqueIndex('appointment_doctor_slot').on(t.doctor_id,t.confirmed_at).where(sql`${t.status} = 'confirmed' AND ${t.doctor_id} IS NOT NULL`),uniqueIndex('appointment_open_request').on(t.case_id,t.department,t.preferred_at).where(sql`${t.status} IN ('requested','confirmed')`)]);
export const case_preparations=sqliteTable('case_preparations',{
 case_id:text('case_id').notNull().references(()=>cases.id),item_key:text('item_key').notNull(),is_done:integer('is_done').notNull(),updated_by:integer('updated_by').notNull().references(()=>users.id),updated_at:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.case_id,t.item_key]})]);

export const insurance_workflows=sqliteTable('insurance_workflows',{
 case_id:text('case_id').primaryKey().references(()=>cases.id),stage:text('stage').notNull(),delay_reason:text('delay_reason').notNull(),cause_verified:integer('cause_verified').notNull(),evidence_reference:text('evidence_reference').notNull(),owner:text('owner').notNull(),next_followup_at:text('next_followup_at'),public_update:text('public_update').notNull(),updated_by:integer('updated_by').notNull().references(()=>users.id),updated_at:text('updated_at').notNull()
});
export const insurance_contact_events=sqliteTable('insurance_contact_events',{
 id:integer('id').primaryKey(),case_id:text('case_id').notNull().references(()=>cases.id),user_id:integer('user_id').notNull().references(()=>users.id),channel:text('channel').notNull(),contact_party:text('contact_party').notNull(),reference:text('reference').notNull(),outcome:text('outcome').notNull(),note:text('note').notNull(),occurred_at:text('occurred_at').notNull()
});
export const support_tickets=sqliteTable('support_tickets',{
 id:integer('id').primaryKey(),case_id:text('case_id').notNull().references(()=>cases.id),requested_by:integer('requested_by').notNull().references(()=>users.id),category:text('category').notNull(),issue:text('issue').notNull(),description:text('description').notNull(),reference:text('reference').notNull(),state:text('state').notNull(),owner:text('owner').notNull(),updated_at:text('updated_at').notNull()
});
export const support_replies=sqliteTable('support_replies',{
 id:integer('id').primaryKey(),ticket_id:integer('ticket_id').notNull().references(()=>support_tickets.id),user_id:integer('user_id').notNull().references(()=>users.id),text:text('text').notNull(),created_at:text('created_at').notNull()
});

export const hospitals=sqliteTable('hospitals',{
 id:integer('id').primaryKey(),name:text('name').notNull(),city:text('city').notNull(),address:text('address').notNull(),active:integer('active').notNull(),updated_at:text('updated_at').notNull()
});
export const doctors=sqliteTable('doctors',{
 id:integer('id').primaryKey(),hospital_id:integer('hospital_id').notNull().references(()=>hospitals.id),name:text('name').notNull(),specialty:text('specialty').notNull(),clinic:text('clinic').notNull(),active:integer('active').notNull(),updated_at:text('updated_at').notNull()
});
export const appointment_events=sqliteTable('appointment_events',{
 id:integer('id').primaryKey(),appointment_id:integer('appointment_id').notNull().references(()=>appointment_requests.id),user_id:integer('user_id').notNull().references(()=>users.id),action:text('action').notNull(),note:text('note').notNull(),occurred_at:text('occurred_at').notNull()
});

export const hospital_alert_settings=sqliteTable('hospital_alert_settings',{hospital_id:integer('hospital_id').primaryKey().references(()=>hospitals.id),settings:text('settings').notNull()});
