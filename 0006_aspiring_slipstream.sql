CREATE TABLE `appointment_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`appointment_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointment_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` integer PRIMARY KEY NOT NULL,
	`hospital_id` integer NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`clinic` text NOT NULL,
	`active` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`hospital_id`) REFERENCES `hospitals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hospitals` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`active` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `appointment_confirmed_slot`;--> statement-breakpoint
ALTER TABLE `appointment_requests` ADD `hospital_id` integer REFERENCES hospitals(id);--> statement-breakpoint
ALTER TABLE `appointment_requests` ADD `doctor_id` integer REFERENCES doctors(id);--> statement-breakpoint
ALTER TABLE `appointment_requests` ADD `rescheduled_from` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_doctor_slot` ON `appointment_requests` (`doctor_id`,`confirmed_at`) WHERE "appointment_requests"."status" = 'confirmed' AND "appointment_requests"."doctor_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_confirmed_slot` ON `appointment_requests` (lower("clinician"),`confirmed_at`) WHERE "appointment_requests"."status" = 'confirmed' AND "appointment_requests"."doctor_id" IS NULL;