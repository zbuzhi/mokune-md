import AppKit
import UniformTypeIdentifiers

extension AppDelegate {
    func importTheme() {
        guard ready,!composing else{return}
        let panel=NSOpenPanel();panel.title="导入 Mokune MD 主题";panel.allowedContentTypes=[.json];panel.allowsMultipleSelection=false
        if panel.runModal() == .OK,let url=panel.url {
            do {let values=try url.resourceValues(forKeys:[.fileSizeKey]);guard (values.fileSize ?? 0)<=128*1024 else {send(["type":"themeStatus","message":"主题文件需小于 128 KB。"]);return};let data=try Data(contentsOf:url);guard let raw=String(data:data,encoding:.utf8) else {send(["type":"themeStatus","message":"主题文件需要 UTF-8 编码。"]);return};send(["type":"themeFile","raw":raw])}
            catch {send(["type":"themeStatus","message":"主题读取失败，请检查文件权限。"]) }
        }
    }
    func exportTheme(_ body:[String:Any]) {
        guard ready,!composing,let raw=body["raw"] as? String,raw.utf8.count<=128*1024 else{return}
        let name=(body["name"] as? String ?? "Mokune").replacingOccurrences(of:"/",with:"-")
        let panel=NSSavePanel();panel.title="导出当前主题";panel.nameFieldStringValue=name+".mokune-theme.json";panel.allowedContentTypes=[.json]
        if panel.runModal() == .OK,let url=panel.url {
            do {try Data(raw.utf8).write(to:url,options:.atomic);send(["type":"themeStatus","message":"主题已导出，可编辑 JSON 后重新导入。"]) }
            catch {send(["type":"themeStatus","message":"主题导出未完成。"]) }
        }
    }
}
