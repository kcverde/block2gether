import AppKit
import Foundation

// Reproducible vector-drawn macOS icon. No external assets or dependencies.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let docs = root.appendingPathComponent("docs")
let native = root.appendingPathComponent("native")
try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: native, withIntermediateDirectories: true)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSGraphicsContext.current?.imageInterpolation = .high
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r, green: g, blue: b, alpha: a) }
func gradient(_ colors: [NSColor], _ path: NSBezierPath, _ angle: CGFloat = 90) { NSGradient(colors: colors)!.draw(in: path, angle: angle) }
func rounded(_ rect: NSRect, _ radius: CGFloat) -> NSBezierPath { NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius) }
let base = rounded(NSRect(x: 44, y: 44, width: 936, height: 936), 208)
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow(); shadow.shadowColor = color(0.02, 0.01, 0.07, 0.46); shadow.shadowBlurRadius = 24; shadow.shadowOffset = NSSize(width: 0, height: -9); shadow.set()
gradient([color(0.045,0.052,0.10), color(0.14,0.115,0.235)], base, 65)
NSGraphicsContext.restoreGraphicsState()
color(0.82,0.76,1,0.14).setStroke(); base.lineWidth=2; base.stroke()
let inset=rounded(NSRect(x: 60,y:60,width:904,height:904),194)
color(0.85,0.82,1,0.035).setStroke();inset.lineWidth=2;inset.stroke()

func tile(_ x: CGFloat, _ y: CGFloat, _ bright: Bool = false) {
    let s: CGFloat = 204, rect = NSRect(x: x, y: y, width: s, height: s), path=rounded(rect,27)
    NSGraphicsContext.saveGraphicsState()
    let shadow=NSShadow();shadow.shadowColor=color(0.53,0.31,1,0.28);shadow.shadowBlurRadius=38;shadow.shadowOffset=NSSize(width:0,height:0);shadow.set()
    gradient([color(0.43,0.29,0.70),color(0.72,0.56,0.96),color(0.84,0.74,1)],path,78)
    NSGraphicsContext.restoreGraphicsState()
    color(0.93,0.87,1,0.35).setStroke();path.lineWidth=1.6;path.stroke()
    let inner=rounded(rect.insetBy(dx:7,dy:7),21)
    color(1,0.94,1,0.20).setStroke();inner.lineWidth=1.5;inner.stroke()
    NSGraphicsContext.saveGraphicsState();path.addClip()
    let cap=rounded(NSRect(x:x+6,y:y+s*0.55,width:s-12,height:s*0.43),22)
    gradient([color(1,1,1,0),color(1,1,1,bright ? 0.28 : 0.17)],cap,90)
    NSGraphicsContext.restoreGraphicsState()
    let glint=NSBezierPath();glint.move(to:NSPoint(x:x+29,y:y+s-3));glint.line(to:NSPoint(x:x+s-29,y:y+s-3));glint.lineWidth=2.4;color(1,0.96,1,0.67).setStroke();glint.stroke()
    let foot=NSBezierPath();foot.move(to:NSPoint(x:x+30,y:y+3));foot.line(to:NSPoint(x:x+s-30,y:y+3));foot.lineWidth=2;color(0.15,0.05,0.35,0.28).setStroke();foot.stroke()
}
// One canonical T tetromino, centered on the optical axis.
tile(190,294); tile(410,294); tile(630,294); tile(410,514,true)
NSGraphicsContext.restoreGraphicsState()
let png=docs.appendingPathComponent("luma-icon.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: png)
let temp=FileManager.default.temporaryDirectory.appendingPathComponent("luma-\(UUID().uuidString).iconset")
try FileManager.default.createDirectory(at:temp,withIntermediateDirectories:true)
defer { try? FileManager.default.removeItem(at:temp) }
func run(_ executable:String,_ args:[String]) throws {
    let process=Process();process.executableURL=URL(fileURLWithPath:executable);process.arguments=args
    process.standardOutput=FileHandle.nullDevice;try process.run();process.waitUntilExit()
    guard process.terminationStatus==0 else { throw NSError(domain:"LumaIcon",code:Int(process.terminationStatus)) }
}
for size in [16,32,128,256,512] {
    for scale in [1,2] {
        let pixels=size*scale, suffix=scale==2 ? "@2x" : ""
        let dest=temp.appendingPathComponent("icon_\(size)x\(size)\(suffix).png")
        try run("/usr/bin/sips",["-z",String(pixels),String(pixels),png.path,"--out",dest.path])
    }
}
// ICNS is a container of PNG representations with big-endian chunk lengths.
// Writing directly avoids iconutil's service dependence in sandboxed build hosts.
func encodedLength(_ value: Int) -> Data {
    var length = UInt32(value).bigEndian
    return withUnsafeBytes(of: &length) { Data($0) }
}
var chunks = Data()
for (kind, name) in [("icp4", "icon_16x16.png"), ("icp5", "icon_32x32.png"), ("icp6", "icon_32x32@2x.png"), ("ic07", "icon_128x128.png"), ("ic08", "icon_256x256.png"), ("ic09", "icon_512x512.png"), ("ic10", "icon_512x512@2x.png"), ("ic11", "icon_16x16@2x.png"), ("ic12", "icon_32x32@2x.png"), ("ic13", "icon_128x128@2x.png"), ("ic14", "icon_256x256@2x.png")] {
    let image = try Data(contentsOf: temp.appendingPathComponent(name))
    chunks.append(kind.data(using: .ascii)!); chunks.append(encodedLength(image.count + 8)); chunks.append(image)
}
var container = "icns".data(using: .ascii)!
container.append(encodedLength(chunks.count + 8)); container.append(chunks)
let icon = native.appendingPathComponent("Luma.icns")
try container.write(to: icon)
print("Created \(png.path)")
print("Created \(icon.path)")
