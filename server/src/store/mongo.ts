import mongoose, { Schema, type Model } from "mongoose";
import { PRIORITIES, ROLES, STATUSES } from "./types.js";
import type { Activity, Comment, Filter, FindOptions, Project, Repo, Store, Task, User, Workspace } from "./types.js";

/* Each collection stores the app's string id as `_id`, so lookups by id use the primary index. */
const id = { type: String, required: true };
const opts = { versionKey: false, minimize: false } as const;

const userSchema = new Schema(
  {
    _id: id,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, maxlength: 60 },
    passwordHash: { type: String, default: null },
    isDemo: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
  },
  opts,
);

const workspaceSchema = new Schema(
  {
    _id: id,
    name: { type: String, required: true, maxlength: 60 },
    members: [{ _id: false, userId: { type: String, required: true }, role: { type: String, enum: ROLES, required: true } }],
    memberIds: { type: [String], index: true },
    inviteCode: { type: String, required: true, unique: true },
    createdAt: Date,
    updatedAt: Date,
  },
  opts,
);

const projectSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    description: { type: String, default: "" },
    color: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: Date,
    updatedAt: Date,
  },
  opts,
);

const taskSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true },
    projectId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: "" },
    status: { type: String, enum: STATUSES, required: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    assigneeId: { type: String, default: null },
    dueDate: { type: String, default: null },
    labels: { type: [String], default: [] },
    order: { type: Number, required: true },
    createdBy: { type: String, required: true },
    completedAt: { type: Date, default: null },
    version: { type: Number, required: true },
    createdAt: Date,
    updatedAt: Date,
  },
  opts,
);
// The board query: one project's tasks, grouped by column and ordered.
taskSchema.index({ projectId: 1, status: 1, order: 1 });
// Standups and "my tasks" across a workspace.
taskSchema.index({ workspaceId: 1, assigneeId: 1 });

const commentSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true },
    projectId: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    body: { type: String, required: true, maxlength: 4000 },
    createdAt: Date,
  },
  opts,
);

const activitySchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true },
    projectId: { type: String, default: null },
    taskId: { type: String, default: null },
    actorId: { type: String, required: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    createdAt: Date,
  },
  opts,
);
activitySchema.index({ workspaceId: 1, createdAt: -1 });
activitySchema.index({ projectId: 1, createdAt: -1 });

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromDoc = <T>(d: any): T => {
  if (!d) return d;
  const { _id, ...rest } = d;
  return { id: _id, ...rest } as T;
};

/** `id` is stored as `_id`; everything else maps one-to-one onto MongoDB's own query language. */
const toQuery = (filter: Record<string, unknown>) => {
  const q: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) if (v !== undefined) q[k === "id" ? "_id" : k] = v;
  return q;
};

class MongoRepo<T extends { id: string }> implements Repo<T> {
  constructor(private model: Model<any>) {}

  async insert(doc: T) {
    const { id: _id, ...rest } = doc;
    await this.model.create({ _id, ...rest });
    return doc;
  }
  async get(id: string) {
    return fromDoc<T>(await this.model.findById(id).lean());
  }
  async find(filter: Filter<T>, o: FindOptions<T> = {}) {
    let q = this.model.find(toQuery(filter));
    if (o.sort) q = q.sort({ [o.sort === "id" ? "_id" : String(o.sort)]: o.desc ? -1 : 1 });
    if (o.limit) q = q.limit(o.limit);
    return (await q.lean()).map((d) => fromDoc<T>(d));
  }
  async count(filter: Filter<T>) {
    return this.model.countDocuments(toQuery(filter));
  }
  async update(id: string, patch: Partial<T>) {
    const { id: _ignored, ...rest } = patch as Partial<T> & { id?: string };
    return fromDoc<T>(await this.model.findByIdAndUpdate(id, { $set: rest }, { new: true }).lean());
  }
  async updateIfVersion(id: string, expected: number, patch: Partial<T>) {
    const { id: _ignored, ...rest } = patch as Partial<T> & { id?: string };
    // The version check and the write are one atomic operation, so two concurrent editors can't both win.
    return fromDoc<T>(await this.model.findOneAndUpdate({ _id: id, version: expected }, { $set: rest }, { new: true }).lean());
  }
  async remove(id: string) {
    return (await this.model.deleteOne({ _id: id })).deletedCount === 1;
  }
  async removeWhere(filter: Filter<T>) {
    return (await this.model.deleteMany(toQuery(filter))).deletedCount;
  }
}

export class MongoStore implements Store {
  users: Repo<User>;
  workspaces: Repo<Workspace>;
  projects: Repo<Project>;
  tasks: Repo<Task>;
  comments: Repo<Comment>;
  activity: Repo<Activity>;

  private constructor(private conn: mongoose.Connection) {
    // The repos work on plain objects, so the schema-specific model types aren't needed past this point.
    const model = (name: string, schema: Schema) => conn.model(name, schema) as unknown as Model<any>;
    this.users = new MongoRepo<User>(model("User", userSchema));
    this.workspaces = new MongoRepo<Workspace>(model("Workspace", workspaceSchema));
    this.projects = new MongoRepo<Project>(model("Project", projectSchema));
    this.tasks = new MongoRepo<Task>(model("Task", taskSchema));
    this.comments = new MongoRepo<Comment>(model("Comment", commentSchema));
    this.activity = new MongoRepo<Activity>(model("Activity", activitySchema));
  }

  static async connect(uri: string, dbName?: string) {
    const conn = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 10_000 }).asPromise();
    const store = new MongoStore(conn);
    await Promise.all(Object.values(conn.models).map((m) => m.syncIndexes()));
    return store;
  }

  /** Drops the database; only used by tests against a throwaway database. */
  async dropDatabase() {
    await this.conn.dropDatabase();
  }

  async close() {
    await this.conn.close();
  }
}
