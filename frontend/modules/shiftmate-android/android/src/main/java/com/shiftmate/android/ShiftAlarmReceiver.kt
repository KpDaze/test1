package com.shiftmate.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

class ShiftAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val shiftId = intent.getStringExtra(EXTRA_SHIFT_ID) ?: return
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "ShiftMate alarm"
    val body = intent.getStringExtra(EXTRA_BODY) ?: "Your shift is coming up"
    when (intent.action) {
      ACTION_DISMISS -> dismiss(context, shiftId)
      ACTION_SNOOZE -> {
        ShiftAlarmRingerService.stop(context)
        dismissNotification(context, shiftId)
        ShiftAlarmScheduler.schedule(context, ShiftAlarmRecord(shiftId, System.currentTimeMillis() + 10 * 60_000L, title, body), true)
      }
      else -> ShiftAlarmRingerService.start(context, ShiftAlarmRecord(shiftId, System.currentTimeMillis(), title, body))
    }
  }

  private fun dismiss(context: Context, shiftId: String) {
    ShiftAlarmRingerService.stop(context)
    dismissNotification(context, shiftId)
    ShiftAlarmScheduler.cancel(context, shiftId, true)
  }

  private fun dismissNotification(context: Context, shiftId: String) =
    NotificationManagerCompat.from(context).cancel(ShiftAlarmRingerService.notificationId(shiftId))

  companion object {
    const val ACTION_TRIGGER = "com.shiftmate.android.TRIGGER"
    const val ACTION_SNOOZE = "com.shiftmate.android.SNOOZE"
    const val ACTION_DISMISS = "com.shiftmate.android.DISMISS"
    const val EXTRA_SHIFT_ID = "shiftId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
  }
}
