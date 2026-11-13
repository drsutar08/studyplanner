Pod::Spec.new do |s|
  s.name           = 'AppShortcuts'
  s.version        = '1.0.0'
  s.summary        = 'Home screen quick actions for Study Planner'
  s.description    = 'Long-press shortcuts on the app icon (UIApplicationShortcutItem)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.swift"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
