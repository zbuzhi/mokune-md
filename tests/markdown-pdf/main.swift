import AppKit
import WebKit
import PDFKit
let app=NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer=PDFRenderer()
let inputs=[("output/html/mokune-markdown-coverage.html","output/pdf/mokune-markdown-coverage.pdf"),("output/html/mokune-export-paper.html","output/pdf/mokune-export-paper.pdf"),("output/html/mokune-export-polar.html","output/pdf/mokune-export-polar.pdf"),(".build/long-table.html","output/pdf/mokune-long-table.pdf"),("output/html/mokune-callouts-paper.html","output/pdf/mokune-callouts-paper.pdf"),("output/html/mokune-callouts-polar.html","output/pdf/mokune-callouts-polar.pdf"),("output/html/mokune-scientific-cache.html","output/pdf/mokune-scientific-cache.pdf")]
var results=[[String:Any]]()
func next(_ index:Int){
 if index==inputs.count{try! JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:"output/markdown-pdf-results.json"));print("Markdown native PDF documents passed: \(results.count)");exit(0)}
 do{
  let pair=inputs[index],html=try String(contentsOfFile:pair.0,encoding:.utf8),output=URL(fileURLWithPath:pair.1)
  try FileManager.default.createDirectory(at:output.deletingLastPathComponent(),withIntermediateDirectories:true)
  renderer.render(html:html,to:output){result in
   do{
    try result.get();guard let pdf=PDFDocument(url:output),pdf.pageCount>0 else{fatalError("Missing PDF")}
    let text=(0..<pdf.pageCount).compactMap{pdf.page(at:$0)?.string}.joined(separator:"\n").precomposedStringWithCompatibilityMapping
    if index==0{for token in ["inline","Setext","code","无序列表"]{guard text.contains(token)else{fatalError("PDF missing \(token)")}}}
    if index==4 || index==5{for marker in ["NOTE","TIP","IMPORTANT","WARNING","CAUTION","CUSTOM","第二行内容"]{guard text.contains(marker)else{fatalError("PDF alert missing \(marker)")}}}
    if index==6{for marker in ["科学缓存","输入","保留","literal","正文结尾"]{guard text.contains(marker)else{fatalError("PDF scientific cache missing \(marker)")}}}
    if index==3{for row in 0..<120{let marker=String(format:"ROW-%03d",row);guard text.components(separatedBy:marker).count==2 else{fatalError("Missing/duplicate \(marker)")}}}
    let page=pdf.page(at:0)!,image=page.thumbnail(of:NSSize(width:900,height:1273),for:.mediaBox)
    if let data=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:data),let png=bitmap.representation(using:.png,properties:[:]){try png.write(to:URL(fileURLWithPath:"output/pdf/markdown-check-\(index+1).png"))}
    results.append(["input":pair.0,"output":pair.1,"pages":pdf.pageCount,"textCharacters":text.count]);next(index+1)
   }catch{fputs("PDF check failed: \(error)\n",stderr);exit(1)}
  }
 }catch{fputs("PDF input failed: \(error)\n",stderr);exit(1)}
}
DispatchQueue.main.async{next(0)}
app.run()
