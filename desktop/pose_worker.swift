// Local motion observations for viewer synchronization, not clinical pose output.
// Video timestamps come from decoded samples; no nominal-FPS time substitution.
import Foundation
import AVFoundation
import Vision
import ImageIO
import CoreImage

struct Input: Decodable {
    let kind: String
    let path: String?
    let paths: [String]?
    let times: [Double]?
    let operation: String?
    let start: Double?
    let end: Double?
    let rate: Double?
    let subjectX: Double?
}

let names: [VNHumanBodyPoseObservation.JointName] = [
    .leftShoulder, .rightShoulder, .leftElbow, .rightElbow,
    .leftWrist, .rightWrist, .leftHip, .rightHip,
    .leftKnee, .rightKnee, .leftAnkle, .rightAnkle,
]

func emit(_ value: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

final class Observer {
    var previous: CGPoint?
    var lastTime = -Double.infinity
    let subjectX: Double
    init(_ x: Double) { subjectX = x }

    func process(_ handler: VNImageRequestHandler, time: Double) throws {
        let request = VNDetectHumanBodyPoseRequest()
        request.revision = VNDetectHumanBodyPoseRequestRevision1
        try handler.perform([request])
        var candidates: [(Double, [[Double]], CGPoint)] = []
        for observation in request.results ?? [] {
            let recognized = try observation.recognizedPoints(.all)
            let points = names.map { name -> [Double] in
                guard let p = recognized[name] else { return [0, 0, 0] }
                return [p.location.x, 1 - p.location.y, Double(p.confidence)]
            }
            let torso = [0, 1, 6, 7].filter { points[$0][2] >= 0.2 }
            guard torso.count >= 3 else { continue }
            let center = CGPoint(x: torso.map { points[$0][0] }.reduce(0, +) / Double(torso.count),
                                 y: torso.map { points[$0][1] }.reduce(0, +) / Double(torso.count))
            let good = points.filter { $0[2] >= 0.2 }
            let height = (good.map { $0[1] }.max() ?? 0) - (good.map { $0[1] }.min() ?? 0)
            var cost = abs(center.x - subjectX) - 0.2 * height
            if let old = previous, time - lastTime < 0.5 {
                cost += 2 * hypot(center.x - old.x, center.y - old.y)
            }
            candidates.append((cost, points, center))
        }
        candidates.sort { $0.0 < $1.0 }
        if let best = candidates.first {
            previous = best.2
            lastTime = time
            try emit(["type": "frame", "time": time, "points": best.1,
                      "people": candidates.count])
        } else {
            try emit(["type": "frame", "time": time, "points": NSNull(), "people": 0])
        }
    }
}

@main struct Worker {
    static func main() async {
        let parent = getppid()
        let watcher = DispatchSource.makeTimerSource(queue: .global())
        watcher.schedule(deadline: .now() + 1, repeating: 1)
        watcher.setEventHandler { if getppid() != parent { exit(0) } }
        watcher.resume()
        defer { watcher.cancel() }
        do {
            let input = try JSONDecoder().decode(Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
            let observer = Observer(input.subjectX ?? 0.5)
            let rate = min(30, max(1, input.rate ?? 6))
            if input.kind == "images" {
                guard let paths = input.paths, let times = input.times,
                      paths.count == times.count, !paths.isEmpty else { throw Failure.invalidInput }
                guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: paths[0]) as CFURL, nil),
                      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                      let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
                      let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else { throw Failure.invalidInput }
                let exif = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
                let rotated = exif >= 5 && exif <= 8
                try emit(["type": "meta", "duration": times.last! - times[0], "count": paths.count,
                          "width": rotated ? height : width, "height": rotated ? width : height])
                var next = -Double.infinity
                for (path, time) in zip(paths, times) {
                    if time < (input.start ?? times[0]) || time > (input.end ?? times.last!) || time < next { continue }
                    try autoreleasepool {
                        let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
                        try observer.process(handler, time: time)
                    }
                    next = time + 1 / rate - 0.000001
                }
            } else {
                guard let path = input.path else { throw Failure.invalidInput }
                let asset = AVURLAsset(url: URL(fileURLWithPath: path))
                let tracks = try await asset.loadTracks(withMediaType: .video)
                guard let track = tracks.first else { throw Failure.noVideo }
                let duration = try await asset.load(.duration).seconds
                let size = try await track.load(.naturalSize)
                let transform = try await track.load(.preferredTransform)
                let fps = try await track.load(.nominalFrameRate)
                let display = CGRect(origin: .zero, size: size).applying(transform)
                var info: [String: Any] = ["type": "meta", "duration": duration, "fps": fps,
                                           "width": abs(display.width), "height": abs(display.height)]
                let metadata = try await asset.load(.metadata)
                for item in metadata where item.identifier?.rawValue == "mdta/com.apple.quicktime.creationdate" {
                    if let value = try await item.load(.stringValue) { info["recordedAt"] = value }
                }
                try emit(info)
                if input.operation == "probe" { return }
                let start = max(0, input.start ?? 0)
                let end = min(duration, input.end ?? duration)
                guard end > start else { throw Failure.invalidInput }
                let reader = try AVAssetReader(asset: asset)
                reader.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 60000),
                                              duration: CMTime(seconds: end - start, preferredTimescale: 60000))
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
                output.alwaysCopiesSampleData = false
                reader.add(output)
                guard reader.startReading() else { throw Failure.noVideo }
                let angle = atan2(transform.b, transform.a)
                let orientation: CGImagePropertyOrientation
                if angle > 0.7 && angle < 2.4 { orientation = .right }
                else if angle < -0.7 && angle > -2.4 { orientation = .left }
                else if abs(angle) >= 2.4 { orientation = .down }
                else { orientation = .up }
                var next = start
                while reader.status == .reading {
                    let more: Bool = try autoreleasepool {
                        guard let sample = output.copyNextSampleBuffer() else { return false }
                        let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
                        guard time.isFinite else { throw Failure.invalidTime }
                        if time + 0.000001 >= next, let pixel = CMSampleBufferGetImageBuffer(sample) {
                            try observer.process(VNImageRequestHandler(cvPixelBuffer: pixel, orientation: orientation, options: [:]), time: time)
                            next = time + 1 / rate - 0.000001
                        }
                        return true
                    }
                    if !more { break }
                }
                if reader.status == .failed { throw reader.error ?? Failure.noVideo }
                reader.cancelReading()
            }
            try emit(["type": "complete", "engine": "Apple Vision body pose revision 1"])
        } catch {
            // Do not echo source paths or framework diagnostics into the UI.
            try? emit(["type": "error", "message": "Cannot extract motion observations from this media."])
            exit(1)
        }
    }
    enum Failure: Error { case invalidInput, noVideo, invalidTime }
}
