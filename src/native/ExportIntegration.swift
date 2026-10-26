import AppKit
import UniformTypeIdentifiers

extension AppDelegate {
    func exportFailed(_ message: String) {
        exportBusy = false
        send(["type":"exportFinished","error":message])
        let alert = NSAlert(); alert.messageText = "导出未完成"; alert.informativeText = message
        alert.addButton(withTitle:"好"); alert.beginSheetModal(for:window)
    }
    func readExportImages(_ body: [String:Any]) {
        guard let id = body["id"] as? String, let list = body["images"] as? [[String:Any]], let base=body["imageBase"] as? String,let url=URL(string:base),url.scheme=="mokune-image",url.host=="local",let token=url.path.split(separator:"/").first.map(String.init),let root=images.roots[token] else {
            if let id = body["id"] as? String { send(["type":"exportImages","id":id,"error":"文稿已切换，请重新导出。"] ) }; return
        }
        let reader = ExportAssetReader(); exportReaders[id] = reader
        reader.read(list,root:root,allowedRoot:images.scope(for:root)) { result in
            self.exportReaders.removeValue(forKey:id)
            switch result {
            case .success(let data): self.send(["type":"exportImages","id":id,"images":data])
            case .failure(let error): self.send(["type":"exportImages","id":id,"error":error.localizedDescription])
            }
        }
    }
    func writeExport(_ body: [String:Any]) {
        guard let html = body["html"] as? String, html.utf8.count <= 100*1024*1024, let format = body["format"] as? String, ["html","pdf"].contains(format) else { exportFailed("导出内容无效或过大。"); return }
        let panel = NSSavePanel(); panel.canCreateDirectories = true
        let name = ((body["name"] as? String ?? "未命名.md") as NSString).deletingPathExtension
        panel.nameFieldStringValue = name + "." + format
        panel.allowedContentTypes = [format == "pdf" ? .pdf : .html]
        panel.title = "导出 " + format.uppercased()
        guard panel.runModal() == .OK, let target = panel.url else { exportBusy = false; send(["type":"exportFinished","cancelled":true]); return }
        guard !documents.contains(where:{$0.url?.standardizedFileURL.resolvingSymlinksInPath()==target.standardizedFileURL.resolvingSymlinksInPath()}) else { exportFailed("导出文件不能覆盖当前 Markdown 文稿。"); return }
        let baseline = try? Data(contentsOf:target)
        func finish(_ result: Result<Void,Error>) {
            switch result {
            case .success: self.exportBusy = false; self.send(["type":"exportFinished","format":format])
            case .failure(let error): self.exportFailed(error.localizedDescription)
            }
        }
        if format == "html" {
            do { try FileStore.atomicWrite(Data(html.utf8),to:target,baseline:baseline); finish(.success(())) }
            catch { finish(.failure(error)) }
        } else {
            // Printing writes to a fresh temporary file; replace the selected
            // destination only once a complete PDF has been produced.
            let temporary = target.deletingLastPathComponent().appendingPathComponent(".mokune-export-\(UUID().uuidString).pdf")
            pdfRenderer.render(html:html,to:temporary) { result in
                defer { try? FileManager.default.removeItem(at:temporary) }
                do { try result.get(); try FileStore.atomicWrite(Data(contentsOf:temporary),to:target,baseline:baseline); finish(.success(())) }
                catch { finish(.failure(error)) }
            }
        }
    }
}
