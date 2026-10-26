// Print metadata is produced by the local exporter. Parse only enumerated
// tokens, never arbitrary CSS or user-supplied dimensions.
import AppKit
import WebKit
import CoreGraphics

struct PDFPageLayout {
    let paper:CGSize
    let margin:CGFloat
    init(html:String){
        let token=html.range(of:#"<meta name="mokune-paper" content="(?:a4|letter)-(?:portrait|landscape)">"#,options:.regularExpression).map{String(html[$0])} ?? "a4-portrait"
        let size=token.contains("letter-") ? CGSize(width:612,height:792) : CGSize(width:595.28,height:841.89)
        paper=token.contains("-landscape") ? CGSize(width:size.height,height:size.width) : size
        let match=html.range(of:#"<meta name="mokune-margin" content="(?:10|14|20|25)">"#,options:.regularExpression).map{String(html[$0])} ?? ""
        let millimeters=[10,14,20,25].first{match.contains("content=\"\($0)\"")}
        margin=millimeters.map{CGFloat($0)*72/25.4} ?? 40
    }
}

final class PDFRenderer: NSObject, WKNavigationDelegate {
    private var webView: WKWebView?
    private var host: NSWindow?
    private var output: URL?
    private var completion: ((Result<Void, Error>) -> Void)?
    private var timeout: DispatchWorkItem?
    private var generation = 0
    private var paper = CGSize(width:595.28,height:841.89)
    private var margin: CGFloat = 40
    private let scale: CGFloat = 0.75
    func render(html: String, to url: URL, completion: @escaping (Result<Void, Error>) -> Void) {
        let layout=PDFPageLayout(html:html);paper=layout.paper;margin=layout.margin
        generation += 1; let current = generation
        self.output = url; self.completion = completion
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        let width = (paper.width-2*margin)/scale
        let view = WKWebView(frame:NSRect(x:0,y:0,width:width,height:1100),configuration:config)
        view.navigationDelegate = self; self.webView = view
        let host = NSWindow(contentRect:NSRect(x:-10000,y:-10000,width:width,height:1100),styleMask:[.borderless],backing:.buffered,defer:false)
        host.contentView = view; self.host = host
        let task = DispatchWorkItem { [weak self] in if let self = self, self.generation == current { self.finish(.failure(Self.failure("PDF 排版超时，请重试或导出 HTML。"))) } }
        timeout = task; DispatchQueue.main.asyncAfter(deadline:.now()+90,execute:task)
        view.loadHTMLString(html,baseURL:nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard self.webView === webView else { return }; let current = generation
        let pageHeight = (paper.height-2*margin)/scale
        let script = """
        const style=document.createElement('style');style.textContent='.document{width:min(100%,var(--line-width))!important;max-width:none!important;margin:0 auto!important}img,.export-diagram svg{max-height:'+Math.max(100,pageHeight-60)+'px}';document.head.append(style);
        await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));
        const height=Math.ceil(document.querySelector('article').getBoundingClientRect().bottom),limit=pageHeight;
        const protectedRanges=[];
        const protect=(top,bottom)=>{if(bottom-top<=limit&&bottom>top)protectedRanges.push({top,bottom});};
        for(const node of document.querySelectorAll('.export-math,.export-diagram,.document-image,figcaption,img,table,tr,h1,h2,h3,h4,h5,h6')){const rect=node.getBoundingClientRect();let bottom=rect.bottom;if(/^H[1-6]$/.test(node.tagName)){const next=node.nextElementSibling;if(next)bottom=Math.min(next.getBoundingClientRect().bottom,bottom+60);}protect(rect.top,bottom);}
        for(const node of document.querySelectorAll('p,li,pre')){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){const range=document.createRange();range.selectNodeContents(text);for(const rect of range.getClientRects())protect(rect.top,rect.bottom);}}
        for(const table of document.querySelectorAll('table')){const header=table.querySelector('thead'),first=table.querySelector('tbody tr');if(header&&first)protect(header.getBoundingClientRect().top,first.getBoundingClientRect().bottom);}
        const tables=[...document.querySelectorAll('table')].flatMap(table=>{const head=table.querySelector('thead');if(!head)return [];const header=head.getBoundingClientRect(),rect=table.getBoundingClientRect();return [{top:rect.top,bottom:rect.bottom,headerFrom:header.top,headerTo:header.bottom}];});
        const pages=[];let from=0;
        while(from<height){const table=tables.find(table=>from>=table.headerTo&&from<table.bottom-.5),header=table?table.headerTo-table.headerFrom:0;let to=Math.min(from+limit-header,height);for(let i=0;i<20;i++){const crossing=protectedRanges.filter(range=>range.top>from+.5&&range.top<to&&range.bottom>to+.5);if(!crossing.length)break;to=Math.min(...crossing.map(range=>range.top));}if(to<=from+.5)to=Math.min(from+limit-header,height);pages.push({from,to,...(table?{headerFrom:table.headerFrom,headerTo:table.headerTo}:{})});from=to;if(pages.length>300)throw new Error('文稿超过 300 页，请拆分或导出 HTML。');}
        const background=getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number);
        return {pages,background};
        """
        webView.callAsyncJavaScript(script,arguments:["pageHeight":pageHeight],in:nil,in:.page) { [weak self] result in
            guard let self = self, self.completion != nil, self.generation == current else { return }
            switch result {
            case .failure(let error):self.finish(.failure(error))
            case .success(let value):
                guard let model=value as? [String:Any],let pages=model["pages"] as? [[String:Double]],!pages.isEmpty,let target=self.output else { self.finish(.failure(Self.failure("PDF 页面信息无效。")));return }
                let background=model["background"] as? [Double] ?? [255,255,255]
                guard let consumer=CGDataConsumer(url:target as CFURL) else {self.finish(.failure(Self.failure("无法创建 PDF 文件。")));return}
                var bounds=CGRect(origin:.zero,size:self.paper)
                guard let context=CGContext(consumer:consumer,mediaBox:&bounds,nil) else {self.finish(.failure(Self.failure("无法创建 PDF 页面。")));return}
                self.capture(0,pages:pages,background:background,context:context,generation:current)
            }
        }
    }
    private func capture(_ index:Int,pages:[[String:Double]],background:[Double],context:CGContext,generation current:Int) {
        guard completion != nil,generation == current,let view=webView else {context.closePDF();return}
        if index==pages.count {context.closePDF();finish(.success(()));return}
        guard let from=pages[index]["from"],let to=pages[index]["to"] else {context.closePDF();finish(.failure(Self.failure("PDF 页边界无效。")));return}
        let config=WKPDFConfiguration();config.rect=CGRect(x:0,y:from,width:view.bounds.width,height:to-from)
        view.createPDF(configuration:config) { [weak self] result in
            guard let self=self, self.generation == current, self.completion != nil else {context.closePDF();return}
            switch result {
            case .failure(let error):context.closePDF();self.finish(.failure(error))
            case .success(let data):
                guard let provider=CGDataProvider(data:data as CFData),let document=CGPDFDocument(provider),let page=document.page(at:1) else {context.closePDF();self.finish(.failure(Self.failure("PDF 页面生成失败。")));return}
                context.beginPDFPage(nil)
                context.setFillColor(CGColor(colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!,components:[background[0]/255,background[1]/255,background[2]/255,1])!);context.fill(CGRect(origin:.zero,size:self.paper))
                let headerFrom=pages[index]["headerFrom"],headerTo=pages[index]["headerTo"],headerHeight=CGFloat((headerTo ?? 0)-(headerFrom ?? 0))
                self.draw(page,in:context,height:CGFloat(to-from),top:headerHeight)
                if let headerFrom=headerFrom,let headerTo=headerTo {
                    let header=WKPDFConfiguration();header.rect=CGRect(x:0,y:headerFrom,width:view.bounds.width,height:headerTo-headerFrom)
                    view.createPDF(configuration:header){ result in
                        guard self.generation == current, self.completion != nil else {context.closePDF();return}
                        switch result {
                        case .failure(let error):context.closePDF();self.finish(.failure(error))
                        case .success(let data):
                            guard let provider=CGDataProvider(data:data as CFData),let doc=CGPDFDocument(provider),let page=doc.page(at:1) else {context.closePDF();self.finish(.failure(Self.failure("表格表头生成失败。")));return}
                            self.draw(page,in:context,height:headerHeight,top:0);context.endPDFPage();self.capture(index+1,pages:pages,background:background,context:context,generation:current)
                        }
                    }
                } else { context.endPDFPage();self.capture(index+1,pages:pages,background:background,context:context,generation:current) }
            }
        }
    }
    private func draw(_ page:CGPDFPage,in context:CGContext,height:CGFloat,top:CGFloat){
        let bounds=page.getBoxRect(.mediaBox)
        context.saveGState();context.translateBy(x:margin,y:paper.height-margin-(height+top)*scale);context.scaleBy(x:scale,y:scale)
        context.clip(to:CGRect(x:0,y:0,width:bounds.width,height:height))
        context.translateBy(x:-bounds.minX,y:-bounds.minY);context.drawPDFPage(page);context.restoreGState()
    }
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error){finish(.failure(error))}
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){finish(.failure(error))}
    private static func failure(_ message:String)->NSError{NSError(domain:"Mokune.Export",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
    private func finish(_ result:Result<Void,Error>){
        guard let callback=completion else{return};completion=nil;generation += 1
        timeout?.cancel();timeout=nil;webView?.stopLoading();webView?.navigationDelegate=nil
        host?.orderOut(nil);host=nil;webView=nil;output=nil;callback(result)
    }
}
