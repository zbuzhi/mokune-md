import AppKit
import UniformTypeIdentifiers
extension AppDelegate{
    @objc func insertLocalImage(){if ready && !composing{action("importImage")}}
    func importImageData(_ body:[String:Any]) {
        guard let id=body["id"] as? String else{return}
        guard ready,!composing,let document=fileURL,let items=body["items"] as? [[String:String]],!items.isEmpty,items.count<=10 else{send(["type":"imageImported","id":id,"error":"请先保存文稿，每次最多导入 10 张图片。"]);return}
        do {
            var total=0,decoded=[(Data,String)]()
            for item in items {guard let name=item["name"],ImageImport.extensions.contains(URL(fileURLWithPath:name).pathExtension.lowercased()),let base64=item["data"],base64.count<=28*1024*1024,let data=Data(base64Encoded:base64),!data.isEmpty else{throw ImageImportError.unsupported};total+=data.count;guard total<=20*1024*1024 else{throw ImageImportError.tooLarge};decoded.append((data,name))}
            var results=[[String:String]]()
            for (data,name) in decoded{let result=try ImageImport.write(data,name:name,beside:document);results.append(["name":result.name,"reference":result.reference])}
            send(["type":"imageImported","id":id,"images":results])
        }catch{send(["type":"imageImported","id":id,"error":"图片导入未完成（每批总计不超过 20 MB），已复制的资源会保留：\(error.localizedDescription)"])}
    }
    func importLocalImage(_ body:[String:Any]){
        guard let id=body["id"] as? String else{return}
        func fail(_ message:String){send(["type":"imageImported","id":id,"error":message])}
        guard ready,!inputComposing,(!editorPanelOpen || body["purpose"] as? String=="replace"),!modalBusy,pendingAction==nil,let document=fileURL else{fail("请先保存文稿，再导入本地图片。");return}
        defer{drainDeferredOpens()}
        let token=images.token,panel=NSOpenPanel();panel.title="导入图片到文稿 assets";panel.allowedContentTypes=ImageImport.extensions.compactMap{UTType(filenameExtension:$0)};panel.allowsMultipleSelection=false
        modalBusy=true;let response=panel.runModal();modalBusy=false
        guard response == .OK,let source=panel.url else{send(["type":"imageImported","id":id,"cancelled":true]);return}
        guard fileURL==document,images.token==token else{fail("当前文稿已切换，未导入图片。");return}
        do{let result=try ImageImport.copy(source,beside:document);send(["type":"imageImported","id":id,"reference":result.reference,"name":result.name])}
        catch ImageImportError.tooLarge{fail("图片需不超过 20 MB。")}catch ImageImportError.unsafeAssets{fail("assets 需要是当前文稿目录中的普通文件夹。")}catch{fail("图片导入未完成：\(error.localizedDescription)")}
    }
}
