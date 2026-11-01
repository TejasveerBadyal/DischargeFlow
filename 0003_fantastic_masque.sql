CREATE TABLE `appointment_requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`requested_by` integer NOT NULL,
	`department` text NOT NULL,
	`preferred_at` text NOT NULL,
	`confirmed_at` text,
	`clinician` text,
	`location` text,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`staff_note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_preparations` (
	`case_id` text NOT NULL,
	`item_key` text NOT NULL,
	`is_done` integer NOT NULL,
	`updated_by` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `item_key`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
