CREATE TABLE `appointment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datetime` datetime NOT NULL,
	`offering_id` int NOT NULL,
	`user_id` int NOT NULL,
	`schedule_id` int,
	`fixed` boolean NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointment_id` PRIMARY KEY(`id`),
	CONSTRAINT `datetime_idx` UNIQUE(`datetime`)
);
--> statement-breakpoint
CREATE TABLE `offering` (
	`id` int AUTO_INCREMENT NOT NULL,
	`description` varchar(255) NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offering_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedule_worker_id_unique` UNIQUE(`worker_id`)
);
--> statement-breakpoint
CREATE TABLE `unavailable_period` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schedule_id` int,
	`date` datetime NOT NULL,
	`begin` datetime NOT NULL,
	`end` datetime NOT NULL,
	`all_day` boolean NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unavailable_period_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`),
	CONSTRAINT `user_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `worker` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `appointment_offering_id_offering_id_fk` FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `appointment_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `appointment_schedule_id_schedule_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedule`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule` ADD CONSTRAINT `schedule_worker_id_worker_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `worker`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unavailable_period` ADD CONSTRAINT `unavailable_period_schedule_id_schedule_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedule`(`id`) ON DELETE cascade ON UPDATE no action;