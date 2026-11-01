CREATE TABLE `insurance_contact_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`channel` text NOT NULL,
	`contact_party` text NOT NULL,
	`reference` text NOT NULL,
	`outcome` text NOT NULL,
	`note` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `insurance_workflows` (
	`case_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`delay_reason` text NOT NULL,
	`cause_verified` integer NOT NULL,
	`evidence_reference` text NOT NULL,
	`owner` text NOT NULL,
	`next_followup_at` text,
	`public_update` text NOT NULL,
	`updated_by` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `support_replies` (
	`id` integer PRIMARY KEY NOT NULL,
	`ticket_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` integer PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`requested_by` integer NOT NULL,
	`category` text NOT NULL,
	`issue` text NOT NULL,
	`description` text NOT NULL,
	`reference` text NOT NULL,
	`state` text NOT NULL,
	`owner` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
