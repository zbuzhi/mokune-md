import AppKit
let app=NSApplication.shared;app.setActivationPolicy(.prohibited)
let reader=ExportAssetReader(),root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("tests/fixtures",isDirectory:true)
let source=try! Data(contentsOf:root.appendingPathComponent("assets/preview.svg"))
let data="data:image/svg+xml;base64,"+source.base64EncodedString()
let cases:[([[String:Any]],Bool)]=[
 ([["reference":"assets/preview.svg","url":"mokune-image://local/session/?path=assets/preview.svg","kind":"local"]],true),
 ([["reference":data,"url":data,"kind":"local"]],true),
 ([["reference":"../private.png","url":"x","kind":"local"]],false),
 ([["reference":"x","url":"data:image/png;base64,????","kind":"local"]],false),
 (Array(repeating:["reference":"x","url":"x","kind":"local"],count:101),false)
]
var passed=0
func next(_ index:Int){
 if index==cases.count{print("Export asset checks passed: \(passed)");exit(0)}
 let (images,success)=cases[index]
 let reader=ExportAssetReader()
 reader.read(images,root:root){ result in
  switch result {
  case .success(let values):guard success else{fatalError("Unexpected success")};if index<2{guard values==[data] else{fatalError("Image byte mismatch")}}
  case .failure:guard !success else{fatalError("Unexpected failure")}
  };passed+=1;next(index+1)
 }
}
DispatchQueue.main.async{next(0)};app.run()
