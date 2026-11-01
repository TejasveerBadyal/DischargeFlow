CREATE TABLE `account_access` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`relationship` text NOT NULL,
	`granted_by` integer,
	`granted_at` text NOT NULL,
	`verified_at` text,
	`revoked_at` text,
	`revoked_by` integer,
	`must_change` integer DEFAULT 1 NOT NULL,
	`credential_expires_at` integer,
	`password_changed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
