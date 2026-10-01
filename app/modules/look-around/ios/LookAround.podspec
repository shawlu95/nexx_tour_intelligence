Pod::Spec.new do |s|
  s.name           = 'LookAround'
  s.version        = '1.0.0'
  s.summary        = 'Street-level home thumbnails from Apple Look Around'
  s.description    = 'Generates small Look Around (or map) thumbnails on the device for NORA.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'UIKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
