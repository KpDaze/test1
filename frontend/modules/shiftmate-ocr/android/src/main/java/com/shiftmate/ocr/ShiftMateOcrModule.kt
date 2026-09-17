package com.shiftmate.ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Point
import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

private data class OcrVariant(val bitmap: Bitmap, val name: String)
private data class OcrCandidate(
  val text: Text,
  val rotationDegrees: Int,
  val score: Double,
  val preprocessing: String,
  val width: Int,
  val height: Int,
)

class ShiftMateOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShiftMateOcr")

    AsyncFunction("recognizeAsync") { uriString: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "Android context is unavailable", null)
        return@AsyncFunction
      }

      try {
        val uri = Uri.parse(uriString)
        val decodedBitmap = decodeBitmap(context.contentResolver, uri)
        val bitmap = upscaleSmallText(decodedBitmap)
        if (bitmap !== decodedBitmap) decodedBitmap.recycle()
        val enhancedBitmap = highContrastGrayscale(bitmap)
        val variants = listOf(
          OcrVariant(bitmap, "upscaled-original"),
          OcrVariant(enhancedBitmap, "upscaled-high-contrast"),
        )
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val rotations = intArrayOf(0, 90, 270, 180)
        val attempts = variants.flatMap { variant -> rotations.map { rotation -> variant to rotation } }
        val candidates = mutableListOf<OcrCandidate>()
        var lastError: Exception? = null

        fun finish() {
          val best = candidates.maxByOrNull { it.score }
          if (best == null) {
            promise.reject("ERR_OCR_FAILED", lastError?.message ?: "On-device OCR failed", lastError)
          } else {
            promise.resolve(mapOf(
              "text" to best.text.text,
              "width" to best.width,
              "height" to best.height,
              "rotationDegrees" to best.rotationDegrees,
              "engine" to "mlkit-bundled-latin-v3-enhanced",
              "preprocessing" to best.preprocessing,
              "blocks" to best.text.textBlocks.map(::blockMap),
            ))
          }
          recognizer.close()
          variants.map { it.bitmap }.distinctBy { System.identityHashCode(it) }.forEach { it.recycle() }
        }

        lateinit var processNext: (Int) -> Unit
        processNext = { index ->
          if (index >= attempts.size) {
            finish()
          } else {
            val (variant, rotation) = attempts[index]
            // Rotate the bitmap pixels themselves instead of relying on InputImage's
            // rotation metadata. This keeps ML Kit's returned bounding boxes in the
            // same upright coordinate system that the roster geometry parser uses.
            // Sideways roster photos previously produced readable text but coordinates
            // that could not reliably locate the employee row.
            val orientedBitmap = rotateBitmap(variant.bitmap, rotation)
            recognizer.process(InputImage.fromBitmap(orientedBitmap, 0))
              .addOnSuccessListener { result ->
                candidates.add(
                  OcrCandidate(
                    result,
                    rotation,
                    orientationScore(result),
                    variant.name,
                    orientedBitmap.width,
                    orientedBitmap.height,
                  )
                )
                if (orientedBitmap !== variant.bitmap) orientedBitmap.recycle()
                processNext(index + 1)
              }
              .addOnFailureListener { error ->
                lastError = error
                if (orientedBitmap !== variant.bitmap) orientedBitmap.recycle()
                processNext(index + 1)
              }
          }
        }
        processNext(0)
      } catch (error: Exception) {
        promise.reject("ERR_OCR_INPUT", error.message ?: "Roster image could not be opened", error)
      }
    }
  }

  private fun decodeBitmap(resolver: android.content.ContentResolver, uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().also { options ->
      options.inJustDecodeBounds = true
      resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
    }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("Roster image dimensions could not be read")
    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 3200 || bounds.outHeight / sampleSize > 3200) sampleSize *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw IllegalArgumentException("Roster image could not be decoded")
  }

  private fun upscaleSmallText(bitmap: Bitmap): Bitmap {
    val longestSide = maxOf(bitmap.width, bitmap.height)
    if (longestSide >= 2200) return bitmap
    val scale = minOf(2.5f, 2400f / longestSide.toFloat())
    return Bitmap.createScaledBitmap(
      bitmap,
      (bitmap.width * scale).toInt(),
      (bitmap.height * scale).toInt(),
      true,
    )
  }

  private fun rotateBitmap(bitmap: Bitmap, rotationDegrees: Int): Bitmap {
    if (rotationDegrees % 360 == 0) return bitmap
    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private fun highContrastGrayscale(bitmap: Bitmap): Bitmap {
    val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
    val contrast = 1.75f
    val offset = 128f * (1f - contrast)
    val red = 0.213f * contrast
    val green = 0.715f * contrast
    val blue = 0.072f * contrast
    val matrix = android.graphics.ColorMatrix(floatArrayOf(
      red, green, blue, 0f, offset,
      red, green, blue, 0f, offset,
      red, green, blue, 0f, offset,
      0f, 0f, 0f, 1f, 0f,
    ))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      colorFilter = ColorMatrixColorFilter(matrix)
    }
    Canvas(output).drawBitmap(bitmap, 0f, 0f, paint)
    return output
  }

  private fun orientationScore(result: Text): Double {
    val lines = result.textBlocks.flatMap { it.lines }
    val horizontalLines = lines.count { line ->
      val angle = ((line.angle % 360f) + 360f) % 360f
      abs(angle) <= 20f || abs(angle - 360f) <= 20f
    }
    val structuredMatches = STRUCTURED_TEXT.findAll(result.text).count()
    return structuredMatches * 120.0 + horizontalLines * 12.0 + result.text.count { !it.isWhitespace() } * 0.02
  }

  private fun rectMap(rect: Rect?): Map<String, Int>? = rect?.let {
    mapOf("left" to it.left, "top" to it.top, "right" to it.right, "bottom" to it.bottom,
      "width" to it.width(), "height" to it.height())
  }

  private fun pointsMap(points: Array<Point>?): List<Map<String, Int>> =
    points?.map { mapOf("x" to it.x, "y" to it.y) } ?: emptyList()

  private fun elementMap(element: Text.Element): Map<String, Any?> = mapOf(
    "text" to element.text,
    "confidence" to element.confidence,
    "boundingBox" to rectMap(element.boundingBox),
    "cornerPoints" to pointsMap(element.cornerPoints),
  )

  private fun lineMap(line: Text.Line): Map<String, Any?> = mapOf(
    "text" to line.text,
    "confidence" to line.confidence,
    "boundingBox" to rectMap(line.boundingBox),
    "cornerPoints" to pointsMap(line.cornerPoints),
    "angle" to line.angle,
    "elements" to line.elements.map(::elementMap),
  )

  private fun blockMap(block: Text.TextBlock): Map<String, Any?> = mapOf(
    "text" to block.text,
    "boundingBox" to rectMap(block.boundingBox),
    "cornerPoints" to pointsMap(block.cornerPoints),
    "lines" to block.lines.map(::lineMap),
  )

  companion object {
    private val STRUCTURED_TEXT = Regex(
      """(?i)(\b(?:mon|tue(?:s)?|wed|thu(?:rs)?|fri|sat|sun|roster|hours|name|leave|r[\s/.|]*[oi0])\b|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}:?\d{2}\s*[-–—]\s*\d{1,2}:?\d{2})"""
    )
  }
}
