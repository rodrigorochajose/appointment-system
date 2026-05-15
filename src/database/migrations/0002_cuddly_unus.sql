CREATE TABLE `working_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schedule_id` int NOT NULL,
	`weekday` int NOT NULL,
	`begin` time NOT NULL,
	`end` time NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `working_hours_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointment` ADD CONSTRAINT `worker_datetime_idx` UNIQUE(`worker_id`,`datetime`);--> statement-breakpoint
ALTER TABLE `appointment` DROP INDEX `datetime_idx`;--> statement-breakpoint
ALTER TABLE `working_hours` ADD CONSTRAINT `working_hours_schedule_id_schedule_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedule`(`id`) ON DELETE cascade ON UPDATE no action;