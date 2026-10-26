import Foundation

enum FileStoreError: Error { case invalidEncoding, tooLarge, conflict }

enum FileStore {
    static func decode(_ data: Data) throws -> String {
        guard data.count <= 20 * 1024 * 1024 else { throw FileStoreError.tooLarge }
        // Foundation's String(data:encoding:) silently consumes a UTF-8 BOM.
        // Validate strictly first, then decode the bytes with the BOM intact.
        guard String(data: data, encoding: .utf8) != nil else { throw FileStoreError.invalidEncoding }
        let text = String(decoding: data, as: UTF8.self)
        guard !text.contains("\0") else { throw FileStoreError.invalidEncoding }
        return text
    }

    static func atomicWrite(_ data: Data, to target: URL, baseline: Data?) throws {
        var writeError: Error?
        var coordinationError: NSError?
        NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: target, options: .forReplacing, error: &coordinationError) { url in
            do {
                if let baseline = baseline {
                    guard let disk = try? Data(contentsOf: url), disk == baseline else { throw FileStoreError.conflict }
                }
                try data.write(to: url, options: [.atomic])
            } catch { writeError = error }
        }
        if let failure = coordinationError { throw failure }
        if let failure = writeError { throw failure }
    }
}

enum LocalImageResolver {
    static func reference(from url: URL, token: String) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "mokune-image", parts.host == "local", parts.path == "/\(token)/" else { return nil }
        return parts.queryItems?.first(where: { $0.name == "path" })?.value
    }
    static let formats: [String: String] = ["png":"image/png", "jpg":"image/jpeg", "jpeg":"image/jpeg", "gif":"image/gif", "webp":"image/webp", "avif":"image/avif", "svg":"image/svg+xml", "heic":"image/heic"]
    static func resolve(_ reference: String, root: URL,allowedRoot:URL?=nil) -> URL? {
        guard !reference.contains("\0"), !reference.hasPrefix("//") else { return nil }
        let decoded = reference.removingPercentEncoding ?? reference
        let candidate: URL
        if decoded.lowercased().hasPrefix("file:") {
            guard let file = URL(string: decoded), file.isFileURL, file.host == nil || file.host == "" || file.host == "localhost" else { return nil }
            candidate = file
        } else {
            guard !decoded.contains("://"), !decoded.hasPrefix("data:") else { return nil }
            candidate = URL(fileURLWithPath: decoded, relativeTo: URL(fileURLWithPath:root.path,isDirectory:true))
        }
        let documentRoot=root.standardizedFileURL.resolvingSymlinksInPath()
        let allowed=(allowedRoot ?? root).standardizedFileURL.resolvingSymlinksInPath()
        guard documentRoot.path==allowed.path||documentRoot.path.hasPrefix(allowed.path+"/") else{return nil}
        var directory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &directory), !directory.boolValue else { return nil }
        let resolved = candidate.standardizedFileURL.resolvingSymlinksInPath()
        guard resolved.path.hasPrefix(allowed.path + "/"), formats[resolved.pathExtension.lowercased()] != nil else { return nil }
        return resolved
    }
}
