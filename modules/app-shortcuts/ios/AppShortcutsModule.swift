import ExpoModulesCore
import UIKit

// One long-press shortcut: an SF Symbol and the studyplanner:// link it opens
struct Shortcut: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var url: String = ""
  @Field var symbol: String = "plus"
}

// Long-press shortcuts on the app icon (UIApplicationShortcutItem). The app sets them in its language as it starts;
// a pressed one reaches JavaScript as an "onShortcut" event, or through takeLaunchUrl() when it started the app.
public class AppShortcutsModule: Module {
  static weak var current: AppShortcutsModule?

  public func definition() -> ModuleDefinition {
    Name("AppShortcuts")
    Events("onShortcut")

    OnCreate {
      AppShortcutsModule.current = self
    }

    Function("setShortcuts") { (items: [Shortcut]) -> Bool in
      let list = items.prefix(4).map { item in
        UIApplicationShortcutItem(
          type: item.id,
          localizedTitle: item.title,
          localizedSubtitle: nil,
          icon: UIApplicationShortcutIcon(systemImageName: item.symbol),
          userInfo: ["url": item.url as NSString]
        )
      }
      DispatchQueue.main.async {
        UIApplication.shared.shortcutItems = Array(list)
      }
      return true
    }

    Function("takeLaunchUrl") { () -> String? in
      let url = AppShortcutsAppDelegateSubscriber.pendingUrl
      AppShortcutsAppDelegateSubscriber.pendingUrl = nil
      return url
    }
  }

  func pressed(_ url: String) {
    sendEvent("onShortcut", ["url": url])
  }
}
