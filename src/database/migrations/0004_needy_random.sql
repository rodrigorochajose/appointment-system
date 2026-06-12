ALTER TABLE `google_account` ADD `sync_token` longtext;--> statement-breakpoint
ALTER TABLE `google_account` ADD `watch_channel_id` varchar(255);--> statement-breakpoint
ALTER TABLE `google_account` ADD `watch_resource_id` varchar(255);--> statement-breakpoint
ALTER TABLE `google_account` ADD `watch_expiration` datetime;