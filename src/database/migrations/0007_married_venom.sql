CREATE TABLE `fixed_series` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`user_id` int NOT NULL,
	`offering_id` int NOT NULL,
	`weekday` int NOT NULL,
	`time` varchar(5) NOT NULL,
	`start_date` datetime NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`google_event_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fixed_series_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fixed_series_exception` (
	`id` int AUTO_INCREMENT NOT NULL,
	`series_id` int NOT NULL,
	`date` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fixed_series_exception_id` PRIMARY KEY(`id`),
	CONSTRAINT `series_date_idx` UNIQUE(`series_id`,`date`)
);
--> statement-breakpoint
ALTER TABLE `appointment` ADD `fixed_series_id` int;--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `appointment_fixed_series_id_fixed_series_id_fk` FOREIGN KEY (`fixed_series_id`) REFERENCES `fixed_series`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixed_series` ADD CONSTRAINT `fixed_series_worker_id_worker_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `worker`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixed_series` ADD CONSTRAINT `fixed_series_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixed_series` ADD CONSTRAINT `fixed_series_offering_id_offering_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixed_series_exception` ADD CONSTRAINT `fixed_series_exception_series_id_fixed_series_id_fk` FOREIGN KEY (`series_id`) REFERENCES `fixed_series`(`id`) ON DELETE cascade ON UPDATE no action;