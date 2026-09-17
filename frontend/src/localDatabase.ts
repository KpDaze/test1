import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "shiftmate.db";
const SCHEMA_VERSION = 4;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'singleton'),
  name TEXT NOT NULL DEFAULT '', default_house_id TEXT,
  alarm_lead_minutes INTEGER NOT NULL DEFAULT 150,
  pay_period_type TEXT NOT NULL DEFAULT 'week',
  pay_week_start_dow INTEGER NOT NULL DEFAULT 1,
  pay_fortnight_anchor TEXT,
  default_hourly_rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0, hourly_rate REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_scans (
  id TEXT PRIMARY KEY NOT NULL, captured_at TEXT NOT NULL, original_uri TEXT,
  image_sha256 TEXT, ocr_engine TEXT NOT NULL, parser_version INTEGER NOT NULL,
  overall_confidence REAL, status TEXT NOT NULL, raw_ocr_json TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL,
  end_time TEXT NOT NULL, house_id TEXT, house_name TEXT NOT NULL DEFAULT '',
  alarm_enabled INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', roster_scan_id TEXT, confidence REAL,
  confirmation_status TEXT NOT NULL DEFAULT 'confirmed', original_date TEXT NOT NULL,
  original_start_time TEXT NOT NULL, original_end_time TEXT NOT NULL,
  original_house_id TEXT, original_house_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL,
  FOREIGN KEY (roster_scan_id) REFERENCES roster_scans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shift_changes (
  id TEXT PRIMARY KEY NOT NULL, shift_id TEXT NOT NULL, changed_at TEXT NOT NULL,
  change_type TEXT NOT NULL, phase TEXT NOT NULL, previous_json TEXT NOT NULL,
  new_json TEXT NOT NULL, previous_start TEXT NOT NULL, previous_end TEXT NOT NULL,
  new_start TEXT NOT NULL, new_end TEXT NOT NULL, hours_delta REAL NOT NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shift_changes_shift ON shift_changes(shift_id, changed_at);

CREATE TRIGGER IF NOT EXISTS preserve_shift_original_values
BEFORE UPDATE OF original_date, original_start_time, original_end_time,
  original_house_id, original_house_name ON shifts
FOR EACH ROW WHEN
  NEW.original_date IS NOT OLD.original_date OR
  NEW.original_start_time IS NOT OLD.original_start_time OR
  NEW.original_end_time IS NOT OLD.original_end_time OR
  NEW.original_house_id IS NOT OLD.original_house_id OR
  NEW.original_house_name IS NOT OLD.original_house_name
BEGIN
  SELECT RAISE(ABORT, 'Original shift values are immutable');
END;

CREATE TRIGGER IF NOT EXISTS preserve_shift_house_label
AFTER UPDATE OF house_name ON shifts
FOR EACH ROW WHEN
  TRIM(COALESCE(OLD.house_name, '')) <> '' AND
  TRIM(COALESCE(NEW.house_name, '')) = ''
BEGIN
  UPDATE shifts SET house_name = OLD.house_name WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO profile (id) VALUES ('singleton');
`;

async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const profileColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(profile)");
  if (!profileColumns.some((column) => column.name === "default_hourly_rate")) {
    await db.execAsync("ALTER TABLE profile ADD COLUMN default_hourly_rate REAL NOT NULL DEFAULT 0");
    await db.execAsync(`
      UPDATE profile
      SET default_hourly_rate = COALESCE(
        (SELECT hourly_rate FROM houses WHERE is_default = 1 ORDER BY created_at LIMIT 1),
        (SELECT hourly_rate FROM houses ORDER BY created_at LIMIT 1),
        0
      )
      WHERE id = 'singleton';
    `);
  }

  await db.execAsync(`
    UPDATE shifts
    SET house_name = original_house_name
    WHERE TRIM(COALESCE(house_name, '')) = ''
      AND TRIM(COALESCE(original_house_name, '')) <> '';

    UPDATE shifts
    SET house_id = original_house_id
    WHERE house_id IS NULL
      AND original_house_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM houses h WHERE h.id = shifts.original_house_id);

    UPDATE shifts
    SET house_name = (
      SELECT h.name FROM houses h WHERE h.id = shifts.house_id LIMIT 1
    )
    WHERE TRIM(COALESCE(house_name, '')) = ''
      AND house_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM houses h WHERE h.id = shifts.house_id);

    UPDATE shifts
    SET house_id = (
      SELECT h.id
      FROM houses h
      WHERE LOWER(TRIM(h.name)) = LOWER(TRIM(shifts.house_name))
      ORDER BY h.is_default DESC, h.created_at
      LIMIT 1
    )
    WHERE TRIM(COALESCE(house_name, '')) <> ''
      AND EXISTS (
        SELECT 1 FROM houses h
        WHERE LOWER(TRIM(h.name)) = LOWER(TRIM(shifts.house_name))
      )
      AND (
        house_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM houses linked WHERE linked.id = shifts.house_id)
        OR NOT EXISTS (
          SELECT 1 FROM houses linked
          WHERE linked.id = shifts.house_id
            AND LOWER(TRIM(linked.name)) = LOWER(TRIM(shifts.house_name))
        )
      );
  `);

  await db.execAsync(`
    UPDATE profile
    SET default_hourly_rate = COALESCE(
      (SELECT hourly_rate FROM houses WHERE is_default = 1 AND hourly_rate > 0 ORDER BY created_at LIMIT 1),
      (SELECT hourly_rate FROM houses WHERE hourly_rate > 0 ORDER BY created_at LIMIT 1),
      default_hourly_rate
    )
    WHERE id = 'singleton'
      AND ABS(default_hourly_rate - 38.50) < 0.001
      AND NOT EXISTS (SELECT 1 FROM houses WHERE ABS(hourly_rate - 38.50) < 0.001)
      AND EXISTS (SELECT 1 FROM houses WHERE hourly_rate > 0);
  `);

  await db.runAsync(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)",
    String(SCHEMA_VERSION),
  );
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(schema);
      await migrateSchema(db);
      return db;
    });
  }
  return databasePromise;
}

export async function initializeLocalDatabase(): Promise<void> {
  await getDatabase();
}

export const localDatabaseInfo = { name: DATABASE_NAME, schemaVersion: SCHEMA_VERSION } as const;
