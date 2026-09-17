package com.shiftmate.android

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class ShiftAlarmActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true); setTurnScreenOn(true)
    val shiftId = intent.getStringExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID) ?: run { finish(); return }
    val title = intent.getStringExtra(ShiftAlarmReceiver.EXTRA_TITLE) ?: "ShiftMate alarm"
    val body = intent.getStringExtra(ShiftAlarmReceiver.EXTRA_BODY) ?: "Your shift is coming up"
    window.statusBarColor = Color.rgb(22, 24, 25)

    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(48, 64, 48, 64); setBackgroundColor(Color.rgb(22, 24, 25))
    }
    layout.addView(TextView(this).apply { text = "SHIFT-MATE"; textSize = 16f; setTextColor(Color.rgb(212,132,76)); gravity = Gravity.CENTER })
    layout.addView(TextView(this).apply { text = title; textSize = 32f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(0,32,0,16) })
    layout.addView(TextView(this).apply { text = body; textSize = 20f; setTextColor(Color.LTGRAY); gravity = Gravity.CENTER; setPadding(0,0,0,48) })
    layout.addView(Button(this).apply {
      text = "SNOOZE 10 MINUTES"; setOnClickListener { send(ShiftAlarmReceiver.ACTION_SNOOZE, shiftId, title, body); finish() }
    }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    layout.addView(Button(this).apply {
      text = "DISMISS"; setOnClickListener { send(ShiftAlarmReceiver.ACTION_DISMISS, shiftId, title, body); finish() }
    }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = 20 })
    setContentView(layout)
  }

  private fun send(action: String, shiftId: String, title: String, body: String) {
    sendBroadcast(Intent(this, ShiftAlarmReceiver::class.java).apply {
      this.action = action
      putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, shiftId)
      putExtra(ShiftAlarmReceiver.EXTRA_TITLE, title)
      putExtra(ShiftAlarmReceiver.EXTRA_BODY, body)
    })
  }

  companion object {
    fun intent(context: Context, record: ShiftAlarmRecord) = Intent(context, ShiftAlarmActivity::class.java).apply {
      putExtra(ShiftAlarmReceiver.EXTRA_SHIFT_ID, record.shiftId)
      putExtra(ShiftAlarmReceiver.EXTRA_TITLE, record.title)
      putExtra(ShiftAlarmReceiver.EXTRA_BODY, record.body)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  }
}
