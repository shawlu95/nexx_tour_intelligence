import ExpoModulesCore
import MapKit
import UIKit

// Makes small street-level thumbnails of a home on the device.
// Tries Apple Look Around first; where there's no coverage, falls back to a
// map snapshot with a pin. Images are generated locally and never uploaded.
public class LookAroundModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LookAround")

    // Writes a JPEG to `path` (a file:// URI) and returns "lookaround" or "map",
    // or nil if neither image could be made.
    AsyncFunction("snapshot") { (latitude: Double, longitude: Double, width: Double, height: Double, path: String) async -> String? in
      let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let size = CGSize(width: width, height: height)
      guard let url = fileURL(path) else { return nil }

      if let image = await lookAroundImage(coordinate: coordinate, size: size), write(image, to: url) {
        return "lookaround"
      }
      if let image = await mapImage(coordinate: coordinate, size: size), write(image, to: url) {
        return "map"
      }
      return nil
    }
  }
}

private func fileURL(_ path: String) -> URL? {
  if path.hasPrefix("file://") { return URL(string: path) }
  return URL(fileURLWithPath: path)
}

private func write(_ image: UIImage, to url: URL) -> Bool {
  guard let data = image.jpegData(compressionQuality: 0.8) else { return false }
  do {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
    return true
  } catch {
    return false
  }
}

private func lookAroundImage(coordinate: CLLocationCoordinate2D, size: CGSize) async -> UIImage? {
  do {
    guard let scene = try await MKLookAroundSceneRequest(coordinate: coordinate).scene else { return nil }
    let options = MKLookAroundSnapshotter.Options()
    options.size = size
    options.pointOfInterestFilter = .excludingAll
    let snapshot = try await MKLookAroundSnapshotter(scene: scene, options: options).snapshot
    return snapshot.image
  } catch {
    return nil
  }
}

private func mapImage(coordinate: CLLocationCoordinate2D, size: CGSize) async -> UIImage? {
  let options = MKMapSnapshotter.Options()
  options.region = MKCoordinateRegion(center: coordinate, latitudinalMeters: 220, longitudinalMeters: 220)
  options.size = size
  options.pointOfInterestFilter = .excludingAll
  do {
    let snapshot = try await MKMapSnapshotter(options: options).start()
    let point = snapshot.point(for: coordinate)
    return UIGraphicsImageRenderer(size: size).image { _ in
      snapshot.image.draw(at: .zero)
      let radius: CGFloat = max(5, min(size.width, size.height) * 0.09)
      let dot = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
      UIColor.white.setFill()
      UIBezierPath(ovalIn: dot.insetBy(dx: -2, dy: -2)).fill()
      UIColor(red: 0.18, green: 0.36, blue: 0.90, alpha: 1).setFill() // NORA accent #2E5BE6
      UIBezierPath(ovalIn: dot).fill()
    }
  } catch {
    return nil
  }
}
