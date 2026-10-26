import Foundation
import CoreServices

// FSEvents watches descendants without recursively enumerating the workspace.
final class WorkspaceWatcher {
    private var stream:FSEventStreamRef?
    let changed:()->Void
    init(root:URL,changed:@escaping ()->Void) {
        self.changed=changed
        var context=FSEventStreamContext(version:0,info:Unmanaged.passUnretained(self).toOpaque(),retain:nil,release:nil,copyDescription:nil)
        let callback:FSEventStreamCallback={ _,info,_,_,_,_ in
            guard let info=info else{return}
            Unmanaged<WorkspaceWatcher>.fromOpaque(info).takeUnretainedValue().changed()
        }
        stream=FSEventStreamCreate(nil,callback,&context,[root.path] as CFArray,FSEventStreamEventId(kFSEventStreamEventIdSinceNow),0.25,FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents|kFSEventStreamCreateFlagWatchRoot))
        if let stream=stream {FSEventStreamSetDispatchQueue(stream,DispatchQueue.main);if !FSEventStreamStart(stream){FSEventStreamInvalidate(stream);FSEventStreamRelease(stream);self.stream=nil}}
    }
    var active:Bool {stream != nil}
    deinit {if let stream=stream{FSEventStreamStop(stream);FSEventStreamInvalidate(stream);FSEventStreamRelease(stream)}}
}
