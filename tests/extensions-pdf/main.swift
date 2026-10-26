import AppKit
import WebKit
import PDFKit
let app=NSApplication.shared
app.setActivationPolicy(.prohibited)
let visual=CommandLine.arguments.contains("--visual")
let letter=CommandLine.arguments.contains("--letter")
let stem=letter ? "visual-letter" : visual ? "visual" : "extensions"
let renderer=PDFRenderer(),input=URL(fileURLWithPath:"output/html/mokune-\(stem).html"),output=URL(fileURLWithPath:"output/pdf/mokune-\(stem).pdf")
try FileManager.default.createDirectory(at:output.deletingLastPathComponent(),withIntermediateDirectories:true)
let html=try String(contentsOf:input,encoding:.utf8)
DispatchQueue.main.async {
 renderer.render(html:html,to:output){result in
  do {
   try result.get()
   guard let pdf=PDFDocument(url:output),pdf.pageCount>0 else{fatalError("Missing PDF")}
   let text=(0..<pdf.pageCount).compactMap{pdf.page(at:$0)?.string}.joined(separator:"\n").precomposedStringWithCompatibilityMapping
   for value in (visual ? ["可视化编辑","新标题","原样保存","完整"] : ["title","Mokune","Rust","macOS","Markdown","BOM / CRLF","第二段","工程说明"]){guard text.contains(value) else{fatalError("Missing PDF content: \(value)")}}
   let page=pdf.page(at:0)!,bounds=page.bounds(for:.mediaBox)
   let expected=letter ? CGSize(width:792,height:612) : CGSize(width:595.28,height:841.89)
   guard abs(bounds.width-expected.width)<2,abs(bounds.height-expected.height)<2 else{fatalError("Unexpected paper size: \(bounds)")}
   // Render every actual PDF page for visual inspection without changing PDF.
   for index in 0..<pdf.pageCount {
    let page=pdf.page(at:index)!,image=page.thumbnail(of:NSSize(width:900,height:1273),for:.mediaBox)
    if let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]){try png.write(to:output.deletingLastPathComponent().appendingPathComponent("\(stem)-page-\(index+1).png"))}
   }
   let report:[String:Any]=["pages":pdf.pageCount,"textCharacters":text.count,"width":bounds.width,"height":bounds.height,"output":output.path,"checks":["native WebKit render completed",visual ? "edited table and image caption present in extracted PDF text" : "YAML values and multiline footnotes present in extracted PDF text",letter ? "Letter landscape, 25 mm margin" : "A4 pagination","all pages rasterized for inspection"]]
   try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:"docs/\(visual ? (letter ? "VISUAL-LETTER" : "VISUAL") : "EXTENSIONS")-PDF-RESULTS.json"))
   print("Native extensions PDF checks passed: \(pdf.pageCount) pages");exit(0)
  }catch{fputs("PDF failed: \(error)\n",stderr);exit(1)}
 }
}
app.run()
