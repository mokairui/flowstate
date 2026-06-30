import Dexie, { type EntityTable } from "dexie";
import { v4 as uuidv4 } from "uuid";
import type { TodoItem, Project, SubtaskItem } from "./types";

const DB_NAME = "FlowStateDB";
const DB_VERSION = 5;

interface FlowStateDatabase extends Dexie {
  todos: EntityTable<TodoItem, "id">;
  projects: EntityTable<Project, "id">;
}

let db: FlowStateDatabase | null = null;

function getDb(): FlowStateDatabase {
  if (db) return db;

  db = new Dexie(DB_NAME) as FlowStateDatabase;

  db.version(1).stores({
    todos: "id, status, createdAt, updatedAt",
  });

  db.version(2).stores({
    todos: "id, status, createdAt, updatedAt, order",
  }).upgrade(async (tx) => {
    // Migrate v1 data: assign order based on createdAt descending
    const todos = await tx.table("todos").toArray();
    todos.sort((a: TodoItem, b: TodoItem) => b.createdAt - a.createdAt);
    for (let i = 0; i < todos.length; i++) {
      await tx.table("todos").update(todos[i].id, { order: i });
    }
  });

  db.version(4).stores({
    todos: "id, status, createdAt, updatedAt, order, projectId, dueAt",
    projects: "id, name, order, createdAt",
  }).upgrade(async (tx) => {
    // v4: 新增 dueAt / projectId 索引 + projects 表 + 默认项目。
    // Dexie 对未索引字段是 schemaless 的，故 todos 无数据迁移。
    const projects = await tx.table("projects").toArray();
    if (projects.length === 0) {
      await tx.table("projects").add({
        id: "default",
        name: "收件箱",
        color: "#7C3AED",
        order: 0,
        createdAt: Date.now(),
      });
    }
  });

  // F-2 v5: 子任务实体化。将旧 aiSummary.subtasks: string[] 迁移到顶层
  // subtasks: SubtaskItem[]。schema 索引不变（subtasks 不需要索引）。
  db.version(DB_VERSION).stores({
    todos: "id, status, createdAt, updatedAt, order, projectId, dueAt",
    projects: "id, name, order, createdAt",
  }).upgrade(async (tx) => {
    await tx
      .table<TodoItem>("todos")
      .toCollection()
      .modify((todo) => {
        try {
          if (todo.subtasks && todo.subtasks.length > 0) return; // 已迁移
          const legacy = todo.aiSummary?.subtasks;
          if (!legacy || legacy.length === 0) return;
          const base = todo.createdAt ?? Date.now();
          const migrated: SubtaskItem[] = [];
          legacy.forEach((text, i) => {
            const trimmed = typeof text === "string" ? text.trim() : "";
            if (!trimmed) return;
            migrated.push({
              id: uuidv4(),
              text: trimmed,
              done: false,
              order: i,
              createdAt: base,
              source: "ai",
            });
          });
          if (migrated.length > 0) {
            todo.subtasks = migrated;
          }
        } catch (err) {
          // 单条失败不阻塞整体迁移，保留旧字段。
          console.warn("[db v5] subtask migration skipped for todo", todo.id, err);
        }
      });
  });

  return db;
}

export async function initDb(): Promise<void> {
  try {
    const database = getDb();
    await database.open();
  } catch (err) {
    console.error("IndexedDB init failed:", err);
    throw new Error("数据库初始化失败，请刷新页面重试");
  }
}

export async function getAllTodos(): Promise<TodoItem[]> {
  const database = getDb();
  return database.todos.orderBy("order").reverse().toArray();
}

export async function getTodosByStatus(status: TodoItem["status"]): Promise<TodoItem[]> {
  const database = getDb();
  return database.todos
    .where("status")
    .equals(status)
    .toArray()
    .then((items) => items.sort((a, b) => b.order - a.order));
}

export async function getTodoById(id: string): Promise<TodoItem | undefined> {
  const database = getDb();
  return database.todos.get(id);
}

export async function addTodo(todo: TodoItem): Promise<void> {
  const database = getDb();
  await database.todos.add(todo);
}

export async function updateTodo(id: string, changes: Partial<TodoItem>): Promise<void> {
  const database = getDb();
  await database.todos.update(id, { ...changes, updatedAt: Date.now() });
}

export async function updateTodosOrder(todos: TodoItem[]): Promise<void> {
  const database = getDb();
  await database.todos.bulkPut(todos);
}

export async function getNextOrderForStatus(status: TodoItem["status"]): Promise<number> {
  const database = getDb();
  const items = await database.todos.where("status").equals(status).toArray();
  const maxOrder = items.length > 0 ? Math.max(...items.map((t) => t.order)) : -1;
  return maxOrder + 1;
}

export async function deleteTodo(id: string): Promise<void> {
  const database = getDb();
  await database.todos.delete(id);
}

export async function deleteAllTodos(): Promise<void> {
  const database = getDb();
  await database.todos.clear();
}

// ─── Projects ───

export async function getAllProjects(): Promise<Project[]> {
  const database = getDb();
  return database.projects.orderBy("order").toArray();
}

export async function addProject(project: Project): Promise<void> {
  const database = getDb();
  await database.projects.add(project);
}

export async function updateProject(id: string, changes: Partial<Project>): Promise<void> {
  const database = getDb();
  await database.projects.update(id, changes);
}

export async function deleteProject(id: string): Promise<void> {
  const database = getDb();
  await database.projects.delete(id);
}

export async function updateProjectsOrder(projects: Project[]): Promise<void> {
  const database = getDb();
  await database.projects.bulkPut(projects);
}

// ─── Export / Import ───

export async function exportTodos(): Promise<TodoItem[]> {
  return getAllTodos();
}

export async function importTodos(todos: TodoItem[]): Promise<void> {
  const database = getDb();
  await database.todos.bulkPut(todos);
}
