package com.shiftmate.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

data class ShiftAlarmRecord(val shiftId: String, val triggerAt: Long, val title: String, val body: String)

object ShiftAlarmScheduler {
  private const val PREFS = "shiftmate-exact-alarms"

  fun schedule(context: Context, record: ShiftAlarmRecord, persist: Boolean) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
      throw SecurityException("Allow ShiftMate to set exact alarms and reminders, then save the shift again.")
    }
    val operation = PendingIntent.getBroadcast(
      context, record.shiftId.hashCode(), triggerIntent(context, record),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val show = PendingIntent.getActivity(
      context, record.shiftId.hashCode(), ShiftAlarmActivity.intent(context, record),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    manager.setAlarmClock(AlarmManager.AlarmClockInfo(record.triggerAt, show), operation)
    if (persist) save(context, record)
  }

  fun cancel(context: Context, shiftId: String, removePersisted: Boolean) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = PendingIntent.getBroadcast(
      context, shiftId.hashCode(), Intent(context, ShiftAlarmReceiver::class.java).apply {
        action = ShiftAlarmReceiver.ACTION_TRIGGER
        putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, shiftId)
      }, PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    )
    if (pending != null) manager.cancel(pending)
    if (removePersisted) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(shiftId).apply()
  }

  fun restoreAll(context: Context) {
    val records = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all.values
      .mapNotNull { value -> runCatching { fromJson(value as String) }.getOrNull() }
      .filter { it.triggerAt > System.currentTimeMillis() }
    records.forEach { runCatching { schedule(context, it, false) } }
  }

  private fun triggerIntent(context: Context, record: ShiftAlarmRecord) =
    Intent(context, ShiftAlarmReceiver::class.java).apply {
      action = ShiftAlarmReceiver.ACTION_TRIGGER
      putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, record.shiftId)
      putExtra(ShiftAlarmReceiver.EXTRA_TITLE, record.title)
      putExtra(ShiftAlarmReceiver.EXTRA_BODY, record.body)
    }

  private fun save(context: Context, record: ShiftAlarmRecord) {
    val json = JSONObject().put("shiftId", record.shiftId).put("triggerAt", record.triggerAt)
      .put("title", record.title).put("body", record.body).toString()
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(record.shiftId, json).apply()
  }

  private fun fromJson(value: String): ShiftAlarmRecord {
    val json = JSONObject(value)
    return ShiftAlarmRecord(json.getString("shiftId"), json.getLong("triggerAt"), json.getString("title"), json.getString("body"))
  }
}
