import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Projets surveillés
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  localPath: text("localPath").notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  lastAnalyzedAt: timestamp("lastAnalyzedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// Journal des actions (commits Git, actions manuelles)
export const actionsLog = mysqlTable("actions_log", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  actionType: mysqlEnum("actionType", ["git_commit", "analysis", "deployment", "manual", "adr_created", "idea_promoted"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  details: json("details"),
  author: varchar("author", { length: 255 }),
  hash: varchar("hash", { length: 64 }),
  branch: varchar("branch", { length: 255 }),
  result: mysqlEnum("result", ["success", "failure", "pending"]).default("success").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActionLog = typeof actionsLog.$inferSelect;
export type InsertActionLog = typeof actionsLog.$inferInsert;

// Décisions d'architecture (ADR)
export const architectureDecisions = mysqlTable("architecture_decisions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  adrId: varchar("adrId", { length: 20 }).notNull(), // ex: ADR-001
  title: varchar("title", { length: 500 }).notNull(),
  context: text("context"),
  decision: text("decision").notNull(),
  consequences: text("consequences"),
  status: mysqlEnum("status", ["proposed", "accepted", "deprecated", "superseded"]).default("proposed").notNull(),
  relatedNodes: json("relatedNodes"), // IDs des nœuds de la carte
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ArchitectureDecision = typeof architectureDecisions.$inferSelect;
export type InsertArchitectureDecision = typeof architectureDecisions.$inferInsert;

// Cache des analyses d'architecture
export const analysisCache = mysqlTable("analysis_cache", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  nodes: json("nodes").notNull(),
  edges: json("edges").notNull(),
  analyzedAt: timestamp("analyzedAt").defaultNow().notNull(),
});

export type AnalysisCache = typeof analysisCache.$inferSelect;

// Idées de développement
export const ideas = mysqlTable("ideas", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  parentId: int("parentId"), // Pour les sous-idées
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["exploring", "promising", "in_progress", "promoted", "abandoned"]).default("exploring").notNull(),
  positionX: int("positionX").default(0).notNull(),
  positionY: int("positionY").default(0).notNull(),
  color: varchar("color", { length: 20 }).default("#58a6ff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Idea = typeof ideas.$inferSelect;
export type InsertIdea = typeof ideas.$inferInsert;

// Tâches issues d'idées promues
export const ideaTasks = mysqlTable("idea_tasks", {
  id: int("id").autoincrement().primaryKey(),
  ideaId: int("ideaId").notNull(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["todo", "in_progress", "done"]).default("todo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IdeaTask = typeof ideaTasks.$inferSelect;
export type InsertIdeaTask = typeof ideaTasks.$inferInsert;
