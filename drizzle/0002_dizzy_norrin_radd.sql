CREATE TABLE `engineers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`timezone` varchar(8) NOT NULL DEFAULT 'EDT',
	`podNumber` int,
	`active` boolean NOT NULL DEFAULT true,
	`softPreferences` json,
	`hardPreferences` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engineers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(8) NOT NULL,
	`podNumber` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `locations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`podCount` int NOT NULL DEFAULT 1,
	`ptoEnabled` boolean NOT NULL DEFAULT false,
	`holidaysEnabled` boolean NOT NULL DEFAULT false,
	`displayTimezone` varchar(8) NOT NULL DEFAULT 'EDT',
	`scheduleYear` int NOT NULL DEFAULT 2026,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engineerId` int NOT NULL,
	`podNumber` int NOT NULL,
	`startMs` bigint NOT NULL,
	`durationHours` int NOT NULL,
	`scheduleYear` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `timeOff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engineerId` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`date` varchar(10) NOT NULL,
	`scheduleYear` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timeOff_id` PRIMARY KEY(`id`)
);
