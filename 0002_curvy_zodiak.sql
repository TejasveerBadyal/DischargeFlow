CREATE TABLE `insurance_receipts` (
	`case_id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`reference` text NOT NULL,
	`insurer_name` text NOT NULL,
	`recorded_by` integer,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sample_batches` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
