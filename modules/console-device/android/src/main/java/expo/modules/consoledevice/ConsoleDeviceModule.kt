package expo.modules.consoledevice

import android.Manifest
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.media.audiofx.Visualizer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Device access Expo does not cover: a read-only MediaStore query for old
 * Android, a raw file explorer, MediaStore indexing on demand, and the
 * system-wide audio visualizer.
 */
class ConsoleDeviceModule : Module() {
  /** Session 0 visualizer: the mix of everything the device is playing. */
  private var visualizer: Visualizer? = null

  private val context
    get() = appContext.reactContext ?: error("Android context unavailable")

  override fun definition() = ModuleDefinition {
    Name("ConsoleDevice")

    Events("onSpectrum")

    Function("isInMultiWindow") {
      appContext.currentActivity?.isInMultiWindowMode ?: false
    }

    AsyncFunction("getAudioPage") { afterId: Long, limit: Int ->
      val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
      val projection = arrayOf(
        MediaStore.Audio.Media._ID,
        MediaStore.Audio.Media.DISPLAY_NAME,
        MediaStore.Audio.Media.DATA,
        MediaStore.Audio.Media.DURATION,
        MediaStore.Audio.Media.DATE_ADDED
      )
      val assets = mutableListOf<Map<String, Any>>()
      var lastId = afterId
      var hasNextPage = false
      // Keyset pagination avoids unstable offsets when files are added mid-scan.
      context.contentResolver.query(
        collection, projection, "${MediaStore.Audio.Media._ID} > ?",
        arrayOf(afterId.toString()), "${MediaStore.Audio.Media._ID} ASC"
      )?.use { cursor ->
        val pageSize = limit.coerceIn(1, 500)
        while (cursor.moveToNext()) {
          if (assets.size == pageSize) {
            hasNextPage = true
            break
          }
          lastId = cursor.getLong(0)
          val path = cursor.getString(2)
          val uri = if (!path.isNullOrEmpty()) {
            Uri.fromFile(File(path)).toString()
          } else {
            ContentUris.withAppendedId(collection, lastId).toString()
          }
          assets.add(mapOf(
            "id" to lastId.toString(),
            "uri" to uri,
            "filename" to (cursor.getString(1) ?: "audio-$lastId"),
            "duration" to cursor.getLong(3) / 1000.0,
            "creationTime" to cursor.getLong(4) * 1000.0
          ))
        }
      } ?: error("No se pudo consultar la biblioteca de audio")
      mapOf("assets" to assets, "endCursor" to lastId.toString(), "hasNextPage" to hasNextPage)
    }

    // ------------------------------------------------------------ file explorer

    Function("hasAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        granted(Manifest.permission.READ_EXTERNAL_STORAGE)
      }
    }

    /** Android 11+ grants all-files access only from its own settings page. */
    Function("openAllFilesAccessSettings") {
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
      val specific = Intent(
        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
        Uri.parse("package:${activity.packageName}")
      )
      try {
        activity.startActivity(specific)
      } catch (_: Exception) {
        // Some vendor builds only ship the generic list.
        activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
      }
      true
    }

    /** Internal storage first, then each mounted card or stick. */
    Function("getStorageRoots") {
      val roots = linkedSetOf(Environment.getExternalStorageDirectory().absolutePath)
      for (dir in context.getExternalFilesDirs(null)) {
        // `/storage/XXXX-XXXX/Android/data/<pkg>/files` -> `/storage/XXXX-XXXX`.
        val path = dir?.absolutePath ?: continue
        val cut = path.indexOf("/Android/")
        if (cut > 0) roots.add(path.substring(0, cut))
      }
      roots.toList()
    }

    AsyncFunction("listDirectory") { path: String ->
      val dir = File(path)
      val children = dir.listFiles() ?: error("No se puede abrir $path")
      children
        .filter { !it.name.startsWith(".") }
        .map {
          mapOf(
            "name" to it.name,
            "path" to it.absolutePath,
            "isDirectory" to it.isDirectory,
            "size" to (if (it.isFile) it.length().toDouble() else 0.0),
            "modified" to it.lastModified().toDouble()
          )
        }
    }

    /** Every file under `path`, depth-first, skipping hidden entries. */
    AsyncFunction("walkFiles") { path: String, limit: Int ->
      val out = mutableListOf<String>()
      val pending = ArrayDeque<File>().apply { add(File(path)) }
      while (pending.isNotEmpty() && out.size < limit) {
        val dir = pending.removeFirst()
        val children = dir.listFiles()?.sortedBy { it.name.lowercase() } ?: continue
        for (child in children) {
          if (child.name.startsWith(".")) continue
          if (child.isDirectory) pending.add(child) else out.add(child.absolutePath)
          if (out.size >= limit) break
        }
      }
      out
    }

    /** Asks MediaStore to index files now, so they join the library. */
    AsyncFunction("scanPaths") { paths: List<String>, promise: Promise ->
      if (paths.isEmpty()) {
        promise.resolve(0)
        return@AsyncFunction
      }
      val remaining = AtomicInteger(paths.size)
      MediaScannerConnection.scanFile(context, paths.toTypedArray(), null) { _, _ ->
        if (remaining.decrementAndGet() == 0) promise.resolve(paths.size)
      }
    }

    // ------------------------------------------------------- system visualizer

    /**
     * Starts reading the output mix. Returns the FFT layout so JS can map bins
     * to bands, or `null` when the device refuses session 0.
     */
    AsyncFunction("startVisualizer") {
      if (!granted(Manifest.permission.RECORD_AUDIO)) return@AsyncFunction null
      val existing = visualizer
      if (existing != null) return@AsyncFunction layoutOf(existing)
      try {
        val created = Visualizer(0)
        created.enabled = false
        created.captureSize = Visualizer.getCaptureSizeRange()[1].coerceAtMost(1024)
        created.scalingMode = Visualizer.SCALING_MODE_NORMALIZED
        created.setDataCaptureListener(
          object : Visualizer.OnDataCaptureListener {
            override fun onWaveFormDataCapture(v: Visualizer?, waveform: ByteArray?, rate: Int) = Unit
            override fun onFftDataCapture(v: Visualizer?, fft: ByteArray?, rate: Int) {
              if (fft != null) sendEvent("onSpectrum", mapOf("bins" to toByteLevels(fft)))
            }
          },
          Visualizer.getMaxCaptureRate().coerceAtMost(20000),
          false,
          true
        )
        created.enabled = true
        visualizer = created
        layoutOf(created)
      } catch (_: Exception) {
        // Vendor builds may block the global mix; the UI falls back to rest.
        null
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopVisualizer") {
      release()
    }.runOnQueue(Queues.MAIN)

    OnDestroy { release() }
  }

  private fun granted(permission: String) =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun layoutOf(v: Visualizer) = mapOf(
    "binCount" to v.captureSize / 2,
    // Reported in milliHertz.
    "sampleRate" to v.samplingRate / 1000.0
  )

  private fun release() {
    visualizer?.let {
      it.enabled = false
      it.release()
    }
    visualizer = null
  }

  /**
   * Turns Visualizer FFT bytes into 0–255 levels, the shape Web Audio's
   * `getByteFrequencyData` produces, so the same band mapping applies.
   *
   * Layout: `[0]` DC, `[1]` Nyquist, then real/imaginary pairs.
   */
  private fun toByteLevels(fft: ByteArray): List<Int> {
    val bins = fft.size / 2
    val out = ArrayList<Int>(bins)
    out.add(0)
    for (k in 1 until bins) {
      val re = fft[2 * k].toFloat()
      val im = fft[2 * k + 1].toFloat()
      val magnitude = sqrt(re * re + im * im)
      // 128 is full scale; map -40 dB..0 dB onto 0..255.
      val db = 20 * log10((magnitude / 128f).coerceAtLeast(1e-4f))
      out.add((((db + DB_RANGE) / DB_RANGE) * 255).toInt().coerceIn(0, 255))
    }
    return out
  }

  private companion object {
    const val DB_RANGE = 40f
  }
}
