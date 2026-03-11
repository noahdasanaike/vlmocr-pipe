import Database from "better-sqlite3";
import { readFileSync, existsSync } from "fs";
import { mkdirSync } from "fs";
import { join, dirname, resolve } from "path";

// Resolve project root — walk up from cwd or known markers
function findProjectRoot(): string {
  // Try cwd first (Next.js sets cwd to project root)
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "src", "lib", "db", "schema.sql"))) return dir;
    if (existsSync(join(dir, "apps", "web", "src", "lib", "db", "schema.sql"))) return join(dir, "apps", "web");
    dir = dirname(dir);
  }
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
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists
  }
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0");
  } catch { /* exists */ }
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0");
  } catch { /* exists */ }
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN total_cost REAL NOT NULL DEFAULT 0");
  } catch { /* exists */ }

  // Add pricing columns to eval_models
  try {
    _db.exec("ALTER TABLE eval_models ADD COLUMN input_cost_per_1m REAL NOT NULL DEFAULT 0");
  } catch { /* exists */ }
  try {
    _db.exec("ALTER TABLE eval_models ADD COLUMN output_cost_per_1m REAL NOT NULL DEFAULT 0");
  } catch { /* exists */ }
  try {
    _db.exec("ALTER TABLE eval_models ADD COLUMN tokens_per_image INTEGER NOT NULL DEFAULT 1000");
  } catch { /* exists */ }

  // Backfill pricing for existing models (idempotent — only updates models still at defaults)
  const pricingUpdates: [string, number, number, number][] = [
    ["m1",  2.50, 10.00, 765],  ["m2",  1.25, 10.00, 1300], ["m3",  0.15, 3.50, 1300],
    ["m4",  3.00, 15.00, 1050], ["m5",  1.20, 1.20, 1500],  ["m6",  2.00, 8.00, 1500],
    ["m7",  0.20, 0.60, 1200],  ["m8",  0.60, 0.60, 1200],  ["m18", 0.075, 0.30, 1300],
    ["m20", 0.40, 0.40, 1200],  ["m23", 0.075, 0.30, 1300], ["m24", 0.15, 0.15, 1200],
    ["m25", 1.50, 1.50, 1500],  ["m9",  0.06, 0.06, 1200],  ["m10", 0.10, 0.10, 1200],
    ["m11", 0.03, 0.03, 1200],  ["m21", 0.13, 0.13, 1500],  ["m13", 0.10, 0.10, 1200],
    ["m14", 0.20, 0.20, 1200],  ["m22", 0.10, 0.10, 1500],  ["m15", 0.20, 0.60, 1500],
    ["m16", 0.20, 0.60, 1500],  ["m26", 0.20, 0.60, 1500],  ["m27", 0.20, 0.60, 1500],
    ["m28", 0.80, 2.40, 1500],  ["m17", 0.05, 0.05, 1200],  ["m12", 0.07, 0.07, 1200],
    ["m30", 0.15, 3.50, 1300],  ["m31", 1.25, 10.00, 1300], ["m32", 3.00, 12.00, 765],
    ["m33", 3.00, 12.00, 765],  ["m34", 15.00, 75.00, 1050],["m35", 0.10, 0.10, 1200],
    ["m36", 0.07, 0.07, 1200],  ["m37", 0.27, 0.27, 1200],  ["m38", 0.15, 0.15, 1200],
    ["m39", 0.50, 0.50, 1200],  ["m40", 0.50, 0.50, 1200],  ["m41", 0.15, 0.15, 1200],
  ];
  const pricingStmt = _db.prepare(
    "UPDATE eval_models SET input_cost_per_1m = ?, output_cost_per_1m = ?, tokens_per_image = ? WHERE id = ? AND input_cost_per_1m = 0 AND output_cost_per_1m = 0"
  );
  for (const [id, inp, out, tpi] of pricingUpdates) {
    pricingStmt.run(inp, out, tpi, id);
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
