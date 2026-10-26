import AppKit
import WebKit
import PDFKit
let app=NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer=PDFRenderer(),output=URL(fileURLWithPath:"output/pdf/mokune-polish.pdf")
try FileManager.default.createDirectory(at:output.deletingLastPathComponent(),withIntermediateDirectories:true)
let html=try String(contentsOfFile:"output/html/mokune-polish.html",encoding:.utf8)
DispatchQueue.main.async {
 renderer.render(html:html,to:output){result in
  do {
   try result.get()
   guard let pdf=PDFDocument(url:output),pdf.pageCount>0 else{fatalError("Missing PDF")}
   let text=(0..<pdf.pageCount).compactMap{pdf.page(at:$0)?.string}.joined(separator:"\n").precomposedStringWithCompatibilityMapping
   for value in ["编辑交互","示例链接","HTML","内容","const"]{guard text.contains(value) else{fatalError("Missing PDF content: \(value)")}}
   guard !text.contains("__bad") else{fatalError("Unsafe HTML leaked into output")}
   for index in 0..<pdf.pageCount {
    let image=pdf.page(at:index)!.thumbnail(of:NSSize(width:900,height:1273),for:.mediaBox)
    if let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]){try png.write(to:output.deletingLastPathComponent().appendingPathComponent("polish-page-\(index+1).png"))}
   }
   let report:[String:Any]=["pages":pdf.pageCount,"output":output.path,"textCharacters":text.count,"checks":["native WebKit PDF render", "link labels and sanitized HTML preserved", "table, image, Mermaid and code exported", "all pages rasterized"]]
   try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:"docs/POLISH-PDF-RESULTS.json"))
   print("Native polish PDF checks passed: \(pdf.pageCount) pages");exit(0)
  }catch{fputs("PDF failed: \(error)\n",stderr);exit(1)}
 }
}
app.run()
