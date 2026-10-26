import AppKit
extension AppDelegate {
    var recentPaths:[String] {UserDefaults.standard.stringArray(forKey:"Mokune.RecentDocuments") ?? []}
    func noteRecent(_ url:URL){UserDefaults.standard.set(RecentDocuments.adding(url,to:recentPaths),forKey:"Mokune.RecentDocuments");refreshRecentMenu()}
    func refreshRecentMenu(){
        guard let menu=recentMenu else{return};menu.removeAllItems()
        for url in RecentDocuments.available(recentPaths){let entry=NSMenuItem(title:url.lastPathComponent+" — "+url.deletingLastPathComponent().lastPathComponent,action:#selector(openRecent(_:)),keyEquivalent:"");entry.target=self;entry.representedObject=url;entry.toolTip=url.path;menu.addItem(entry)}
        if menu.items.isEmpty {let empty=NSMenuItem(title:"暂无最近文稿",action:nil,keyEquivalent:"");empty.isEnabled=false;menu.addItem(empty)}
        menu.addItem(.separator());item(menu,"清空最近记录",#selector(clearRecent),"")
    }
    @objc func openRecent(_ sender:NSMenuItem){guard ready,!composing,let url=sender.representedObject as? URL else{return};open(url)}
    @objc func clearRecent(){UserDefaults.standard.removeObject(forKey:"Mokune.RecentDocuments");refreshRecentMenu()}
    func resumeLastDocument()->Bool {
        guard UserDefaults.standard.object(forKey:"Mokune.ResumeLastDocument") as? Bool != false,let url=RecentDocuments.available(recentPaths).first else{return false}
        open(url);return fileURL==url
    }
}
