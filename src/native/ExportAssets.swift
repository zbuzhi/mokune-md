import AppKit

final class ExportAssetReader: NSObject, URLSessionTaskDelegate {
    private var session: URLSession!
    private var total = 0
    private let lock = NSLock()
    private var finished = false
    private var timeout: DispatchWorkItem?
    func read(_ images: [[String:Any]], root: URL?, allowedRoot:URL?=nil, completion: @escaping (Result<[String],Error>) -> Void) {
        guard images.count <= 100 else { completion(.failure(failure("图片超过 100 张，请拆分文稿后导出。"))); return }
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 30
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        func finish(_ result: Result<[String],Error>) {
            self.lock.lock();if self.finished { self.lock.unlock();return };self.finished=true;self.lock.unlock()
            self.timeout?.cancel();self.timeout=nil;self.session.invalidateAndCancel();DispatchQueue.main.async { completion(result) }
        }
        let timeout=DispatchWorkItem{finish(.failure(self.failure("图片准备超时，请检查网络或图片后重试。")))};self.timeout=timeout
        DispatchQueue.global().asyncAfter(deadline:.now()+60,execute:timeout)
        func next(_ index: Int, _ values: [String]) {
            self.lock.lock();let stopped=self.finished;self.lock.unlock();if stopped{return}
            if index == images.count { finish(.success(values)); return }
            let image = images[index]
            guard let reference = image["reference"] as? String, let address = image["url"] as? String else { finish(.failure(self.failure("图片信息不完整。"))); return }
            func append(_ data: Data, _ mime: String) {
                if mime == "image/heic" {
                    guard let bitmap = NSBitmapImageRep(data:data), let png = bitmap.representation(using:.png,properties:[:]) else { finish(.failure(self.failure("HEIC 图片转换失败。"))); return }
                    append(png,"image/png"); return
                }
                self.total += data.count
                guard data.count <= 20*1024*1024, self.total <= 40*1024*1024 else { finish(.failure(self.failure("图片超过导出大小上限（单张 20 MB，总计 40 MB）。"))); return }
                next(index+1, values+["data:\(mime);base64,\(data.base64EncodedString())"])
            }
            if address.hasPrefix("data:image/") {
                let parts=address.split(separator:",",maxSplits:1)
                guard parts.count == 2, parts[0].hasSuffix(";base64"), let data=Data(base64Encoded:String(parts[1]),options:.ignoreUnknownCharacters), !data.isEmpty else { finish(.failure(self.failure("内嵌图片编码无效。"))); return }
                let mime=String(parts[0].dropFirst(5).dropLast(7))
                guard LocalImageResolver.formats.values.contains(mime) else { finish(.failure(self.failure("内嵌图片格式不支持。"))); return }
                append(data,mime); return
            }
            if image["kind"] as? String == "remote" {
                guard let url = URL(string:address), url.scheme == "https", url.user == nil, url.password == nil else { finish(.failure(self.failure("只支持已授权的 HTTPS 图片。"))); return }
                var request = URLRequest(url:url); request.setValue("image/*",forHTTPHeaderField:"Accept")
                self.session.downloadTask(with:request) { file,response,error in
                    guard error == nil, let file = file, let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let mime = response.mimeType, LocalImageResolver.formats.values.contains(mime), let size = try? file.resourceValues(forKeys:[.fileSizeKey]).fileSize, size <= 20*1024*1024, let data = try? Data(contentsOf:file) else { finish(.failure(self.failure("远程图片读取失败或格式不支持，请检查后重试。"))); return }
                    append(data,mime)
                }.resume()
            } else {
                guard let root = root, let file = LocalImageResolver.resolve(reference, root:root,allowedRoot:allowedRoot), let mime = LocalImageResolver.formats[file.pathExtension.lowercased()], let size = try? file.resourceValues(forKeys:[.fileSizeKey]).fileSize, size <= 20*1024*1024, let data = try? Data(contentsOf:file) else { finish(.failure(self.failure("本地图片无法读取：\(reference)"))); return }
                append(data,mime)
            }
        }
        DispatchQueue.global(qos:.userInitiated).async { next(0,[]) }
    }
    private func failure(_ message: String) -> NSError { NSError(domain:"Mokune.Export",code:3,userInfo:[NSLocalizedDescriptionKey:message]) }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard request.url?.scheme == "https", request.url?.user == nil, request.url?.password == nil else { completionHandler(nil); return }
        var clean = request; clean.setValue(nil,forHTTPHeaderField:"Referer"); clean.setValue(nil,forHTTPHeaderField:"Cookie"); completionHandler(clean)
    }
}
