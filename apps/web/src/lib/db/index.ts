import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { mkdirSync } from "fs";
import { join, dirname } from "path";

// Resolve project root (where package.json lives) by walking up from this file
function findProjectRoot(): string {
  // In Next.js, process.cwd() is the project root
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = join(PROJECT_ROOT, "data");
const DB_PATH = join(DATA_DIR, "ocr.db");

// Ensure data directories exist
mkdirSync(join(DATA_DIR, "storage"), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run schema — try multiple paths for compatibility
  const possibleDirs = [
    join(PROJECT_ROOT, "src", "lib", "db"),
    dirname(__filename),
  ];
  let schemaLoaded = false;
  for (const dir of possibleDirs) {
    try {
      const schema = readFileSync(join(dir, "schema.sql"), "utf-8");
      _db.exec(schema);
      const seed = readFileSync(join(dir, "seed.sql"), "utf-8");
      _db.exec(seed);
      schemaLoaded = true;
      break;
    } catch {
      continue;
    }
  }
  if (!schemaLoaded) {
    throw new Error("Could not find schema.sql — check src/lib/db/");
  }

  // Migrations for existing DBs
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN model_config TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Column already exists
  }

  return _db;
}

// Storage directory for files
export const STORAGE_DIR = join(DATA_DIR, "storage");

// Convenience: typed query helpers
export const db = {
  get db() {
    return getDb();
  },

  // Settings
  getSetting(key: string): string | null {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },

  setSetting(key: string, value: string): void {
    getDb().prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    ).run(key, value, value);
  },

  deleteSetting(key: string): void {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  },

  getAllSettings(): Record<string, string> {
    const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },
};
