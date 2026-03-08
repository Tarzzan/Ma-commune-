ALTER TABLE `analysis_cache` ADD `label` varchar(255);--> statement-breakpoint
ALTER TABLE `analysis_cache` ADD `nodeCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `analysis_cache` ADD `edgeCount` int DEFAULT 0 NOT NULL;