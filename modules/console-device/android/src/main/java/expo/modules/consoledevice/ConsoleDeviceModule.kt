package expo.modules.consoledevice

import android.content.ContentUris
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Read-only fallback for the legacy media library's WRITE permission guard. */
class ConsoleDeviceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConsoleDevice")

    Function("isInMultiWindow") {
      appContext.currentActivity?.isInMultiWindowMode ?: false
    }

    AsyncFunction("getAudioPage") { afterId: Long, limit: Int ->
      val context = appContext.reactContext ?: error("Android context unavailable")
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
            android.net.Uri.fromFile(File(path)).toString()
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
  }
}
