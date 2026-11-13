package expo.modules.appshortcuts

import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// One long-press shortcut: its link opens the app like any other studyplanner:// link (React Native's Linking)
class Shortcut : Record {
  @Field
  val id: String = ""

  @Field
  val title: String = ""

  @Field
  val url: String = ""
}

// Long-press shortcuts on the app icon (dynamic shortcuts). The app sets them in its language as it starts.
class AppShortcutsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppShortcuts")

    Function("setShortcuts") { items: List<Shortcut> ->
      val context = appContext.reactContext ?: return@Function false
      val icon = IconCompat.createWithResource(context, context.applicationInfo.icon)
      val max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context).coerceAtLeast(1)
      val shortcuts = items.take(minOf(4, max)).map { item ->
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(item.url)).setPackage(context.packageName)
        ShortcutInfoCompat.Builder(context, item.id)
          .setShortLabel(item.title)
          .setLongLabel(item.title)
          .setIcon(icon)
          .setIntent(intent)
          .build()
      }
      ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
    }

    // iOS hands over the shortcut a cold start came from; on Android the link arrives through Linking instead
    Function("takeLaunchUrl") { null as String? }
  }
}
