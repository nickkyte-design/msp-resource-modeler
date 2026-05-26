CREATE TABLE `podCoverage` (
	`podNumber` int NOT NULL,
	`daysOfWeek` int NOT NULL DEFAULT 127,
	`coverageStartHour` int NOT NULL DEFAULT 0,
	`coverageHoursPerDay` int NOT NULL DEFAULT 24,
	`anchorTimezone` varchar(8) NOT NULL DEFAULT 'EDT',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `podCoverage_podNumber` PRIMARY KEY(`podNumber`)
);
