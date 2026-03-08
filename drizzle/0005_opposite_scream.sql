ALTER TABLE `architecture_decisions` ADD `category` varchar(50) DEFAULT 'architecture' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `priority` enum('haute','moyenne','basse') DEFAULT 'moyenne' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `category` varchar(50) DEFAULT 'fonctionnalite' NOT NULL;