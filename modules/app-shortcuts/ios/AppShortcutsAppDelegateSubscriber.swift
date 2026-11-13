import ExpoModulesCore
import UIKit

// Receives a pressed shortcut from the app delegate (Expo forwards the scene's cold-start and running cases here).
// While the JavaScript side is listening it gets an event; before that (a cold start) the link waits in pendingUrl.
public class AppShortcutsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  static var pendingUrl: String?

  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let url = shortcutItem.userInfo?["url"] as? String else {
      completionHandler(false)
      return
    }
    // kept as well as sent: a cold start's event can fire before JavaScript listens
    AppShortcutsAppDelegateSubscriber.pendingUrl = url
    AppShortcutsModule.current?.pressed(url)
    completionHandler(true)
  }
}
