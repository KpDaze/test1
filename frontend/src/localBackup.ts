import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getDatabase, localDatabaseInfo } from "./localDatabase";

const BACKUP_KIND = "shiftmate-local-backup";
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2, 3, 4]);

type Backup = {
  kind: typeof BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  profile: Record<string, unknown>;
  houses: Record<string, unknown>[];
  rosterScans: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  shiftChanges: Record<string, unknown>[];
};

function assertBackup(value: unknown): asserts value is Backup {
  const data = value as Partial<Backup> | null;
  if (
    !data || data.kind !== BACKUP_KIND || !SUPPORTED_BACKUP_VERSIONS.has(Number(data.schemaVersion)) ||
    !data.profile || !Array.isArray(data.houses) || !Array.isArray(data.rosterScans) ||
    !Array.isArray(data.shifts) || !Array.isArray(data.shiftChanges)
  ) {
    throw new Error("This is not a compatible ShiftMate backup file.");
  }
}

export async function exportLocalBackup(): Promise<string> {
  const db = await getDatabase();
  const [profile, houses, rosterScans, shifts, shiftChanges] = await Promise.all([
    db.getFirstAsync<Record<string, unknown>>("SELECT * FROM profile WHERE id = 'singleton'"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM houses ORDER BY created_at"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM roster_scans ORDER BY captured_at"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM shifts ORDER BY created_at"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM shift_changes ORDER BY changed_at"),
  ]);
  if (!profile) throw new Error("Local profile could not be read.");

  const backup: Backup = {
    kind: BACKUP_KIND,
    schemaVersion: localDatabaseInfo.schemaVersion,
    exportedAt: new Date().toISOString(),
    profile,
    houses,
    rosterScans,
    shifts,
    shiftChanges,
  };
  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  const file = new File(Paths.cache, `ShiftMate-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error(`Backup created at ${file.uri}, but sharing is unavailable.`);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Save ShiftMate backup" });
  return file.uri;
}

const value = (row: Record<string, unknown>, key: string, fallback: unknown = null) => row[key] ?? fallback;

export async function pickAndRestoreLocalBackup(): Promise<{ shifts: number; changes: number }> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  if (picked.canceled) throw new Error("Backup selection cancelled.");
  const backup = JSON.parse(await new File(picked.assets[0].uri).text()) as unknown;
  assertBackup(backup);
  const db = await getDatabase();

  const rateSource = backup.houses.find((row) => Number(value(row, "is_default", 0)) === 1) ?? backup.houses[0];
  const fallbackRate = rateSource ? Number(value(rateSource, "hourly_rate", 0)) : 0;
  const restoredDefaultRate = Number(value(backup.profile, "default_hourly_rate", fallbackRate));

  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM shift_changes; DELETE FROM shifts; DELETE FROM roster_scans; DELETE FROM houses;");
    await db.runAsync(
      `UPDATE profile SET name=?, default_house_id=?, alarm_lead_minutes=?, pay_period_type=?,
       pay_week_start_dow=?, pay_fortnight_anchor=?, default_hourly_rate=? WHERE id='singleton'`,
      value(backup.profile, "name", "") as string,
      value(backup.profile, "default_house_id") as string | null,
      value(backup.profile, "alarm_lead_minutes", 150) as number,
      value(backup.profile, "pay_period_type", "week") as string,
      value(backup.profile, "pay_week_start_dow", 1) as number,
      value(backup.profile, "pay_fortnight_anchor") as string | null,
      Number.isFinite(restoredDefaultRate) && restoredDefaultRate >= 0 ? restoredDefaultRate : 0,
    );
    for (const row of backup.houses) {
      await db.runAsync(
        "INSERT INTO houses (id,name,address,is_default,hourly_rate,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        value(row,"id") as string, value(row,"name","") as string, value(row,"address","") as string,
        value(row,"is_default",0) as number, value(row,"hourly_rate",0) as number,
        value(row,"created_at") as string, value(row,"updated_at") as string,
      );
    }
    for (const row of backup.rosterScans) {
      const savedUri = value(row,"original_uri") as string | null;
      const availableUri = savedUri && new File(savedUri).exists ? savedUri : null;
      await db.runAsync(
        `INSERT INTO roster_scans (id,captured_at,original_uri,image_sha256,ocr_engine,parser_version,
         overall_confidence,status,raw_ocr_json) VALUES (?,?,?,?,?,?,?,?,?)`,
        value(row,"id") as string, value(row,"captured_at") as string, availableUri,
        value(row,"image_sha256") as string | null, value(row,"ocr_engine") as string,
        value(row,"parser_version",1) as number, value(row,"overall_confidence") as number | null,
        value(row,"status","confirmed") as string, value(row,"raw_ocr_json") as string | null,
      );
    }
    for (const row of backup.shifts) {
      await db.runAsync(
        `INSERT INTO shifts (id,date,start_time,end_time,house_id,house_name,alarm_enabled,notes,source,
         roster_scan_id,confidence,confirmation_status,original_date,original_start_time,original_end_time,
         original_house_id,original_house_name,created_at,updated_at,is_deleted)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        value(row,"id") as string, value(row,"date") as string, value(row,"start_time") as string,
        value(row,"end_time") as string, value(row,"house_id") as string | null, value(row,"house_name","") as string,
        value(row,"alarm_enabled",1) as number, value(row,"notes","") as string, value(row,"source","import") as string,
        value(row,"roster_scan_id") as string | null, value(row,"confidence") as number | null,
        value(row,"confirmation_status","confirmed") as string, value(row,"original_date") as string,
        value(row,"original_start_time") as string, value(row,"original_end_time") as string,
        value(row,"original_house_id") as string | null, value(row,"original_house_name","") as string,
        value(row,"created_at") as string, value(row,"updated_at") as string, value(row,"is_deleted",0) as number,
      );
    }
    for (const row of backup.shiftChanges) {
      await db.runAsync(
        `INSERT INTO shift_changes (id,shift_id,changed_at,change_type,phase,previous_json,new_json,
         previous_start,previous_end,new_start,new_end,hours_delta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        value(row,"id") as string, value(row,"shift_id") as string, value(row,"changed_at") as string,
        value(row,"change_type") as string, value(row,"phase") as string, value(row,"previous_json") as string,
        value(row,"new_json") as string, value(row,"previous_start") as string, value(row,"previous_end") as string,
        value(row,"new_start") as string, value(row,"new_end") as string, value(row,"hours_delta",0) as number,
      );
    }
  });
  return { shifts: backup.shifts.length, changes: backup.shiftChanges.length };
}
