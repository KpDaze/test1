package com.shiftmate.android

import android.content.Intent
import android.app.AlarmManager
import android.content.Context
import android.net.Uri
import android.provider.Settings
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class ShiftMateAndroidModule : Module() {
  private var recognizer: SpeechRecognizer? = null
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ShiftMateAndroid")

    Function("isOnDeviceSpeechAvailable") {
      val context = appContext.reactContext
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && context != null &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }

    Function("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: return@Function false
      val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
    }

    Function("openExactAlarmSettings") {
      val context = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
      }
      null
    }

    AsyncFunction("scheduleShiftAlarmAsync") { shiftId: String, triggerAt: Double, title: String, body: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")
      ShiftAlarmScheduler.schedule(context, ShiftAlarmRecord(shiftId, triggerAt.toLong(), title, body), true)
      "shift-$shiftId"
    }

    AsyncFunction("cancelShiftAlarmAsync") { shiftId: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")
      ShiftAlarmScheduler.cancel(context, shiftId, true)
    }

    AsyncFunction("snoozeShiftAlarmAsync") { shiftId: String, minutes: Int, title: String, body: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")
      ShiftAlarmScheduler.schedule(context, ShiftAlarmRecord(shiftId, System.currentTimeMillis() + minutes * 60_000L, title, body), true)
    }

    AsyncFunction("recognizeSpeechAsync") { promise: Promise ->
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || context == null ||
        !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
        promise.reject("ERR_OFFLINE_SPEECH_UNAVAILABLE", "No on-device speech recognizer is installed", null)
        return@AsyncFunction
      }
      if (pendingPromise != null) {
        promise.reject("ERR_SPEECH_BUSY", "Speech recognition is already running", null)
        return@AsyncFunction
      }

      pendingPromise = promise
      recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { speech ->
        speech.setRecognitionListener(listener())
        speech.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        })
      }
    }.runOnQueue(Queues.MAIN)

    OnDestroy { finish() }
  }

  private fun listener() = object : RecognitionListener {
    override fun onResults(results: Bundle) {
      val matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
      if (matches.isEmpty()) reject("ERR_SPEECH_NO_MATCH", "No speech was recognised")
      else resolve(mapOf("transcript" to matches.first(), "alternatives" to matches.drop(1)))
    }
    override fun onError(error: Int) = reject("ERR_SPEECH_RECOGNITION", "On-device speech recognition failed ($error)")
    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onPartialResults(partialResults: Bundle?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  private fun resolve(value: Any) {
    pendingPromise?.resolve(value)
    pendingPromise = null
    finish()
  }

  private fun reject(code: String, message: String) {
    pendingPromise?.reject(code, message, null)
    pendingPromise = null
    finish()
  }

  private fun finish() {
    recognizer?.destroy()
    recognizer = null
  }
}
