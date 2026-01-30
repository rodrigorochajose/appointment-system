CREATE TABLE `google_account` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`google_calendar_id` varchar(255) NOT NULL,
	`google_email` varchar(255) NOT NULL,
	`google_refresh_token` longtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_account_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_account_worker_id_unique` UNIQUE(`worker_id`),
	CONSTRAINT `google_account_google_email_unique` UNIQUE(`google_email`)
);
--> statement-breakpoint
ALTER TABLE `appointment` DROP FOREIGN KEY `appointment_schedule_id_schedule_id_fk`;
--> statement-breakpoint
ALTER TABLE `appointment` ADD `worker_id` int;--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `appointment_worker_id_worker_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `worker`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointment` DROP COLUMN `schedule_id`;--> statement-breakpoint
ALTER TABLE `google_account` ADD CONSTRAINT `google_account_worker_id_worker_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `worker`(`id`) ON DELETE cascade ON UPDATE no action;