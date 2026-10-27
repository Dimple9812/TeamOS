import type { Activity, Comment, Filter, FindOptions, Project, Repo, Store, Task, User, Workspace } from "./types.js";

/** Matches the subset of MongoDB query semantics the app uses: equality, array-contains and `$in`. */
export function matches<T>(doc: T, filter: Filter<T>): boolean {
  for (const [key, cond] of Object.entries(filter) as [keyof T, unknown][]) {
    if (cond === undefined) continue;
    const value = doc[key] as unknown;
    if (cond && typeof cond === "object" && "$in" in (cond as object)) {
      const set = (cond as { $in: unknown[] }).$in;
      if (Array.isArray(value) ? !value.some((v) => set.includes(v)) : !set.includes(value)) return false;
    } else if (Array.isArray(value) && !Array.isArray(cond)) {
      if (!value.includes(cond)) return false;
    } else if (cond instanceof Date || value instanceof Date) {
      if (new Date(value as Date).getTime() !== new Date(cond as Date).getTime()) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

export function sortAndLimit<T>(docs: T[], opts: FindOptions<T> = {}): T[] {
  let out = docs;
  if (opts.sort) {
    const key = opts.sort;
    const dir = opts.desc ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = a[key] instanceof Date ? (a[key] as Date).getTime() : (a[key] as number | string);
      const y = b[key] instanceof Date ? (b[key] as Date).getTime() : (b[key] as number | string);
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  return opts.limit ? out.slice(0, opts.limit) : out;
}

const clone = <T>(v: T): T => structuredClone(v);

class MemoryRepo<T extends { id: string; updatedAt?: Date }> implements Repo<T> {
  private docs = new Map<string, T>();

  async insert(doc: T) {
    if (this.docs.has(doc.id)) throw Object.assign(new Error("duplicate id"), { code: 11000 });
    this.docs.set(doc.id, clone(doc));
    return clone(doc);
  }
  async get(id: string) {
    const d = this.docs.get(id);
    return d ? clone(d) : null;
  }
  async find(filter: Filter<T>, opts?: FindOptions<T>) {
    return sortAndLimit([...this.docs.values()].filter((d) => matches(d, filter)), opts).map(clone);
  }
  async count(filter: Filter<T>) {
    return [...this.docs.values()].filter((d) => matches(d, filter)).length;
  }
  async update(id: string, patch: Partial<T>) {
    const d = this.docs.get(id);
    if (!d) return null;
    const next = { ...d, ...clone(patch) };
    this.docs.set(id, next);
    return clone(next);
  }
  async updateIfVersion(id: string, expected: number, patch: Partial<T>) {
    const d = this.docs.get(id) as (T & { version?: number }) | undefined;
    if (!d || d.version !== expected) return null;
    return this.update(id, patch);
  }
  async remove(id: string) {
    return this.docs.delete(id);
  }
  async removeWhere(filter: Filter<T>) {
    let n = 0;
    for (const [id, d] of this.docs) if (matches(d, filter) && this.docs.delete(id)) n++;
    return n;
  }
}

/** In-process store for local runs and tests. Data is lost on restart. */
export class MemoryStore implements Store {
  users = new MemoryRepo<User>();
  workspaces = new MemoryRepo<Workspace>();
  projects = new MemoryRepo<Project>();
  tasks = new MemoryRepo<Task>();
  comments = new MemoryRepo<Comment>();
  activity = new MemoryRepo<Activity>();

  constructor() {
    // Mirror the unique email index the MongoDB store has.
    const insertUser = this.users.insert.bind(this.users);
    this.users.insert = async (u: User) => {
      if ((await this.users.count({ email: u.email })) > 0) throw Object.assign(new Error("duplicate email"), { code: 11000 });
      return insertUser(u);
    };
  }

  async close() {}
}
