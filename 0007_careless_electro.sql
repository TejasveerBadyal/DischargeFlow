CREATE TABLE `hospital_alert_settings` (
	`hospital_id` integer PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	FOREIGN KEY (`hospital_id`) REFERENCES `hospitals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `cases` ADD `hospital_id` integer REFERENCES hospitals(id);--> statement-breakpoint
ALTER TABLE `users` ADD `hospital_id` integer REFERENCES hospitals(id);