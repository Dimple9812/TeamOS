export type Role = "owner" | "admin" | "member" | "viewer";
export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export const STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];

export type Priority = "low" | "medium" | "high" | "urgent";
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  isDemo: boolean;
  createdAt: Date;
}

export interface Member {
  userId: string;
  role: Role;
}

export interface Workspace {
  id: string;
  name: string;
  members: Member[];
  /** Denormalised member ids so "workspaces I belong to" is one indexed lookup. */
  memberIds: string[];
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  /** Calendar date, YYYY-MM-DD (no time zone ambiguity). */
  dueDate: string | null;
  labels: string[];
  /** Position inside its status column; fractional so a move rewrites one row. */
  order: number;
  createdBy: string;
  completedAt: Date | null;
  /** Incremented on every edit; a stale edit gets 409 instead of silently overwriting. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export type ActivityType =
  | "project.created"
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.assigned"
  | "task.deleted"
  | "comment.added"
  | "member.joined"
  | "ai.tasks_created";

export interface Activity {
  id: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  actorId: string;
  type: ActivityType;
  /** Small, display-ready payload: task title, from/to status, changed fields… */
  data: Record<string, unknown>;
  createdAt: Date;
}

type FieldFilter<V> = V extends (infer E)[] ? E | V : V | { $in: V[] };
/** Equality filters (array fields match when they contain the value) plus `$in`. Enough for this app, and portable to MongoDB. */
export type Filter<T> = { [K in keyof T]?: FieldFilter<T[K]> };

export interface FindOptions<T> {
  sort?: keyof T;
  desc?: boolean;
  limit?: number;
}

export interface Repo<T extends { id: string }> {
  insert(doc: T): Promise<T>;
  get(id: string): Promise<T | null>;
  find(filter: Filter<T>, opts?: FindOptions<T>): Promise<T[]>;
  count(filter: Filter<T>): Promise<number>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  /** Applies the patch only if the stored `version` still equals `expected`; returns null otherwise. */
  updateIfVersion(id: string, expected: number, patch: Partial<T>): Promise<T | null>;
  remove(id: string): Promise<boolean>;
  removeWhere(filter: Filter<T>): Promise<number>;
}

export interface Store {
  users: Repo<User>;
  workspaces: Repo<Workspace>;
  projects: Repo<Project>;
  tasks: Repo<Task>;
  comments: Repo<Comment>;
  activity: Repo<Activity>;
  close(): Promise<void>;
}

export const roleOf = (ws: Workspace, userId: string): Role | null => ws.members.find((m) => m.userId === userId)?.role ?? null;

const rank: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
/** True when `role` is at least `min` (owner > admin > member > viewer). */
export const atLeast = (role: Role | null, min: Role) => role !== null && rank[role] >= rank[min];
