CREATE TABLE `actions_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`actionType` enum('git_commit','analysis','deployment','manual','adr_created','idea_promoted') NOT NULL,
	`title` varchar(500) NOT NULL,
	`details` json,
	`author` varchar(255),
	`hash` varchar(64),
	`branch` varchar(255),
	`result` enum('success','failure','pending') NOT NULL DEFAULT 'success',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `actions_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysis_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`nodes` json NOT NULL,
	`edges` json NOT NULL,
	`analyzedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `architecture_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`adrId` varchar(20) NOT NULL,
	`title` varchar(500) NOT NULL,
	`context` text,
	`decision` text NOT NULL,
	`consequences` text,
	`status` enum('proposed','accepted','deprecated','superseded') NOT NULL DEFAULT 'proposed',
	`relatedNodes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `architecture_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `idea_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ideaId` int NOT NULL,
	`projectId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`status` enum('todo','in_progress','done') NOT NULL DEFAULT 'todo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `idea_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`parentId` int,
	`title` varchar(500) NOT NULL,
	`description` text,
	`status` enum('exploring','promising','in_progress','promoted','abandoned') NOT NULL DEFAULT 'exploring',
	`positionX` int NOT NULL DEFAULT 0,
	`positionY` int NOT NULL DEFAULT 0,
	`color` varchar(20) NOT NULL DEFAULT '#58a6ff',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ideas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`localPath` text NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
