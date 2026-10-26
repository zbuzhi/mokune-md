import AppKit
import WebKit
import PDFKit
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer = PDFRenderer()
let pairs = Array(CommandLine.arguments.dropFirst())
var results = [[String:Any]]()
func next(_ index:Int) {
    if index == pairs.count {
        let data = try! JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys])
        try! data.write(to:URL(fileURLWithPath:".build/pdf-results.json"));print("Native PDF checks passed: \(results.count) documents");exit(0)
    }
    let input=URL(fileURLWithPath:pairs[index]),output=URL(fileURLWithPath:pairs[index+1])
    do {
        try FileManager.default.createDirectory(at:output.deletingLastPathComponent(),withIntermediateDirectories:true)
        let html=try String(contentsOf:input,encoding:.utf8)
        renderer.render(html:html,to:output) { result in
            do {
                try result.get()
                guard let document=PDFDocument(url:output),document.pageCount>=2 else { fatalError("Expected paginated PDF") }
                let text=(0..<document.pageCount).compactMap{document.page(at:$0)?.string}.joined(separator:"\n").precomposedStringWithCompatibilityMapping
                guard text.contains("原样保存"),text.contains("把流程"),text.contains("功能") else { fatalError("Missing exported content: \(text.prefix(500))") }
                if input.lastPathComponent == "long-table.html" {
                    for row in 0..<120 { let marker=String(format:"ROW-%03d",row);guard text.components(separatedBy:marker).count == 2 else {fatalError("Missing or duplicated table row \(marker)")} }
                    // The system font maps simplified 长 to its radical glyph
                    // in PDF extraction. Check the stable remainder of the label.
                    guard text.components(separatedBy:"表字段").count >= 4 else {fatalError("Table headers should repeat across pages")}
                }
                let bounds=document.page(at:0)!.bounds(for:.mediaBox)
                guard abs(bounds.width-595.28)<2,abs(bounds.height-841.89)<2 else { fatalError("Expected A4 pages") }
                results.append(["input":input.path,"output":output.path,"pages":document.pageCount,"width":bounds.width,"height":bounds.height,"textCharacters":text.count]);next(index+2)
            }catch{fputs("PDF failed: \(error)\n",stderr);exit(1)}
        }
    } catch { fputs("Input failed: \(error)\n",stderr);exit(1) }
}
DispatchQueue.main.async { next(0) }
app.run()
