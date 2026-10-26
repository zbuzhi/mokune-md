import AppKit
import WebKit
import PDFKit
let app=NSApplication.shared;app.setActivationPolicy(.prohibited)
let renderer=PDFRenderer(),output=URL(fileURLWithPath:"output/pdf/mokune-image-alignment.pdf")
let html=try String(contentsOfFile:"output/html/mokune-image-alignment.html",encoding:.utf8)
renderer.render(html:html,to:output){result in
 do{
  try result.get();guard let pdf=PDFDocument(url:output),pdf.pageCount>0 else{fatalError("Missing alignment PDF")}
  let text=(0..<pdf.pageCount).compactMap{pdf.page(at:$0)?.string}.joined().precomposedStringWithCompatibilityMapping;guard text.replacingOccurrences(of:"⻬",with:"齐").contains("图片对齐") else{fatalError("Missing heading")};guard text.components(separatedBy:"Original .md").count == 4 else{fatalError("Missing image content")}
  let image=pdf.page(at:0)!.thumbnail(of:NSSize(width:900,height:1273),for:.mediaBox)
  if let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]){try png.write(to:URL(fileURLWithPath:"output/pdf/image-alignment-page.png"))}
  print("Native image alignment PDF passed: \(pdf.pageCount) pages");exit(0)
 }catch{fputs("PDF failed: \(error)\n",stderr);exit(1)}
}
app.run()
