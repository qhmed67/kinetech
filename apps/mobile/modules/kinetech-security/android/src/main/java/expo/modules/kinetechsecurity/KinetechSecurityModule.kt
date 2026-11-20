package expo.modules.kinetechsecurity

import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/// Device environment checks for the KineTech shell (2027-architecture.md §2.4).
///
/// Honest scope: cheap heuristics only. They raise the cost of copying and
/// block obviously unsafe environments; they are not DRM and a determined
/// attacker can bypass them. Screen capture itself is blocked by FLAG_SECURE
/// (see plugins/withSecureScreen), so there is no capture event here.
class KinetechSecurityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KinetechSecurity")

    Events("onCaptureChange")

    AsyncFunction("getEnvironmentRisk") {
      mapOf(
        "root" to isRooted(),
        "emulator" to isEmulator(),
        "adb" to isAdbEnabled(),
        "jailbreak" to false,
        "simulator" to false,
        "screenCapture" to false,
        "externalDisplay" to false
      )
    }

    AsyncFunction("isScreenCaptured") { false }
  }

  private fun isRooted(): Boolean {
    val paths = arrayOf(
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/data/local/su",
      "/su/bin/su"
    )
    if (paths.any { File(it).exists() }) return true
    return Build.TAGS?.contains("test-keys") == true
  }

  private fun isEmulator(): Boolean {
    val fingerprint = Build.FINGERPRINT.lowercase()
    val model = Build.MODEL.lowercase()
    val product = Build.PRODUCT.lowercase()
    return fingerprint.startsWith("generic") ||
      fingerprint.startsWith("unknown") ||
      fingerprint.contains("emulator") ||
      fingerprint.contains("genymotion") ||
      model.contains("emulator") ||
      product.contains("emulator") ||
      product.contains("sdk")
  }

  private fun isAdbEnabled(): Boolean {
    val resolver = appContext.reactContext?.contentResolver ?: return false
    return try {
      Settings.Global.getInt(resolver, Settings.Global.ADB_ENABLED, 0) == 1
    } catch (_: Exception) {
      false
    }
  }
}
