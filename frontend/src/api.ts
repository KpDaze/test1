import { getDatabase } from "./localDatabase";

export type House = { id: string; name: string; address: string; is_default: boolean; hourly_rate?: number };
export type ShiftSource = "manual" | "roster" | "voice" | "import";
export type ShiftEdit = {
  changed_at: string; previous_start: string; previous_end: string;
  new_start: string; new_end: string; phase: "before" | "during" | "after"; hours_delta: number;
};
export type Shift = {
  id: string; date: string; start_time: string; end_time: string;
  house_id?: string | null; house_name: string; alarm_enabled: boolean; notes: string;
  source?: ShiftSource; roster_scan_id?: string | null; confidence?: number | null;
  confirmation_status?: "needs_confirmation" | "confirmed";
  original_date?: string; original_start_time?: string; original_end_time?: string;
  original_house_id?: string | null; original_house_name?: string;
  edits?: ShiftEdit[]; created_at?: string;
};
export type Profile = {
  name: string; default_house_id?: string | null; alarm_lead_minutes: number;
  pay_period_type?: "week" | "fortnight" | "month"; pay_week_start_dow?: number;
  pay_fortnight_anchor?: string | null; default_hourly_rate?: number;
};
export type PayslipEntry = { date: string; paid_hours: number };
export type PayslipResult = {
  date: string; paid_hours: number; recorded_hours: number; delta: number;
  match: boolean; shift_ids: string[];
};
export type PayslipCompareResponse = {
  results: PayslipResult[]; total_paid: number; total_recorded: number; total_delta: number;
};
export type RosterScan = {
  id: string; captured_at: string; original_uri?: string | null; image_sha256?: string | null;
  ocr_engine: string; parser_version: number; overall_confidence?: number | null;
  status: "needs_confirmation" | "confirmed" | "rejected"; raw_ocr_json?: string | null;
};

type ShiftRow = Omit<Shift, "alarm_enabled" | "edits"> & { alarm_enabled: number };
type HouseRow = Omit<House, "is_default"> & { is_default: number };
type ProfileRow = Omit<Profile, "pay_period_type"> & { pay_period_type: "week" | "fortnight" | "month" };
type NewShift = Omit<Shift, "id" | "created_at" | "edits">;

const nowIso = () => new Date().toISOString();
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const mapHouse = (row: HouseRow): House => ({ ...row, is_default: Boolean(row.is_default) });
const mapShift = (row: ShiftRow): Shift => ({ ...row, alarm_enabled: Boolean(row.alarm_enabled) });

function durationHours(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  let duration = toMinutes(end) - toMinutes(start);
  if (duration < 0) duration += 24 * 60;
  return Math.round((duration / 60) * 100) / 100;
}

function changePhase(date: string, start: string, end: string): ShiftEdit["phase"] {
  const begins = new Date(`${date}T${start}:00`);
  const finishes = new Date(`${date}T${end}:00`);
  if (finishes <= begins) finishes.setDate(finishes.getDate() + 1);
  const current = new Date();
  return current < begins ? "before" : current < finishes ? "during" : "after";
}

async function shiftWithEdits(id: string): Promise<Shift> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ShiftRow>("SELECT * FROM shifts WHERE id = ? AND is_deleted = 0", id);
  if (!row) throw new Error("Shift not found");
  const edits = await db.getAllAsync<ShiftEdit>(
    `SELECT changed_at, previous_start, previous_end, new_start, new_end, phase, hours_delta
     FROM shift_changes WHERE shift_id = ? AND change_type = 'update' ORDER BY changed_at`, id,
  );
  return { ...mapShift(row), edits };
}

async function insertShift(data: NewShift): Promise<Shift> {
  const db = await getDatabase();
  const id = newId();
  const timestamp = nowIso();
  await db.runAsync(
    `INSERT INTO shifts (
      id, date, start_time, end_time, house_id, house_name, alarm_enabled, notes,
      source, roster_scan_id, confidence, confirmation_status,
      original_date, original_start_time, original_end_time, original_house_id,
      original_house_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, data.date, data.start_time, data.end_time, data.house_id ?? null, data.house_name ?? "",
    data.alarm_enabled === false ? 0 : 1, data.notes ?? "", data.source ?? "manual",
    data.roster_scan_id ?? null, data.confidence ?? null, data.confirmation_status ?? "confirmed",
    data.original_date ?? data.date, data.original_start_time ?? data.start_time,
    data.original_end_time ?? data.end_time, data.original_house_id ?? data.house_id ?? null,
    data.original_house_name ?? data.house_name ?? "", timestamp, timestamp,
  );
  return shiftWithEdits(id);
}

export const api = {
  async getProfile(): Promise<Profile> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ProfileRow>("SELECT * FROM profile WHERE id = 'singleton'");
    if (!row) throw new Error("Local profile could not be initialized");
    return row;
  },

  async updateProfile(data: Partial<Profile>): Promise<Profile> {
    const next = { ...(await api.getProfile()), ...data };
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE profile SET name = ?, default_house_id = ?, alarm_lead_minutes = ?,
       pay_period_type = ?, pay_week_start_dow = ?, pay_fortnight_anchor = ?,
       default_hourly_rate = ? WHERE id = 'singleton'`,
      next.name, next.default_house_id ?? null, next.alarm_lead_minutes,
      next.pay_period_type ?? "week", next.pay_week_start_dow ?? 1, next.pay_fortnight_anchor ?? null,
      next.default_hourly_rate ?? 0,
    );
    return api.getProfile();
  },

  async listHouses(): Promise<House[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<HouseRow>("SELECT id, name, address, is_default, hourly_rate FROM houses ORDER BY created_at");
    return rows.map(mapHouse);
  },

  async addHouse(data: { name: string; address?: string; is_default?: boolean; hourly_rate?: number }): Promise<House> {
    const db = await getDatabase();
    const id = newId();
    const timestamp = nowIso();
    await db.withTransactionAsync(async () => {
      const count = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM houses");
      const makeDefault = Boolean(data.is_default || count?.count === 0);
      if (makeDefault) await db.runAsync("UPDATE houses SET is_default = 0");
      await db.runAsync(
        "INSERT INTO houses (id, name, address, is_default, hourly_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id, data.name, data.address ?? "", makeDefault ? 1 : 0, data.hourly_rate ?? 0, timestamp, timestamp,
      );
      if (makeDefault) await db.runAsync("UPDATE profile SET default_house_id = ? WHERE id = 'singleton'", id);
    });
    const row = await db.getFirstAsync<HouseRow>("SELECT id, name, address, is_default, hourly_rate FROM houses WHERE id = ?", id);
    if (!row) throw new Error("House was not saved");
    return mapHouse(row);
  },

  async updateHouse(id: string, data: Partial<Omit<House, "id">>): Promise<House> {
    const db = await getDatabase();
    const currentRow = await db.getFirstAsync<HouseRow>(
      "SELECT id, name, address, is_default, hourly_rate FROM houses WHERE id = ?",
      id,
    );
    if (!currentRow) throw new Error("House not found");
    const current = mapHouse(currentRow);
    const next: House = { ...current, ...data, id };
    await db.withTransactionAsync(async () => {
      if (data.is_default === true) await db.runAsync("UPDATE houses SET is_default = 0");
      const result = await db.runAsync(
        "UPDATE houses SET name = ?, address = ?, is_default = ?, hourly_rate = ?, updated_at = ? WHERE id = ?",
        next.name, next.address ?? "", next.is_default ? 1 : 0, next.hourly_rate ?? 0, nowIso(), id,
      );
      if (!result.changes) throw new Error("House not found");
      if (next.name !== current.name) {
        await db.runAsync(
          "UPDATE shifts SET house_name = ?, updated_at = ? WHERE house_id = ? AND is_deleted = 0",
          next.name, nowIso(), id,
        );
      }
      if (data.is_default === true) {
        await db.runAsync("UPDATE profile SET default_house_id = ? WHERE id = 'singleton'", id);
      }
    });
    const row = await db.getFirstAsync<HouseRow>("SELECT id, name, address, is_default, hourly_rate FROM houses WHERE id = ?", id);
    if (!row) throw new Error("House not found");
    return mapHouse(row);
  },

  async deleteHouse(id: string): Promise<{ ok: boolean }> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE shifts SET house_id = NULL WHERE house_id = ?", id);
      await db.runAsync("DELETE FROM houses WHERE id = ?", id);
      await db.runAsync("UPDATE profile SET default_house_id = NULL WHERE default_house_id = ?", id);
    });
    return { ok: true };
  },

  async listShifts(month?: string): Promise<Shift[]> {
    const db = await getDatabase();
    const rows = month
      ? await db.getAllAsync<ShiftRow>("SELECT * FROM shifts WHERE is_deleted = 0 AND date LIKE ? ORDER BY date, start_time", `${month}%`)
      : await db.getAllAsync<ShiftRow>("SELECT * FROM shifts WHERE is_deleted = 0 ORDER BY date, start_time");
    if (!rows.length) return [];
    const edits = await db.getAllAsync<ShiftEdit & { shift_id: string }>(
      `SELECT shift_id, changed_at, previous_start, previous_end, new_start, new_end, phase, hours_delta
       FROM shift_changes WHERE change_type = 'update' ORDER BY changed_at`,
    );
    const byShift = new Map<string, ShiftEdit[]>();
    for (const edit of edits) {
      const values = byShift.get(edit.shift_id) ?? [];
      values.push(edit);
      byShift.set(edit.shift_id, values);
    }
    return rows.map((row) => ({ ...mapShift(row), edits: byShift.get(row.id) ?? [] }));
  },

  getShift: shiftWithEdits,
  addShift: insertShift,

  async bulkAddShifts(shifts: NewShift[]): Promise<Shift[]> {
    const db = await getDatabase();
    const ids: string[] = [];
    await db.withTransactionAsync(async () => {
      for (const data of shifts) {
        const id = newId();
        const timestamp = nowIso();
        ids.push(id);
        await db.runAsync(
          `INSERT INTO shifts (
            id, date, start_time, end_time, house_id, house_name, alarm_enabled, notes,
            source, roster_scan_id, confidence, confirmation_status, original_date,
            original_start_time, original_end_time, original_house_id, original_house_name,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, data.date, data.start_time, data.end_time, data.house_id ?? null, data.house_name ?? "",
          data.alarm_enabled === false ? 0 : 1, data.notes ?? "", data.source ?? "roster",
          data.roster_scan_id ?? null, data.confidence ?? null, data.confirmation_status ?? "confirmed",
          data.original_date ?? data.date, data.original_start_time ?? data.start_time,
          data.original_end_time ?? data.end_time, data.original_house_id ?? data.house_id ?? null,
          data.original_house_name ?? data.house_name ?? "", timestamp, timestamp,
        );
      }
    });
    return Promise.all(ids.map(shiftWithEdits));
  },

  async updateShift(id: string, data: Partial<Shift>): Promise<Shift> {
    const current = await shiftWithEdits(id);
    const next = { ...current, ...data };
    const previousSnapshot = {
      date: current.date, start_time: current.start_time, end_time: current.end_time,
      house_id: current.house_id ?? null, house_name: current.house_name,
      alarm_enabled: current.alarm_enabled, notes: current.notes,
    };
    const nextSnapshot = {
      date: next.date, start_time: next.start_time, end_time: next.end_time,
      house_id: next.house_id ?? null, house_name: next.house_name,
      alarm_enabled: next.alarm_enabled, notes: next.notes,
    };
    if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) return current;
    const db = await getDatabase();
    const timestamp = nowIso();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE shifts SET date = ?, start_time = ?, end_time = ?, house_id = ?, house_name = ?,
         alarm_enabled = ?, notes = ?, updated_at = ? WHERE id = ? AND is_deleted = 0`,
        next.date, next.start_time, next.end_time, next.house_id ?? null, next.house_name,
        next.alarm_enabled ? 1 : 0, next.notes, timestamp, id,
      );
      await db.runAsync(
        `INSERT INTO shift_changes (
          id, shift_id, changed_at, change_type, phase, previous_json, new_json,
          previous_start, previous_end, new_start, new_end, hours_delta
        ) VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), id, timestamp, changePhase(current.date, current.start_time, current.end_time),
        JSON.stringify(previousSnapshot), JSON.stringify(nextSnapshot), current.start_time, current.end_time,
        next.start_time, next.end_time,
        Math.round((durationHours(next.start_time, next.end_time) - durationHours(current.start_time, current.end_time)) * 100) / 100,
      );
    });
    return shiftWithEdits(id);
  },

  async deleteShift(id: string): Promise<{ ok: boolean }> {
    const current = await shiftWithEdits(id);
    const db = await getDatabase();
    const timestamp = nowIso();
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE shifts SET is_deleted = 1, updated_at = ? WHERE id = ?", timestamp, id);
      await db.runAsync(
        `INSERT INTO shift_changes (
          id, shift_id, changed_at, change_type, phase, previous_json, new_json,
          previous_start, previous_end, new_start, new_end, hours_delta
        ) VALUES (?, ?, ?, 'delete', ?, ?, '{}', ?, ?, ?, ?, ?)`,
        newId(), id, timestamp, changePhase(current.date, current.start_time, current.end_time),
        JSON.stringify(current), current.start_time, current.end_time, current.start_time, current.end_time,
        -durationHours(current.start_time, current.end_time),
      );
    });
    return { ok: true };
  },

  async payslipCompare(entries: PayslipEntry[]): Promise<PayslipCompareResponse> {
    const db = await getDatabase();
    const results: PayslipResult[] = [];
    for (const entry of entries) {
      const shifts = await db.getAllAsync<Pick<Shift, "id" | "start_time" | "end_time">>(
        "SELECT id, start_time, end_time FROM shifts WHERE is_deleted = 0 AND date = ?", entry.date,
      );
      const recorded = Math.round(shifts.reduce((sum, shift) => sum + durationHours(shift.start_time, shift.end_time), 0) * 100) / 100;
      const delta = Math.round((entry.paid_hours - recorded) * 100) / 100;
      results.push({ date: entry.date, paid_hours: entry.paid_hours, recorded_hours: recorded,
        delta, match: Math.abs(delta) < 0.01, shift_ids: shifts.map((shift) => shift.id) });
    }
    return {
      results,
      total_paid: Math.round(results.reduce((sum, row) => sum + row.paid_hours, 0) * 100) / 100,
      total_recorded: Math.round(results.reduce((sum, row) => sum + row.recorded_hours, 0) * 100) / 100,
      total_delta: Math.round(results.reduce((sum, row) => sum + row.delta, 0) * 100) / 100,
    };
  },

  async addRosterScan(data: Omit<RosterScan, "id" | "captured_at">): Promise<RosterScan> {
    const db = await getDatabase();
    const scan: RosterScan = { ...data, id: newId(), captured_at: nowIso() };
    await db.runAsync(
      `INSERT INTO roster_scans (id,captured_at,original_uri,image_sha256,ocr_engine,parser_version,
       overall_confidence,status,raw_ocr_json) VALUES (?,?,?,?,?,?,?,?,?)`,
      scan.id, scan.captured_at, scan.original_uri ?? null, scan.image_sha256 ?? null,
      scan.ocr_engine, scan.parser_version, scan.overall_confidence ?? null, scan.status,
      scan.raw_ocr_json ?? null,
    );
    return scan;
  },

  async updateRosterScanStatus(id: string, status: RosterScan["status"]): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("UPDATE roster_scans SET status = ? WHERE id = ?", status, id);
  },

};
