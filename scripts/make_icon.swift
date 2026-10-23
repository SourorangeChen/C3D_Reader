import AppKit
import Foundation

// The existing marker-and-segment brand, drawn as a native vector icon.
let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    NSColor(calibratedRed: 0.09, green: 0.09, blue: 0.10, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 45, y: 45, width: 934, height: 934), xRadius: 205, yRadius: 205).fill()
    let points = [NSPoint(x: 290, y: 265), NSPoint(x: 435, y: 565), NSPoint(x: 735, y: 790), NSPoint(x: 780, y: 420)]
    let links = NSBezierPath()
    links.lineWidth = 24
    links.lineCapStyle = .round
    links.move(to: points[0]); links.line(to: points[1]); links.line(to: points[2])
    links.move(to: points[1]); links.line(to: points[3])
    NSColor(calibratedWhite: 0.84, alpha: 1).setStroke(); links.stroke()
    for (index, point) in points.enumerated() {
        if index == 0 { NSColor(calibratedRed: 0.29, green: 0.54, blue: 0.84, alpha: 1).setFill() }
        else { NSColor(calibratedWhite: 0.96, alpha: 1).setFill() }
        NSBezierPath(ovalIn: NSRect(x: point.x - 47, y: point.y - 47, width: 94, height: 94)).fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    let png = bitmap.representation(using: .png, properties: [:])!
    let names: [String]
    switch size {
    case 16: names = ["icon_16x16.png"]
    case 32: names = ["icon_16x16@2x.png", "icon_32x32.png"]
    case 64: names = ["icon_32x32@2x.png"]
    case 128: names = ["icon_128x128.png"]
    case 256: names = ["icon_128x128@2x.png", "icon_256x256.png"]
    case 512: names = ["icon_256x256@2x.png", "icon_512x512.png"]
    default: names = ["icon_512x512@2x.png"]
    }
    for name in names { try png.write(to: URL(fileURLWithPath: output).appendingPathComponent(name)) }
}
