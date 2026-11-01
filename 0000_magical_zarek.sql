CREATE TABLE `access` (
	`user_id` integer,
	`case_id` text,
	PRIMARY KEY(`user_id`, `case_id`)
);
--> statement-breakpoint
CREATE TABLE `alert_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assistant_limits` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer,
	`event` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_clearance` (
	`case_id` text PRIMARY KEY NOT NULL,
	`clinician` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`ward` text NOT NULL,
	`pathway` text NOT NULL,
	`cleared_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departures` (
	`case_id` text PRIMARY KEY NOT NULL,
	`departed_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`user_id` integer,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `help_messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`thread_id` integer,
	`user_id` integer,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `help_threads` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer,
	`case_id` text,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_threads_unique_0` ON `help_threads` (`user_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mock_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` text NOT NULL,
	`user_id` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`case_id` text,
	`position` integer,
	`user_id` integer,
	`action` text,
	`old_status` text,
	`new_status` text,
	`note` text,
	`occurred_at` text
);
--> statement-breakpoint
CREATE TABLE `task_holds` (
	`case_id` text,
	`position` integer,
	`reason` text NOT NULL,
	PRIMARY KEY(`case_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`case_id` text,
	`position` integer,
	`label` text,
	`owner` text,
	`status` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_unique_0` ON `users` (`email`);