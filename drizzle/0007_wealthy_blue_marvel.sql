CREATE TABLE `holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleYear` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`label` varchar(80) NOT NULL,
	`region` varchar(16) NOT NULL DEFAULT 'CUSTOM',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `holidays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `holidaysPerYear` int DEFAULT 10 NOT NULL;