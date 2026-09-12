package com.shiftmate.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

class ShiftAlarmRingerService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val shiftId = intent?.getStringExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID) ?: run {
      stopSelf()
      return START_NOT_STICKY
    }
    val record = ShiftAlarmRecord(
      shiftId,
      System.currentTimeMillis(),
      intent.getStringExtra(ShiftAlarmReceiver.EXTRA_TITLE) ?: "ShiftMate alarm",
      intent.getStringExtra(ShiftAlarmReceiver.EXTRA_BODY) ?: "Your shift is coming up",
    )
    createChannel()
    val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    } else 0
    ServiceCompat.startForeground(
      this,
      notificationId(record.shiftId),
      notification(record),
      serviceType,
    )
    startRinging()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    player?.runCatching { stop() }
    player?.release()
    player = null
    vibrator?.cancel()
    vibrator = null
    super.onDestroy()
  }

  private fun startRinging() {
    if (player?.isPlaying == true) return
    val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    player = runCatching {
      MediaPlayer().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        setDataSource(this@ShiftAlarmRingerService, uri)
        isLooping = true
        prepare()
        start()
      }
    }.getOrNull()

    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    }
    val pattern = longArrayOf(0, 700, 300, 700, 600)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      @Suppress("DEPRECATION")
      vibrator?.vibrate(pattern, 0)
    }
  }

  private fun notification(record: ShiftAlarmRecord): Notification {
    val fullScreen = PendingIntent.getActivity(
      this, record.shiftId.hashCode(), ShiftAlarmActivity.intent(this, record),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val snooze = actionIntent(record, ShiftAlarmReceiver.ACTION_SNOOZE, 1)
    val dismiss = actionIntent(record, ShiftAlarmReceiver.ACTION_DISMISS, 2)
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(record.title)
      .setContentText(record.body)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setFullScreenIntent(fullScreen, true)
      .setContentIntent(fullScreen)
      .addAction(0, "Snooze 10 min", snooze)
      .addAction(0, "Dismiss", dismiss)
      .build()
  }

  private fun actionIntent(record: ShiftAlarmRecord, action: String, offset: Int) =
    PendingIntent.getBroadcast(this, notificationId(record.shiftId) + offset, Intent(this, ShiftAlarmReceiver::class.java).apply {
      this.action = action
      putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, record.shiftId)
      putExtra(ShiftAlarmReceiver.EXTRA_TITLE, record.title)
      putExtra(ShiftAlarmReceiver.EXTRA_BODY, record.body)
    }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL, "Shift alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "ShiftMate alarms that ring until snoozed or dismissed"
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
  }

  companion object {
    private const val ACTION_START = "com.shiftmate.android.RING_START"
    private const val ACTION_STOP = "com.shiftmate.android.RING_STOP"
    private const val CHANNEL = "shiftmate-native-alarm-continuous"

    fun notificationId(shiftId: String): Int {
      val value = shiftId.hashCode() and Int.MAX_VALUE
      return if (value == 0) 7101 else value
    }

    fun start(context: Context, record: ShiftAlarmRecord) {
      ContextCompat.startForegroundService(context, Intent(context, ShiftAlarmRingerService::class.java).apply {
        action = ACTION_START
        putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, record.shiftId)
        putExtra(ShiftAlarmReceiver.EXTRA_TITLE, record.title)
        putExtra(ShiftAlarmReceiver.EXTRA_BODY, record.body)
      })
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ShiftAlarmRingerService::class.java))
    }
  }
}
