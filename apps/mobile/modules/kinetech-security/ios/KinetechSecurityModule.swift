import ExpoModulesCore
import UIKit

/// Device environment checks for the KineTech shell (2027-architecture.md §2.4).
///
/// Honest scope: these are cheap heuristics. They raise the cost of copying
/// and let the app refuse obviously unsafe environments; they are not DRM and
/// a determined attacker can bypass them.
public class KinetechSecurityModule: Module {
  private var captureObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("KinetechSecurity")

    Events("onCaptureChange")

    AsyncFunction("getEnvironmentRisk") { () -> [String: Bool] in
      #if targetEnvironment(simulator)
      let simulator = true
      #else
      let simulator = false
      #endif

      return [
        "root": false,
        "emulator": simulator,
        "adb": false,
        "jailbreak": Self.hasJailbreakFiles(),
        "simulator": simulator,
        "screenCapture": Self.screenIsCaptured(),
        "externalDisplay": UIScreen.screens.count > 1
      ]
    }
    .runOnQueue(.main)

    AsyncFunction("isScreenCaptured") { () -> Bool in
      Self.screenIsCaptured()
    }
    .runOnQueue(.main)

    OnStartObserving("onCaptureChange") {
      guard self.captureObserver == nil else { return }
      self.captureObserver = NotificationCenter.default.addObserver(
        forName: UIScreen.capturedDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onCaptureChange", ["captured": Self.screenIsCaptured()])
      }
      // Report the state at subscription time too — a recording may already
      // be running when the player opens.
      self.sendEvent("onCaptureChange", ["captured": Self.screenIsCaptured()])
    }

    OnStopObserving("onCaptureChange") {
      if let observer = self.captureObserver {
        NotificationCenter.default.removeObserver(observer)
        self.captureObserver = nil
      }
    }
  }

  private static func screenIsCaptured() -> Bool {
    if #available(iOS 15.0, *) {
      return UIScreen.main.isCaptured
    }
    return false
  }

  private static func hasJailbreakFiles() -> Bool {
    let paths = [
      "/Applications/Cydia.app",
      "/Library/MobileSubstrate/MobileSubstrate.dylib",
      "/bin/bash",
      "/usr/sbin/sshd",
      "/etc/apt",
      "/private/var/lib/apt"
    ]
    return paths.contains { FileManager.default.fileExists(atPath: $0) }
  }
}
