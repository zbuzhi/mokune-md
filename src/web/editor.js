import {createConflictMerge} from './conflict-merge.js';
import {mergeAuthorization,setMergeAuthorization,mergeHistory,mergeTextChanges} from './conflict-model.mjs';
import {createResourceManager} from './resource-manager.js';
import {attachmentMarkdown,resourceHistory} from './resource-model.mjs';
import {maintainLinks} from './link-maintenance.mjs';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,keymap,highlightSpecialChars,highlightActiveLine,lineNumbers,highlightActiveLineGutter,scrollPastEnd} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab,undo,redo,isolateHistory} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {languages} from '@codemirror/language-data';
import {syntaxHighlighting,HighlightStyle,bracketMatching,foldGutter,foldKeymap,indentUnit} from '@codemirror/language';
import {searchKeymap,search,openSearchPanel} from '@codemirror/search';
import {closeBrackets,closeBracketsKeymap} from '@codemirror/autocomplete';
import {tags,classHighlighter} from '@lezer/highlight';
import themes from './themes.json';
import {themeVariables,contentWidth} from './theme-style.mjs';
import {parseTheme,serializeTheme} from './theme-library.mjs';
import {decodeSource,encodeSource,sourceExtensions,restoreEols} from './source.mjs';
import {taskPreview,toggleCurrentTask} from './task-preview.js';
import {frontMatter} from './extended-markdown.mjs';
import {extensionPreview,configureExtendedPreview,metadataSourceStyle} from './extension-preview.js';
import {livePreview} from './live-preview.js';
import {compositionGuard,isComposing} from './composition.js';
import {blockPreview,previewConfiguration,setImageBase,previewAssets,configureTableTools,configureVisualTools} from './block-preview.js';
import {scientificPreview,scientificConfiguration,setPreviewPalette,renderScientific} from './scientific-preview.js';
import {loadExportEngine,highlightCode} from './export-client.js';
import {createFloatingOutline} from './floating-outline.js';
import {createFileTree} from './file-tree.js';
import shortcuts from './shortcuts.json';
import {createShortcutHints} from './shortcut-hints.js';
import {richPreview,configureRichPreview} from './rich-preview.js';
import {createMediaViewer} from './media-viewer.js';
import {codeLanguage,configureCodeLanguage} from './code-language.js';
import {createPreferences} from './preferences.js';
import {createReadingPositions} from './reading-position.js';
import {createComparison} from './comparison.js';
import {createDocumentStats} from './document-stats.js';
import {linkAt,anchorPosition} from './link-model.mjs';
import {tableOperation} from './table-tools.mjs';
import {imageMarkdown} from './image-import.mjs';
import {createUtilityPanel} from './utility-panel.js';
import {rankFiles,parseLocation} from './utility-model.mjs';
import {createTabs} from './tabs.js';
import {exportLayout} from './export-layout.mjs';
import {createVisualEditor} from './visual-editor.js';
import {pictureModel,pictureChanges} from './visual-model.mjs';
import {formatCommands} from './formatting.mjs';

const $=id=>document.getElementById(id);
const native=!!window.webkit?.messageHandlers?.mokune;
const modeConfig=new Compartment(),colorConfig=new Compartment(),readingConfig=new Compartment(),preferencesConfig=new Compartment();
let view,sourceField,revision=0,savedRaw='',hasPath=false,composing=false,saveQueued=false,queuedMode=null;
let mediaBusy=false,deferredMediaLoad=null;
const savingSources=new Map();
let autosaveTimer,draftTimer,outlineTimer,conflicted=false,filename='未命名.md';
let documentKey='',pendingPreferences=false,activeTabID=null,closing=false,closingTabID=null,deferredTabLoad=null;
const tabStates=new Map(),closedTabs=new Set();let tabItems=[];
const tabBar=createTabs({select:selectTab,close:closeTab});
let settings;
try {settings=JSON.parse(localStorage.getItem('mokune.settings')||'{}');} catch {settings={};}
settings={exportPaper:'a4',exportOrientation:'portrait',exportMargin:14,theme:'paper',fontSize:17,width:720,followSystem:false,lightTheme:'paper',darkTheme:'graphite',outlinePosition:'right',outlinePinned:false,autoSave:true,rememberPosition:true,resumeLastDocument:true,softWrap:true,typewriter:false,tabSize:2,...settings};
let customThemes=[];try{const stored=JSON.parse(localStorage.getItem('mokune.customThemes')||'[]');if(Array.isArray(stored))customThemes=stored.slice(0,20).map(t=>({...parseTheme(serializeTheme(t),themes[0]),id:typeof t.id==='string'&&/^custom-[a-z0-9-]+$/.test(t.id)?t.id:'custom-restored'}));}catch{}
themes.push(...customThemes);
let sourceMode=false,reading=false;
let appliedTheme='';
let inputEvents=[];
const floatingOutline=createFloatingOutline({getView:()=>view,settings,persist:persistSettings});
const fileTree=createFileTree({send,getView:()=>view,isComposing});
const utilityPanel=createUtilityPanel({getView:()=>view,isComposing});
const positions=createReadingPositions({getView:()=>view,getKey:()=>documentKey,settings,isComposing});
const preferences=createPreferences({settings,persist:persistSettings,onChange:applyEditorPreferences,getView:()=>view,isComposing});
const comparison=createComparison({getView:()=>view,isComposing});
const conflictMerge=createConflictMerge({getView:()=>view,isComposing,onOpenChange:active=>{if(active){stashTab();clearTimeout(autosaveTimer);clearTimeout(draftTimer);}mediaPanel(active);if(!active)scheduleSave();}});
const documentStats=createDocumentStats({getView:()=>view,getRaw:currentRaw,isComposing});
let deferredVisualLoad=null;const deferredVisualMessages=[];
const visualEditor=createVisualEditor({getView:()=>view,isComposing,onError:message=>showNotice(message),onOpenChange:visualPanelChanged,onReplace:()=>native?requestUtility('importLocalImage',{purpose:'replace'}):Promise.reject(new Error('请在 Mac 应用中替换本地图片。')),onReveal:reference=>requestUtility('revealImage',{reference:reference.replace(/^<|>$/g,'')})});
function mediaPanel(active){mediaBusy=active;send('editingPanel',{active});if(!active){flushLinkMaintenance();applyTheme();if(deferredMediaLoad){const payload=deferredMediaLoad;deferredMediaLoad=null;queueMicrotask(()=>window.mokune.receive(payload));}}}
const mediaViewer=createMediaViewer({canOpen:()=>!!view&&!isComposing(view)&&!visualEditor.isOpen(),onOpenChange:mediaPanel});
let resourceHistorySnapshot={documents:[],complete:true};
function captureResourceHistory(){const tabs=[...tabStates].filter(([id])=>id!==activeTabID).map(([id,t])=>({id,path:t.documentKey,name:t.filename,state:t.state}));tabs.push({id:activeTabID,path:documentKey,name:filename,state:view.state});resourceHistorySnapshot=resourceHistory(tabs,state=>state.update({effects:readingConfig.reconfigure([EditorState.readOnly.of(false)])}).state);}
const resourceManager=createResourceManager({request:(command,payload)=>native?requestUtility(command,payload):Promise.reject(new Error('请在 Mac 应用中管理本地资源。')),send,getView:()=>view,isComposing,history:()=>resourceHistorySnapshot,onOpenChange:active=>{if(active){stashTab();captureResourceHistory();clearTimeout(autosaveTimer);clearTimeout(draftTimer);}mediaPanel(active);if(!active)scheduleSave();},navigate:(item,scanID)=>send('resourceNavigate',{scanID,documentID:item.documentID,path:item.path,line:item.line})});
const shortcutHints=createShortcutHints({native,canShow:()=>!!view&&!isComposing(view)&&!visualEditor.isOpen()&&!document.querySelector('dialog[open]')});
function visualPanelChanged(active){
  send('editingPanel',{active});
  if(active){clearTimeout(autosaveTimer);clearTimeout(draftTimer);return;}
  applyTheme();scheduleSave();flushImages();
  if(deferredVisualLoad){const payload=deferredVisualLoad;deferredVisualLoad=null;queueMicrotask(()=>window.mokune.receive(payload));}
  flushLinkMaintenance();
  for(const payload of deferredVisualMessages.splice(0))queueMicrotask(()=>window.mokune.receive(payload));
}
configureVisualTools({error:message=>showNotice(message),copyText:async text=>{if(native)await requestUtility('copyTableText',{text});else await navigator.clipboard.writeText(text);showNotice('已复制表格，可粘贴到 Excel / Numbers。');},source:(owner,position)=>{if(owner!==view||isComposing(view))return;setMode(true);owner.dispatch({selection:{anchor:Math.min(position,owner.state.doc.length)},effects:EditorView.scrollIntoView(position,{y:'nearest'})});owner.focus();},align:(owner,position,align,doc)=>{if(owner!==view||owner.state.doc!==doc||isComposing(view)||view.state.readOnly)return;try{const model=pictureModel(doc.toString(),position),changes=pictureChanges(model,{title:model.title,width:model.width,height:model.height,align});if(changes.length)owner.dispatch({changes,annotations:isolateHistory.of('full')});}catch(error){showNotice(error.message);}},resizeStart:()=>mediaPanel(true),resizeEnd:()=>mediaPanel(false),resize:(owner,position,size,doc)=>{if(owner!==view||owner.state.doc!==doc||isComposing(view)||view.state.readOnly)return;try{const model=pictureModel(doc.toString(),position),changes=pictureChanges(model,{title:model.title,width:Math.round(size.width)+'px',height:Math.round(size.height)+'px'});if(changes.length){mediaBusy=false;try{owner.dispatch({changes,annotations:isolateHistory.of('full')});}finally{mediaBusy=true;}}}catch(error){showNotice(error.message);}},finishInline:()=>visualEditor.finishInline(),cell:(owner,position,row,column,anchor)=>{if(owner===view)visualEditor.cell(position,row,column,anchor);},inlineCell:(owner,position,row,column,host,point)=>{if(owner===view)visualEditor.inlineCell(position,row,column,host,point);},image:(owner,position)=>{if(owner===view)visualEditor.image(position);}});
configureExtendedPreview(chosenTheme);
configureTableTools((owner,position)=>{if(owner===view)showTableTools(position);});
configureRichPreview({link:reference=>openLink(reference),edit:position=>{if(isComposing(view))return;setMode(true);view.dispatch({selection:{anchor:position},effects:EditorView.scrollIntoView(position,{y:'nearest'})});view.focus();}});
configureCodeLanguage((owner,position)=>{
 if(owner!==view||isComposing(view)||view.state.readOnly)return;const doc=owner.state.doc,line=doc.lineAt(position),match=line.text.match(/^([ \t]*(?:`{3,}|~{3,}))([^\n]*)$/);if(!match)return;
 const options=[{name:'纯文本',alias:['text','plaintext']},...languages,{name:'Mermaid',alias:['mermaid']},{name:'LaTeX',alias:['latex','math','tex']}];
 utilityPanel.open({title:'代码语言',placeholder:'搜索语言，如 Java、Python、JS…',search:query=>options.filter(item=>[item.name,...item.alias||[]].some(value=>value.toLowerCase().includes(query.trim().toLowerCase()))).map(item=>({title:item.name,detail:(item.alias||[]).join(' / '),language:(item.alias?.[0]||item.name).toLowerCase()})),choose:item=>{if(view!==owner||owner.state.doc!==doc||isComposing(view)||view.state.readOnly)return;owner.dispatch({changes:{from:line.from+match[1].length,to:line.to,insert:item.language==='text'?'':item.language},annotations:isolateHistory.of('full')});owner.focus();}});
});
document.addEventListener('click',event=>{const node=event.target.closest('.md-image-preview img,.md-rich-preview img,.scientific-preview-frame svg');if(node&&view?.dom.contains(node)&&!event.target.closest('button')){event.preventDefault();mediaViewer.open(node,view);}},true);
const pendingImages=new Map(),deferredImages=[],deferredTransfers=[];
const utilityRequests=new Map();let utilitySerial=0;
function requestUtility(command,payload={}){const id='utility-'+(++utilitySerial);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{utilityRequests.delete(id);reject(new Error('操作等待超时，请重试。'));},['importLocalImage','importAttachment','resourceCleanup'].includes(command)?600000:20000);utilityRequests.set(id,{resolve,reject,timer});send(command,{id,...payload});});}
function showQuickOpen(){let files;utilityPanel.open({title:'快速打开',placeholder:'输入文件名或路径…',search:async query=>{files||=await requestUtility('queryWorkspaceFiles');return {items:rankFiles(files.items,query),message:files.truncated?'仅索引前 10,000 份文稿。':''};},choose:item=>send('openWorkspaceFile',{path:item.path,workspaceToken:files.token})});}
const utilityCommands=[
 {title:'快速打开文稿',detail:'⌘P',run:showQuickOpen},
 {title:'打开本地文稿',detail:'⌘O',run:()=>send('open')},
 {title:'在 Finder 中显示当前文稿',run:()=>send('revealCurrent')},
 {title:'图片与附件管理',run:()=>resourceManager.open()},
 {title:'插入附件',run:importAttachment},
 {title:'新建文稿',detail:'⌘N',run:()=>send('new')},
 {title:'保存文稿',detail:'⌘S',run:()=>save()},
 {title:'查找与替换',detail:'⌘F',run:()=>openSearchPanel(view)},
 {title:'切换源码模式',detail:'⌘/ · ⌘⇧M',run:()=>setMode(!sourceMode)},
 {title:'显示或隐藏文件树',detail:'⌘⇧B',run:toggleSidebar},
 {title:'展开本篇大纲',run:()=>floatingOutline.open()},
 {title:'外观与主题',run:()=>{$('appearance').hidden=false;}},
 {title:'导出 PDF',detail:'⌘⇧E',run:()=>exportDocument('pdf')},
 {title:'导出 HTML',detail:'⌘⌥⇧E',run:()=>exportDocument('html')},
 ...shortcuts.map(item=>({title:item.title,detail:item.binding.replaceAll('Mod','⌘'),run:()=>format(item.action)}))
];
utilityCommands.push({title:'切换只读阅读模式',detail:'⌘⇧R',run:()=>setReading(!reading)});
utilityCommands.push({title:'文稿与选区统计',run:()=>documentStats.open()});
function preferenceExtensions(){return [EditorState.tabSize.of([2,4,8].includes(settings.tabSize)?settings.tabSize:2),indentUnit.of(' '.repeat([2,4,8].includes(settings.tabSize)?settings.tabSize:2)),...(settings.softWrap?[EditorView.lineWrapping]:[]),...(settings.typewriter?[scrollPastEnd()]:[])];}
function centerTyping(owner){if(!settings.typewriter)return;requestAnimationFrame(()=>{if(owner===view&&!isComposing(owner)&&owner.hasFocus)owner.dispatch({effects:EditorView.scrollIntoView(owner.state.selection.main.head,{y:'center'})});});}
function applyEditorPreferences(){if(isComposing(view)){pendingPreferences=true;return;}if(view){view.dispatch({effects:preferencesConfig.reconfigure(preferenceExtensions())});scheduleSave();}send('preferences',{resumeLastDocument:settings.resumeLastDocument});}
utilityCommands.push({title:'编辑设置',detail:'⌘,',run:()=>preferences.open()});
function locationPoint(){const head=view.state.selection.main.head,line=view.state.doc.lineAt(head);return {line:line.number,column:head-line.from+1};}
function openLink(reference){if(!view||isComposing(view))return;reference||=linkAt(view.state.doc.toString(),view.state.selection.main.head);if(!reference){showNotice('请将光标放入 Markdown 链接，或按住 ⌘ 点击链接。');return;}if(!hasPath&&reference.startsWith('#')){jumpAnchor(reference);return;}send('openDocumentLink',{reference,...locationPoint()});}
function jumpAnchor(fragment){const position=anchorPosition(view.state.doc.toString(),fragment);if(position===null){showNotice('没有找到对应的标题锚点：'+fragment);return;}view.dispatch({selection:{anchor:position},scrollIntoView:true});view.focus();}
function navigateHistory(direction){if(view&&!isComposing(view))send('navigateHistory',{direction,...locationPoint()});}
const linkNavigation=EditorView.domEventHandlers({click(event,owner){if(isComposing(owner))return false;const anchor=event.target.closest('a');if(!anchor&&!event.metaKey&&!reading)return false;const position=owner.posAtCoords({x:event.clientX,y:event.clientY}),reference=anchor?.getAttribute('href')||linkAt(owner.state.doc.toString(),position??owner.state.selection.main.head);if(!reference)return false;event.preventDefault();openLink(reference);return true;}});
utilityCommands.push({title:'打开光标处的链接',detail:'⌘⌥Enter',run:()=>openLink()},{title:'返回链接位置',detail:'⌘⌥←',run:()=>navigateHistory('back')},{title:'前进链接位置',detail:'⌘⌥→',run:()=>navigateHistory('forward')});
function showTableTools(position=view?.state.selection.main.head){if(!view||isComposing(view)||view.state.readOnly)return;const owner=view,before=view.state.doc.toString();try{if(!tableOperation(before,position,'row')){showNotice('先将光标放入表格，或点击表格预览中的“表格工具”。');return;}}catch(error){showNotice(error.message);return;}const actions=[['在当前行下方插入一行','row'],['在右侧添加一列','column'],['当前列左对齐','left'],['当前列居中','center'],['当前列右对齐','right']];utilityPanel.open({title:'表格工具',placeholder:'插入行列，或调整光标所在列的对齐…',search:query=>actions.filter(([title])=>title.includes(query)).map(([title,operation])=>({title,operation,detail:'每次操作可用 ⌘Z 撤销'})),choose:item=>{if(owner!==view||view.state.doc.toString()!==before||isComposing(view)||view.state.readOnly)return;try{const changes=tableOperation(before,position,item.operation);if(changes)view.dispatch({changes,annotations:isolateHistory.of('full')});view.focus();}catch(error){showNotice(error.message);}}});}
utilityCommands.push({title:'表格工具',run:()=>showTableTools()});
utilityCommands.push({title:'编辑单元格',run:()=>visualEditor.cell(view.state.selection.main.head)});
utilityCommands.push({title:'图片设置',run:()=>visualEditor.image(view.state.selection.main.head)});
async function compareDisk(){
 if(!view||isComposing(view)||mediaBusy)return;const owner=view,before=currentRaw(),expectedRevision=revision;stashTab();clearTimeout(autosaveTimer);clearTimeout(draftTimer);
 const valid=()=>view===owner&&currentRaw()===before&&revision===expectedRevision&&!isComposing(view)&&!view.state.readOnly;
 try{
  let result=await requestUtility('compareDisk',{raw:before,revision:expectedRevision});
  if(view!==owner||currentRaw()!==before||revision!==expectedRevision||isComposing(view)){showNotice('文稿已变化，请重新比较。');return;}
  if(view.state.readOnly||!result.snapshot){comparison.open({title:'比较磁盘版本',rightLabel:'磁盘内容',left:before,right:result.raw,note:'只读比较，正文保持原样。'});return;}
  try{conflictMerge.open({name:filename,current:before,disk:result.raw,refresh:async()=>{if(!valid())throw new Error('文稿已变化，请关闭后重新比较。');result=await requestUtility('compareDisk',{raw:before,revision:expectedRevision});return result.raw;},apply:async raw=>{
   if(!valid())throw new Error('文稿已变化，未应用合并。');const authorization=await requestUtility('validateMerge',{snapshot:result.snapshot,raw:before,revision:expectedRevision});
   if(!valid())throw new Error('文稿已变化，未应用合并。');const metadata=decodeSource(raw),changes=mergeTextChanges(view.state.doc.toString(),metadata.text);
   view.dispatch({changes,effects:[restoreEols.of(metadata),setMergeAuthorization.of(authorization.mergeToken)],annotations:isolateHistory.of('full'),filter:false,userEvent:'input.merge'});
   send('syncTab',{raw:currentRaw(),revision,dirty:true,position:sessionPosition()});
  }});}catch(error){comparison.open({title:'比较磁盘版本',rightLabel:'磁盘内容',left:before,right:result.raw,note:error.message});}
 }catch(error){showNotice(error.message);}finally{if(!conflictMerge.isOpen()&&view===owner)scheduleSave();}
}
utilityCommands.push({title:'比较磁盘版本',run:compareDisk});
function restoreRaw(raw){if(!view||isComposing(view)||view.state.readOnly)return;const metadata=decodeSource(raw);view.dispatch({changes:{from:0,to:view.state.doc.length,insert:metadata.text},effects:restoreEols.of(metadata),selection:{anchor:0},annotations:isolateHistory.of('full')});view.focus();}
async function showVersions(){if(!view||isComposing(view))return;const owner=view;try{const data=await requestUtility('versions');if(owner!==view)return;utilityPanel.open({title:'版本历史',placeholder:'搜索保存时间…',search:query=>{const items=data.items.map(item=>({...item,title:new Date(item.date).toLocaleString(),detail:(item.bytes/1024).toFixed(1)+' KB · 保存前快照'})).filter(item=>item.title.includes(query));return {items,message:items.length?'保留最近 30 个版本；单文稿最多 40 MB。':'暂无版本。文稿发生保存变更时，会先保留原来的内容。'};},choose:async item=>{const before=currentRaw(),owner=view;try{const result=await requestUtility('versions',{operation:'read',version:item.id,token:data.token});if(view!==owner||currentRaw()!==before){showNotice('文稿已变化，请重新选择版本。');return;}comparison.open({title:'版本预览',left:before,right:result.raw,note:item.title+' · 恢复后可用 ⌘Z 撤销',restore:view.state.readOnly?undefined:()=>{if(view===owner&&currentRaw()===before)restoreRaw(result.raw);}});}catch(error){showNotice(error.message);}}});}catch(error){showNotice(error.message);}}
utilityCommands.push({title:'版本历史',run:showVersions});
const transferableImage=file=>/\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(file.name)||/^image\/(png|jpeg|gif|webp|avif|svg\+xml|heic)$/.test(file.type);
async function importTransfer(files){if(!view||isComposing(view)||view.state.readOnly)return;if(!hasPath){showNotice('请先保存文稿，再粘贴或拖入图片。');return;}if(!files.length||files.length>10||files.reduce((n,f)=>n+f.size,0)>20*1024*1024){showNotice('每次最多导入 10 张图片，总计不超过 20 MB。');return;}const id='image-'+(++utilitySerial),owner=view;pendingImages.set(id,{view,revision,selection:{from:view.state.selection.main.from,to:view.state.selection.main.to}});try{const items=await Promise.all(files.map(async file=>{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));const ext={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/svg+xml':'svg','image/heic':'heic'}[file.type]||'png';return {name:/\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(file.name)?file.name:'粘贴图片.'+ext,data:btoa(binary)};}));if(owner!==view){pendingImages.delete(id);return;}if(isComposing(view))deferredTransfers.push({id,items,owner});else send('importImageData',{id,items});}catch(error){pendingImages.delete(id);showNotice('图片读取未完成：'+error.message);}}
const imageTransfers=EditorView.domEventHandlers({paste(event){const files=[...(event.clipboardData?.files||[])].filter(transferableImage);if(!files.length)return false;event.preventDefault();importTransfer(files);return true;},dragover(event){if(event.dataTransfer?.types.includes('Files')){event.preventDefault();return true;}return false;},drop(event){const files=[...(event.dataTransfer?.files||[])];if(!files.length)return false;event.preventDefault();if(!files.every(transferableImage)){showNotice('这里只接收图片；Markdown 文稿请通过打开命令载入。');return true;}importTransfer(files);return true;}});
function insertLocalImage(){if(!view||isComposing(view)||view.state.readOnly)return;const id='image-'+(++utilitySerial);pendingImages.set(id,{view,revision,selection:{from:view.state.selection.main.from,to:view.state.selection.main.to}});send('importLocalImage',{id});}
const deferredAttachments=[];
function applyAttachment(item){const {owner,doc,range,result}=item;if(owner!==view||view.state.doc!==doc||view.state.readOnly){showNotice('附件已复制，正文已变化，未自动插入。路径：'+result.reference);return;}if(isComposing(view)){deferredAttachments.push(item);return;}const text=attachmentMarkdown(result.name,result.reference);view.dispatch({changes:{from:range.from,to:range.to,insert:text},selection:{anchor:range.from+text.length},annotations:isolateHistory.of('full')});view.focus();}
function flushAttachments(){while(deferredAttachments.length&&!isComposing(view))applyAttachment(deferredAttachments.shift());}
async function importAttachment(){if(!view||isComposing(view)||view.state.readOnly||mediaBusy)return;if(!hasPath){showNotice('请先保存文稿，再插入附件。');return;}const owner=view,doc=view.state.doc,range={from:view.state.selection.main.from,to:view.state.selection.main.to};try{const result=await requestUtility('importAttachment');if(!result.cancelled)applyAttachment({owner,doc,range,result});}catch(error){showNotice(error.message);}}
function imageImported(payload){const request=pendingImages.get(payload.id);if(!request)return;if(isComposing(view)||visualEditor.isOpen()){deferredImages.push(payload);return;}pendingImages.delete(payload.id);if(request.view!==view)return;if(payload.cancelled)return;if(payload.error){showNotice(payload.error);return;}if(revision!==request.revision||view.state.readOnly){showNotice('图片已复制，正文发生变化，未自动插入。路径：'+(payload.images||[payload]).map(image=>image.reference).join('、'));return;}const source=(payload.images||[payload]).map(image=>imageMarkdown(image.name,image.reference)).join('\n\n');view.dispatch({changes:{...request.selection,insert:source},selection:{anchor:request.selection.from+source.length},annotations:isolateHistory.of('full')});view.focus();}
function flushImages(){while(deferredTransfers.length&&!isComposing(view)&&!visualEditor.isOpen()){const request=deferredTransfers.shift();if(request.owner===view)send('importImageData',{id:request.id,items:request.items});else pendingImages.delete(request.id);}while(deferredImages.length&&!isComposing(view)&&!visualEditor.isOpen())imageImported(deferredImages.shift());}
utilityCommands.push({title:'导入本地图片',detail:'⌘⌥I',run:insertLocalImage});
function showGoTo(){if(!view)return;const position=view.state.selection.main.head,current=view.state.doc.lineAt(position);utilityPanel.open({title:'跳转行列',placeholder:'行号，或 行号:列号',value:current.number+':'+(position-current.from+1),search:query=>{const lengths=[];for(let i=1;i<=view.state.doc.lines;i++)lengths.push(view.state.doc.line(i).length);const location=parseLocation(query,lengths);return location?[{title:`第 ${location.line} 行 · 第 ${location.column} 列`,detail:`共 ${view.state.doc.lines} 行；超出范围时定位到边界`,...location}]:{items:[],message:'请输入正整数行号，或“行号:列号”。'};},choose:item=>navigateLine(item.line,item.column)});}
utilityCommands.push({title:'切换任务完成状态',detail:'⌘Enter',run:()=>toggleCurrentTask(view)});
utilityCommands.push({title:'跳转行列',detail:'⌘L',run:showGoTo});
function navigateLine(line,column=1){if(!view||isComposing(view))return;const target=view.state.doc.line(Math.max(1,Math.min(view.state.doc.lines,Number(line)||1))),position=target.from+Math.max(0,Math.min(target.length,(Number(column)||1)-1));view.dispatch({selection:{anchor:position},scrollIntoView:true});view.focus();}
function showWorkspaceSearch(){utilityPanel.open({title:'文件夹全文搜索',placeholder:'输入要查找的文字…',search:async query=>{if(!query.trim())return {items:[],message:'搜索当前文件夹中的 Markdown 和文本内容。'};const result=await requestUtility('searchWorkspace',{query});return {items:result.items.map(item=>({...item,title:item.name+' : '+item.line,detail:item.path+' · '+item.snippet,workspaceToken:result.token})),message:result.truncated?'达到 200 条结果或 20 MB 扫描上限，请缩小关键词。':result.items.length?'':'没有匹配内容'};},choose:item=>send('openWorkspaceFile',{path:item.path,line:item.line,workspaceToken:item.workspaceToken})});}
utilityCommands.push({title:'在文件夹中搜索',detail:'⌘⌥F',run:showWorkspaceSearch});
function showCommands(){utilityPanel.open({title:'命令面板',placeholder:'输入操作名称，如“加粗”“导出”“主题”…',search:query=>rankFiles(utilityCommands.map((item,i)=>({...item,name:item.title,path:item.title+' '+(item.detail||''),index:i})),query),choose:item=>item.run()});}
let exporting=false,exportSequence=0;
const exportRequests=new Map();
function exportStatus(message){$('export-status').textContent=message;$('export-status').title=message;}
function resolveExportImages(images,imageBase){
  if(!images.length)return Promise.resolve([]);
  if(!native)return Promise.reject(new Error('请使用 Mac 应用导出含图片的文稿。'));
  const id=String(++exportSequence);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{exportRequests.delete(id);reject(new Error('图片准备超时，请重试。'));},90000);exportRequests.set(id,{resolve,reject,timer});send('exportImages',{id,images,imageBase});});
}
async function exportDocument(format) {
  if(exporting||isComposing(view))return;
  exporting=true;send('exportStatus',{busy:true});exportStatus('正在准备导出…');
  const snapshot={text:view.state.doc.toString(),name:filename,theme:{...chosenTheme()},fontSize:settings.fontSize,width:settings.width,layout:exportLayout(settings),...previewAssets(view.state)};
  try {
    const engine=await loadExportEngine(),html=await engine.build(snapshot,{renderScientific,resolveImages:resolveExportImages,highlightCode});
    while(isComposing(view)||visualEditor.isOpen())await new Promise(resolve=>setTimeout(resolve,60));
    if(native){exportStatus('请选择导出位置…');send('writeExport',{format,html,name:snapshot.name});}
    else {const blob=new Blob([html],{type:'text/html;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=snapshot.name.replace(/\.(md|markdown)$/i,'')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);exporting=false;exportStatus('HTML 已导出');}
  }catch(error){const message='导出未完成：'+String(error.message||error);exportStatus(message);while(isComposing(view)||visualEditor.isOpen())await new Promise(resolve=>setTimeout(resolve,60));exporting=false;send('exportFailure',{message});}
}
const systemDark=matchMedia('(prefers-color-scheme: dark)');
const welcome=`# 让思绪，安静落在纸上。\n\n一份 Markdown，一处不被打扰的空间。\n\n写作的时候，我们需要的或许很少：舒服的排版，顺手的编辑，以及一个始终可靠的保存按钮。让工具退后一步，让表达自然发生。\n\n> 好的工具，把复杂留给自己，把简单留给写作者。\n\n## 从一段文字开始\n\n用熟悉的 Markdown 记录想法。标题、引用和列表随输入自然呈现；需要查看标记时，回到当前行就好。\n\n- 保持 **原始文本**，不悄悄整理你的空行与缩进。\n- 照顾中文输入，让光标留在它应该在的位置。\n- 在明暗之间，找到适合自己的阅读节奏。\n\n## 也给代码，一点清晰的层次\n\n\`\`\`rust\n// 安全保存：保留原文中的每个字符\npub fn save_document(path: &Path, source: &str) -> Result<()> {\n    let revision = 42;\n    atomic_write(path, source.as_bytes())?;\n    println!("已保存版本 {}", revision);\n    Ok(())\n}\n\`\`\`\n\n## 留一点空间，给下一句话\n\n按 ⌘O 打开本地文稿，按 ⌘S 保存。右上角可以切换源码、选择主题，或者进入专注模式。\n\n即时排版保留标记的占位，避免中文输入时文字跳动。表格、图片、公式与 Mermaid 支持即时预览，原始 Markdown 始终保留。\n`;

function send(command,payload={}) {
  if(native&&command==='workspaceMutation'&&['move','rename'].includes(payload.operation)){stashTab();}
  if(activeTabID&&!Object.hasOwn(payload,'tabID'))payload={tabID:activeTabID,...payload};
  if(native) window.webkit.messageHandlers.mokune.postMessage({command,...payload});
  else browserCommand(command,payload);
}
let sessionPositionTimer;const pendingLinkMaintenance=[];
function flushLinkMaintenance(){if(!isComposing(view)&&!mediaBusy&&!visualEditor.isOpen())for(const payload of pendingLinkMaintenance.splice(0))applyLinkMaintenance(payload);}
function applyLinkMaintenance(payload){
 if(isComposing(view)||mediaBusy||visualEditor.isOpen()){pendingLinkMaintenance.push(payload);return;}
 for(const tab of payload.tabs){
  const active=tab.tabID===activeTabID,retained=tabStates.get(tab.tabID),state=active?view.state:retained?.state;
  // Tabs not visited since restart use the already updated native snapshot on first activation.
  if(!state)continue;
  const text=state.doc.toString(),result=maintainLinks(text,tab.path,payload.source,payload.destination);
  if(!result.changes.length)continue;
  const transaction={changes:result.changes,filter:false,annotations:isolateHistory.of('full')};
  if(active){const owner=view,top=owner.scrollDOM.scrollTop,left=owner.scrollDOM.scrollLeft;view.dispatch(transaction);const updated=owner.state;requestAnimationFrame(()=>{if(view===owner&&view.state===updated&&!isComposing(view)){owner.scrollDOM.scrollTop=top;owner.scrollDOM.scrollLeft=left;}});send('syncTab',{raw:currentRaw(),revision,dirty:currentRaw()!==savedRaw||conflicted,position:sessionPosition()});}
  else{retained.state=state.update(transaction).state;retained.revision++;const raw=encodeSource(retained.state.doc.toString(),retained.state.field(retained.sourceField));send('syncTab',{tabID:tab.tabID,raw,revision:retained.revision,dirty:raw!==retained.savedRaw||retained.conflicted});}
 }
}
function planWorkspaceMove(payload){
 if(isComposing(view)||mediaBusy||visualEditor.isOpen()){send('workspaceMoveCommit',{id:payload.id,error:'请先完成当前输入或图片操作，再移动文件。'});return;}
 try{
  const updates=[];
  for(const doc of payload.documents){const result=maintainLinks(doc.raw,doc.path,payload.source,payload.destination);if(result.changes.length)updates.push({path:doc.path,raw:result.raw,changes:maintainLinks(decodeSource(doc.raw).text,doc.path,payload.source,payload.destination).changes});}
  send('workspaceMoveCommit',{id:payload.id,updates});
 }catch{send('workspaceMoveCommit',{id:payload.id,error:'链接检查未完成，原文件尚未移动。'});}
}

function sessionPosition(){const range=view.state.selection.main;return {anchor:range.anchor,head:range.head,scroll:view.scrollDOM.scrollTop,scrollLeft:view.scrollDOM.scrollLeft,sourceMode,reading};}
// Hidden WebKit windows can suspend RAF, while later height measurements adjust scroll anchoring.
// Retry once after that adjustment; genuine user input cancels both deferred restores.
function restoreSessionScroll(owner,position){
 const doc=owner.state.doc,selection=owner.state.selection,events=['pointerdown','wheel','touchstart','keydown','beforeinput','input','compositionstart'];let stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;clearTimeout(first);clearTimeout(last);for(const type of events)owner.dom.removeEventListener(type,stop,true);};
 const restore=final=>{if(stopped)return;if(view!==owner||owner.state.doc!==doc||!owner.state.selection.eq(selection)){stop();return;}owner.scrollDOM.scrollTop=Math.max(0,Number(position.scroll)||0);owner.scrollDOM.scrollLeft=Math.max(0,Number(position.scrollLeft)||0);if(final)stop();};
 const first=setTimeout(()=>restore(false),180),last=setTimeout(()=>restore(true),360);
 for(const type of events)owner.dom.addEventListener(type,stop,{capture:true,passive:true});
 requestAnimationFrame(()=>requestAnimationFrame(()=>restore(true)));
}
function queueSessionPosition(){clearTimeout(sessionPositionTimer);sessionPositionTimer=setTimeout(()=>{if(view&&activeTabID&&!isComposing(view)&&!mediaBusy)send('sessionPosition',{position:sessionPosition()});},400);}
function stashTab(){if(!view||!activeTabID||closedTabs.has(activeTabID))return;positions.record();const raw=currentRaw();tabStates.set(activeTabID,{state:view.state,sourceField,revision,savedRaw,hasPath,conflicted,filename,documentKey,sourceMode,reading,savingSources:new Map(savingSources),scroll:view.scrollDOM.scrollTop,scrollLeft:view.scrollDOM.scrollLeft,notice:$('notice-text').textContent,noticeVisible:!$('notice').hidden});send('syncTab',{raw,revision,dirty:raw!==savedRaw||conflicted,tabID:activeTabID,position:sessionPosition()});}
function selectTab(id){if(id===activeTabID||isComposing(view))return;stashTab();clearTimeout(autosaveTimer);clearTimeout(draftTimer);if(native)send('switchTab',{id});else if(tabStates.has(id))loadDocument({tabID:id});}
function closeTab(id=activeTabID){if(!id||isComposing(view))return;stashTab();closingTabID=id;if(id===activeTabID){clearTimeout(autosaveTimer);clearTimeout(draftTimer);}send('closeTab',{id});}
function cycleTab(direction){const i=tabItems.findIndex(t=>t.id===activeTabID);if(tabItems.length)selectTab(tabItems[(i+direction+tabItems.length)%tabItems.length].id);}
function currentRaw(){return encodeSource(view.state.doc.toString(),view.state.field(sourceField));}
function format(action) {
  if(isComposing(view)||view.state.readOnly||!formatCommands[action])return false;
  const result=formatCommands[action](view);view.focus();return result;
}
function persistSettings(){try{localStorage.setItem('mokune.settings',JSON.stringify(settings));}catch{}}
function chosenTheme(){return themes.find(t=>t.id===(settings.followSystem?(systemDark.matches?settings.darkTheme:settings.lightTheme):settings.theme))||themes[0];}
// Style modules stay mounted in the document. Reuse one module across loads
// and themes; fresh HighlightStyle definitions would leak CSS rules each time.
const sharedHighlighting=[syntaxHighlighting(classHighlighter),syntaxHighlighting(HighlightStyle.define([
    {tag:[tags.keyword,tags.modifier,tags.bool,tags.null],color:'var(--keyword)',fontWeight:'600'},
    {tag:[tags.typeName,tags.className,tags.namespace],color:'var(--function)'},
    {tag:[tags.operator,tags.operatorKeyword],color:'var(--accent)'},
    {tag:[tags.propertyName,tags.attributeName],color:'var(--string)'},
    {tag:[tags.string,tags.special(tags.string),tags.character],color:'var(--string)'},
    {tag:[tags.function(tags.variableName),tags.function(tags.propertyName),tags.macroName,tags.definition(tags.variableName)],color:'var(--function)'},
    {tag:[tags.number,tags.integer,tags.float],color:'var(--number)'},
    {tag:[tags.comment,tags.lineComment,tags.blockComment,tags.meta],color:'var(--comment)'},
    {tag:tags.heading,color:'var(--foreground)',fontWeight:'600'},
    {tag:tags.strong,fontWeight:'600'}, {tag:tags.emphasis,fontStyle:'italic'},
    {tag:[tags.url,tags.link],color:'var(--accent)'},
  ]))];
function highlighting(){return sharedHighlighting;}
function applyTheme() {
  if(isComposing(view)||visualEditor.isOpen()||mediaBusy)return;
  const theme=chosenTheme();
  for(const [key,value] of Object.entries(themeVariables(theme)))document.documentElement.style.setProperty(key,value);
  document.documentElement.style.setProperty('--font-size',`${Number(settings.fontSize)||17}px`);
  document.documentElement.style.setProperty('--line-width',contentWidth(settings.width));
  document.body.classList.toggle('full-width',settings.width==='full');
  document.body.classList.toggle('dark',theme.dark);
  document.documentElement.style.colorScheme=theme.dark?'dark':'light';
  if(view&&appliedTheme!==theme.id)view.dispatch({effects:[colorConfig.reconfigure(highlighting()),setPreviewPalette.of(theme)]});
  appliedTheme=theme.id;
  for(const card of document.querySelectorAll('[data-theme]')) {const selected=card.dataset.theme===theme.id;card.setAttribute('aria-pressed',selected);card.querySelector('.theme-check').textContent=selected?' ✓':'';}
  if($('theme-source')){const source=$('theme-source');source.textContent=theme.source?'基于 '+theme.english+' · MIT · 查看来源':theme.custom?'自定义主题 · 本地保存':'Mokune 原创主题';source.hidden=false;source.href=theme.source||'#';source.dataset.link=theme.source?'true':'false';$('remove-theme').hidden=!theme.custom;}
  $('font-size').value=settings.fontSize;$('line-width').value=settings.width;$('follow-system').checked=settings.followSystem;$('auto-save').checked=settings.autoSave;
  send('theme',{dark:theme.dark,background:theme.background});
}
function readingExtensions(){return [EditorState.readOnly.of(reading),EditorView.editable.of(!reading)];}
function setReading(enabled){if(!view||isComposing(view))return;reading=enabled;const top=view.scrollDOM.scrollTop;view.dispatch({effects:readingConfig.reconfigure(readingExtensions())});document.body.classList.toggle('reading-mode',reading);$('reading-toggle').setAttribute('aria-pressed',String(reading));$('reading-toggle').textContent=reading?'只读':'阅读';queueSessionPosition();requestAnimationFrame(()=>view.scrollDOM.scrollTop=top);view.focus();}
function modeExtensions(){return sourceMode?[lineNumbers(),highlightActiveLine(),highlightActiveLineGutter(),foldGutter()]:[livePreview,taskPreview,blockPreview,scientificPreview,extensionPreview,richPreview];}
function setMode(source) {
  queueSessionPosition();
  if(composing){queuedMode=source;return;}
  sourceMode=source;document.body.classList.toggle('source-mode',source);
  $('live-mode').classList.toggle('selected',!source);$('source-mode').classList.toggle('selected',source);
  $('live-mode').setAttribute('aria-pressed',!source);$('source-mode').setAttribute('aria-pressed',source);
  const top=view.scrollDOM.scrollTop;
  view.dispatch({effects:modeConfig.reconfigure(modeExtensions())});
  requestAnimationFrame(()=>{view.scrollDOM.scrollTop=top;});
  view.focus();
}
function updateOutline() {
  floatingOutline.refresh(view.state.doc.toString());
}
function updateStats() {
  const pos=view.state.selection.main.head,line=view.state.doc.lineAt(pos);
  $('position').textContent=`${line.number}:${pos-line.from+1}`;
}
function scheduleStats() {
  clearTimeout(outlineTimer);outlineTimer=setTimeout(()=>{
    if(isComposing(view))return;
    const text=view.state.doc.toString();
    $('word-count').textContent=`${(text.match(/\p{Script=Han}|[A-Za-z0-9_]+/gu)||[]).length} 字`;
    updateOutline();
  },180);
}
function scheduleSave() {
  clearTimeout(autosaveTimer);clearTimeout(draftTimer);
  if(composing||visualEditor.isOpen()||closing||(closingTabID&&closingTabID===activeTabID))return;
  if(settings.autoSave&&hasPath&&!conflicted)autosaveTimer=setTimeout(()=>{if(!isComposing(view)&&currentRaw()!==savedRaw)save(false);},1200);
  draftTimer=setTimeout(()=>{if(isComposing(view))return;const raw=currentRaw();if(raw===savedRaw&&!conflicted){$('save-status').textContent=hasPath?'已保存':'新文稿';send('clean',{revision});}else send('draft',{raw,position:sessionPosition()});},800);
}
function save(saveAs=false,extra={}) {
  if(visualEditor.isOpen()){visualEditor.action('save');return;}
  if(composing){saveQueued={saveAs,extra};return;}
  clearTimeout(autosaveTimer);
  const raw=currentRaw();savingSources.set(revision,raw);if(savingSources.size>20)savingSources.delete(savingSources.keys().next().value);send(saveAs?'saveAs':'save',{raw,revision,mergeToken:view.state.field(mergeAuthorization),...extra});
}
function loadDocument(payload) {
  if(payload.tabID&&activeTabID&&payload.tabID!==activeTabID)stashTab();
  const retained=payload.tabID&&!payload.replace?tabStates.get(payload.tabID):null;
  activeTabID=payload.tabID||null;
  positions.record();utilityPanel.close();documentStats.close();comparison.close();preferences.close();savingSources.clear();pendingImages.clear();deferredImages.length=0;deferredTransfers.length=0;
  clearTimeout(autosaveTimer);clearTimeout(draftTimer);clearTimeout(outlineTimer);
  if(!retained&&payload.position){sourceMode=!!payload.position.sourceMode;reading=!!payload.position.reading;}
  const raw=payload.raw??welcome,metadata=decodeSource(raw),source=sourceExtensions(metadata);
  sourceField=source.field;savedRaw=raw;revision=0;hasPath=!!payload.hasPath;conflicted=false;composing=false;
  filename=payload.name||'未命名.md';documentKey=payload.documentKey||'';
  if(retained){({sourceField,revision,savedRaw,hasPath,conflicted,filename,documentKey,sourceMode,reading}=retained);for(const [key,value] of retained.savingSources)savingSources.set(key,value);}
  view?.destroy();
  view=new EditorView({parent:$('editor'),state:retained?.state||EditorState.create({doc:metadata.text,selection:{anchor:Math.min(metadata.text.length,(frontMatter(metadata.text)?.to??-1)+1)},extensions:[
    source.extensions,mergeAuthorization,mergeHistory,imageTransfers,linkNavigation,history(),codeLanguage,readingConfig.of(readingExtensions()),EditorState.transactionFilter.of(tr=>tr.docChanged&&(tr.startState.readOnly||mediaBusy)?[]:tr),highlightSpecialChars(),preferencesConfig.of(preferenceExtensions()),
    compositionGuard((active,owner)=>{
      if(owner!==view)return;
      composing=active;send('composition',{active});
      if(active){clearTimeout(autosaveTimer);clearTimeout(draftTimer);return;}
      applyTheme();if(pendingPreferences){pendingPreferences=false;applyEditorPreferences();}centerTyping(owner);
      scheduleStats();fileTree.flush();flushImages();flushAttachments();flushLinkMaintenance();
      if(deferredTabLoad){const payload=deferredTabLoad;deferredTabLoad=null;queueMicrotask(()=>loadDocument(payload));}
      if(queuedMode!==null){setMode(queuedMode);queuedMode=null;}
      if(saveQueued){const q=saveQueued;saveQueued=false;save(q.saveAs,q.extra);}else scheduleSave();
    }),previewConfiguration,scientificConfiguration,metadataSourceStyle,
    markdown({base:markdownLanguage,codeLanguages:languages}),bracketMatching(),closeBrackets(),search({top:true}),
    colorConfig.of(highlighting()),modeConfig.of(modeExtensions()),
    EditorView.contentAttributes.of({'aria-label':'Markdown 文稿','spellcheck':'false','autocapitalize':'off','autocorrect':'off'}),
    keymap.of([
      ...shortcuts.map(shortcut=>({key:shortcut.binding,run:()=>format(shortcut.action)})),
      {key:'Mod-w',run:()=>{closeTab();return true;}},{key:'Mod-Shift-[',run:()=>{cycleTab(-1);return true;}},{key:'Mod-Shift-]',run:()=>{cycleTab(1);return true;}},
      {key:'Mod-,',run:()=>{preferences.open();return true;}},
      {key:'Mod-Alt-Enter',run:()=>{openLink();return true;}},{key:'Mod-Alt-ArrowLeft',run:()=>{navigateHistory('back');return true;}},{key:'Mod-Alt-ArrowRight',run:()=>{navigateHistory('forward');return true;}},
      {key:'Mod-Shift-r',run:()=>{setReading(!reading);return true;}},
      {key:'Mod-Alt-i',run:()=>{insertLocalImage();return true;}},
      {key:'Mod-Enter',run:()=>{toggleCurrentTask(view);return true;}},
      {key:'Mod-l',run:()=>{showGoTo();return true;}},
      {key:'Mod-Alt-f',run:()=>{showWorkspaceSearch();return true;}},
      {key:'Mod-Shift-p',run:()=>{showCommands();return true;}},
      {key:'Mod-p',run:()=>{showQuickOpen();return true;}},
      {key:'Mod-s',run:()=>{save();return true;}},{key:'Mod-Shift-s',run:()=>{save(true);return true;}},
      {key:'Mod-o',run:()=>{send('open');return true;}},{key:'Mod-n',run:()=>{send('new');return true;}},
      {key:'Mod-Shift-o',run:()=>{if(!isComposing(view))send('openFolder');return true;}},
      {key:'Mod-Shift-b',run:()=>{toggleSidebar();return true;}},{key:'Mod-Shift-f',run:()=>{toggleFocus();return true;}},
      {key:'Mod-/',run:()=>{setMode(!sourceMode);return true;}},
      {key:'Mod-Shift-m',run:()=>{setMode(!sourceMode);return true;}},
      {key:'Mod-Shift-e',run:()=>{exportDocument('pdf');return true;}},{key:'Mod-Alt-Shift-e',run:()=>{exportDocument('html');return true;}},
      {key:'Escape',run:()=>{if(!$('appearance').hidden){closeAppearance();return true;}return false;}},
      ...closeBracketsKeymap,...defaultKeymap,...historyKeymap,...searchKeymap,...foldKeymap,indentWithTab
    ]),
    EditorView.updateListener.of(update=>{
      const metadataChanged=update.startState.field(sourceField)!==update.state.field(sourceField),authorizationChanged=update.startState.field(mergeAuthorization)!==update.state.field(mergeAuthorization);
      if(authorizationChanged){conflicted=true;showNotice(update.state.field(mergeAuthorization)?'合并已应用，尚未保存。可用 ⌘Z 撤销，确认后按 ⌘S 保存。':'已撤销合并，原有编辑已恢复。可重新比较或另存副本。',true);}
      if(update.docChanged||metadataChanged||authorizationChanged){revision++;$('save-status').textContent=authorizationChanged?'合并待保存':'未保存';send('changed',{revision});scheduleStats();scheduleSave();positions.queue();if(!authorizationChanged)centerTyping(update.view);}
      if(metadataChanged){const meta=update.state.field(sourceField),kinds=new Set(meta.eols);$('encoding').textContent=meta.bom?'UTF-8 BOM':'UTF-8';$('eol').textContent=kinds.size>1?'混合行尾':meta.preferred==='\r\n'?'CRLF':meta.preferred==='\r'?'CR':'LF';}
      if(update.selectionSet||update.docChanged){queueSessionPosition();positions.queue();updateStats();if(!isComposing(update.view))floatingOutline.selection(update.state.selection.main.head);}
      if(update.viewportChanged||update.geometryChanged)floatingOutline.measure();
    })
  ]})});
  view.dispatch({effects:[setImageBase.of(payload.imageBase||''),setPreviewPalette.of(chosenTheme())]});
  floatingOutline.attach(view);fileTree.setDocument();if(!retained&&!payload.position)positions.restore(view,documentKey);else if(retained){const owner=view;requestAnimationFrame(()=>{if(view===owner){view.scrollDOM.scrollTop=retained.scroll;view.scrollDOM.scrollLeft=retained.scrollLeft;}});}view.scrollDOM.addEventListener('scroll',()=>{positions.queue();queueSessionPosition();},{passive:true});
  if(!retained&&payload.position&&settings.rememberPosition){const owner=view,p=payload.position,limit=n=>Math.max(0,Math.min(owner.state.doc.length,Number(n)||0));owner.dispatch({selection:{anchor:limit(p.anchor),head:limit(p.head)}});restoreSessionScroll(owner,p);}
  inputEvents=[];
  for(const type of ['keydown','beforeinput','input','compositionstart','compositionupdate','compositionend']) {
    const owner=view;
    view.contentDOM.addEventListener(type,event=>{
      if(owner!==view)return;
      inputEvents.push({type,trusted:event.isTrusted,code:event.code||'',keyCode:event.keyCode||0,inputType:event.inputType||'',composing:!!event.isComposing,head:view.state.selection.main.head});
      if(inputEvents.length>12)inputEvents.shift();
    },true);
  }
  $('filename').textContent=filename;$('current-document').textContent=filename;
  $('folder-label').textContent=payload.folder||'本地文稿';
  const currentMetadata=view.state.field(sourceField);
  $('encoding').textContent=currentMetadata.bom?'UTF-8 BOM':'UTF-8';
  const kinds=new Set(currentMetadata.eols);$('eol').textContent=kinds.size>1?'混合行尾':currentMetadata.preferred==='\r\n'?'CRLF':currentMetadata.preferred==='\r'?'CR':'LF';
  $('save-status').textContent=payload.recovered?'恢复的草稿':hasPath?'已保存':'新文稿';
  $('notice').hidden=true;
  if(retained){$('save-status').textContent=conflicted?'发现外部更改':currentRaw()!==savedRaw?'未保存':hasPath?'已保存':'新文稿';if(conflicted)showNotice('磁盘上的文件已更新。你的编辑已保留，请比较版本或另存副本。',true);else if(retained.noticeVisible)showNotice(retained.notice,false);}
  document.body.classList.toggle('source-mode',sourceMode);$('live-mode').classList.toggle('selected',!sourceMode);$('source-mode').classList.toggle('selected',sourceMode);$('live-mode').setAttribute('aria-pressed',!sourceMode);$('source-mode').setAttribute('aria-pressed',sourceMode);document.body.classList.toggle('reading-mode',reading);$('reading-toggle').setAttribute('aria-pressed',reading);$('reading-toggle').textContent=reading?'只读':'阅读';
  appliedTheme='';applyTheme();view.dispatch({effects:preferencesConfig.reconfigure(preferenceExtensions())});updateStats();scheduleStats();view.focus();if(retained)scheduleSave();
  if(payload.restoreNotice&&!retained)showNotice(payload.restoreNotice);
  if(payload.recovered&&!retained){revision++;send('changed',{revision});savedRaw=payload.savedRaw??'\0';scheduleSave();}
}
function showNotice(message,conflict=false) {
  conflicted=conflicted||conflict;if(conflicted)clearTimeout(autosaveTimer);
  $('notice-text').textContent=message;$('notice').hidden=false;
  $('compare-file').hidden=!conflicted;$('reload-file').hidden=!conflicted;$('save-copy').hidden=!conflicted;
}
function toggleSidebar(){
  if(isComposing(view))return;
  const sidebar=$('sidebar');
  if(innerWidth<=900){sidebar.classList.toggle('force-visible');sidebar.hidden=false;}
  else sidebar.hidden=!sidebar.hidden;
}
function toggleFocus(){document.body.classList.toggle('focus-mode');$('focus-toggle').setAttribute('aria-pressed',document.body.classList.contains('focus-mode'));}
function closeAppearance(){$('appearance').hidden=true;view?.focus();}
function themeCard(theme) {
  const button=document.createElement('button');button.className='theme-card';button.dataset.theme=theme.id;button.setAttribute('aria-label',`${theme.name} ${theme.english}`);button.setAttribute('aria-pressed','false');
  button.innerHTML='<div class="theme-mini"><strong>文字，有自己的秩序。</strong><div class="theme-mini-line"></div><div class="theme-mini-line"></div><div class="theme-mini-quote">让思路慢慢展开</div><div class="theme-mini-code"><i>let</i> idea = <em>"hello"</em>;</div></div><div class="theme-name"><span class="theme-label"></span><span class="theme-check"></span></div><small class="theme-description"></small>';
  button.querySelector('.theme-label').textContent=theme.name;button.querySelector('.theme-description').textContent=theme.subtitle||theme.english;
  const miniature=button.querySelector('.theme-mini');for(const [key,value]of Object.entries(themeVariables(theme)))miniature.style.setProperty(key,value);
  button.addEventListener('click',()=>{settings.theme=theme.id;if(theme.dark)settings.darkTheme=theme.id;else settings.lightTheme=theme.id;settings.followSystem=false;persistSettings();applyTheme();});return button;
}
function renderThemes(){for(const id of ['writing-themes','developer-themes','community-themes','custom-themes'])$(id).replaceChildren();themes.forEach((theme,index)=>$(theme.custom?'custom-themes':theme.source?'community-themes':index<6?'writing-themes':'developer-themes').append(themeCard(theme)));$('custom-theme-section').hidden=!customThemes.length;}
function themeStatus(message){$('theme-status').textContent=message;}
function importTheme(raw){
  if(isComposing(view)){themeStatus('请先完成当前输入，再导入主题。');return;}
  try{if(customThemes.length>=20)throw new Error('已保存 20 个自定义主题，请先移除不再使用的主题。');const theme=parseTheme(raw,chosenTheme());const next=[...customThemes,theme];localStorage.setItem('mokune.customThemes',JSON.stringify(next));customThemes=next;themes.push(theme);settings.theme=theme.id;settings.followSystem=false;persistSettings();renderThemes();applyTheme();themeStatus('已导入 '+theme.name);}
  catch(error){themeStatus(error.message);}
}
renderThemes();
$('theme-source').onclick=event=>{if(event.currentTarget.dataset.link!=='true')event.preventDefault();};
$('import-theme').onclick=()=>{if(isComposing(view))return;if(native)send('importTheme');else $('theme-file').click();};
$('theme-file').onchange=async event=>{const file=event.target.files[0];if(file)importTheme(await file.text());event.target.value='';};
$('export-theme').onclick=()=>{const theme=chosenTheme(),raw=serializeTheme(theme);if(native)send('exportTheme',{raw,name:theme.name});else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download=theme.id+'.mokune-theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}};
$('remove-theme').onclick=()=>{const theme=chosenTheme();if(!theme.custom||isComposing(view))return;customThemes=customThemes.filter(t=>t.id!==theme.id);themes.splice(themes.indexOf(theme),1);localStorage.setItem('mokune.customThemes',JSON.stringify(customThemes));settings.theme='paper';settings.followSystem=false;if(settings.lightTheme===theme.id)settings.lightTheme='paper';if(settings.darkTheme===theme.id)settings.darkTheme='graphite';persistSettings();renderThemes();applyTheme();themeStatus('已移除自定义主题');};
const icons={
 'sidebar-toggle':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
 'appearance-toggle':'<path d="M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M8 15v4"/>',
 'focus-toggle':'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>'
};
for(const [id,path]of Object.entries(icons))$(id).innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
$('navigate-back').onclick=()=>navigateHistory('back');$('navigate-forward').onclick=()=>navigateHistory('forward');
$('position').onclick=showGoTo;
$('commands-toggle').onclick=showCommands;
$('sidebar-toggle').onclick=toggleSidebar;$('focus-toggle').onclick=toggleFocus;
$('appearance-toggle').onclick=()=>{$('appearance').hidden=!$('appearance').hidden;};$('appearance-close').onclick=closeAppearance;
$('live-mode').onclick=()=>setMode(false);$('source-mode').onclick=()=>setMode(true);
$('open-file').onclick=()=>send('open');$('new-file').onclick=()=>send('new');$('current-document').onclick=()=>view.focus();
$('input-source').onclick=()=>send('inputSourceMenu');
$('save-copy').onclick=()=>save(true);$('reload-file').onclick=()=>send('reload');
$('dismiss-notice').onclick=()=>{$('notice').hidden=true;};
$('compare-file').onclick=compareDisk;
$('reading-toggle').onclick=()=>setReading(!reading);
$('word-count').onclick=()=>documentStats.open();
$('font-size').onchange=event=>{settings.fontSize=Number(event.target.value);persistSettings();applyTheme();};
$('line-width').onchange=event=>{settings.width=event.target.value==='full'?'full':Number(event.target.value);persistSettings();applyTheme();};

$('follow-system').onchange=event=>{settings.followSystem=event.target.checked;persistSettings();applyTheme();};
systemDark.addEventListener('change',()=>{if(settings.followSystem)applyTheme();});
document.addEventListener('keydown',event=>{if(event.isComposing||isComposing(view))return;if(event.key==='Escape'&&!$('appearance').hidden){closeAppearance();event.preventDefault();}});

window.mokune={
  diagnostics(){return {hasFocus:view.hasFocus,documentFocused:document.hasFocus(),activeElement:document.activeElement?.className||document.activeElement?.tagName,contentEditable:view.contentDOM.contentEditable,readOnly:view.state.readOnly,editable:view.state.facet(EditorView.editable),composing,selection:view.state.selection.main.toJSON(),inputEvents};},
  receive(payload){
    if(payload.type==='shortcutHints'){shortcutHints.show(payload.visible);return;}
    if(mediaBusy&&payload.type==='load'){deferredMediaLoad=payload;return;}
    if(mediaBusy&&payload.type==='action'){if(resourceManager.isOpen())resourceManager.action(payload.action);else if(conflictMerge.isOpen())conflictMerge.action(payload.action);return;}
    if(visualEditor.isOpen()&&['documentData','workspaceFiles','workspaceSearchResults','themeFile'].includes(payload.type)){deferredVisualMessages.push(payload);return;}
    if(visualEditor.isOpen()&&payload.type==='load'){deferredVisualLoad=payload;return;}
    if(visualEditor.isOpen()&&payload.type==='action'){visualEditor.action(payload.action);return;}
    if(payload.tabID&&payload.tabID!==activeTabID&&['saved','conflict','error','relocated'].includes(payload.type)){
      const state=tabStates.get(payload.tabID);if(state){if(payload.type==='conflict')state.conflicted=true;if(payload.type==='relocated'){state.filename=payload.name;state.documentKey=payload.documentKey;state.state=state.state.update({effects:setImageBase.of(payload.imageBase||'')}).state;}if(payload.type==='saved'){if(state.savingSources.has(payload.revision))state.savedRaw=state.savingSources.get(payload.revision);if(state.revision===payload.revision){state.conflicted=false;state.noticeVisible=false;state.notice='';}state.hasPath=true;state.filename=payload.name;state.documentKey=payload.documentKey||state.documentKey;state.savingSources.delete(payload.revision);}}return;
    }
    switch(payload.type){
      case 'tabs':tabItems=payload.items;tabBar.render(tabItems,payload.active);break;
      case 'tabClosed':closedTabs.add(payload.id);tabStates.delete(payload.id);closingTabID=null;break;
      case 'navigationState':$('navigate-back').disabled=!payload.back;$('navigate-forward').disabled=!payload.forward;break;
      case 'clipboardResult':
      case 'resourceResult':
      case 'workspaceSearchResults':
      case 'documentData':
      case 'workspaceFiles':{const request=utilityRequests.get(payload.id);if(request){clearTimeout(request.timer);utilityRequests.delete(payload.id);payload.error?request.reject(Object.assign(new Error(payload.error),{canUndo:payload.canUndo})):request.resolve(payload);}break;}
      case 'imageImported':{const request=utilityRequests.get(payload.id);if(request){clearTimeout(request.timer);utilityRequests.delete(payload.id);payload.error?request.reject(Object.assign(new Error(payload.error),{canUndo:payload.canUndo})):request.resolve(payload);}else imageImported(payload);break;}
      case 'themeFile':importTheme(payload.raw);break;
      case 'themeStatus':themeStatus(payload.message);break;
      case 'workspace':fileTree.setWorkspace(payload);break;
      case 'directoryChildren':fileTree.receive(payload);break;
      case 'workspaceError':fileTree.error(payload.message);break;
      case 'workspaceMutationResult':fileTree.result(payload);break;
      case 'workspaceMovePlan':planWorkspaceMove(payload);break;
      case 'linkMaintenance':applyLinkMaintenance(payload);break;
      case 'relocated':
        positions.record();documentKey=payload.documentKey||documentKey;positions.queue();
        filename=payload.name;$('filename').textContent=filename;$('current-document').textContent=filename;
        $('folder-label').textContent=payload.folder;
        view.dispatch({effects:setImageBase.of(payload.imageBase||'')});
        if(currentRaw()!==savedRaw)send('draft',{raw:currentRaw()});
        break;
      case 'exportImages':{const request=exportRequests.get(payload.id);if(request){clearTimeout(request.timer);exportRequests.delete(payload.id);payload.error?request.reject(new Error(payload.error)):request.resolve(payload.images);}break;}
      case 'exportFinished':exporting=false;exportStatus(payload.error?'导出未完成：'+payload.error:payload.cancelled?'已取消导出':`${payload.format==='pdf'?'PDF':'HTML'} 已导出`);if(!visualEditor.isOpen()&&!isComposing(view))view.focus();break;
      case 'inputSource':$('input-source').textContent=payload.name;$('input-source').title=payload.id;break;
      case 'load':if(payload.tabID&&payload.tabID!==activeTabID&&isComposing(view)){deferredTabLoad=payload;break;}loadDocument(payload);break;
      case 'saved':
        if(payload.documentKey&&documentKey!==payload.documentKey){positions.record();documentKey=payload.documentKey;positions.queue();}
        if(payload.imageBase)view.dispatch({effects:setImageBase.of(payload.imageBase)});
        hasPath=true;filename=payload.name;$('filename').textContent=filename;$('current-document').textContent=filename;
        if(savingSources.has(payload.revision))savedRaw=savingSources.get(payload.revision);else if(payload.revision===revision)savedRaw=currentRaw();
        savingSources.delete(payload.revision);if(payload.revision===revision){conflicted=false;$('notice').hidden=true;}
        if(currentRaw()===savedRaw&&!conflicted){$('save-status').textContent='已保存';send('clean',{revision});}else scheduleSave();
        break;
      case 'conflict':$('save-status').textContent='发现外部更改';showNotice('磁盘上的文件已更新。你的编辑已保留，可逐段比较合并，或另存副本。',true);break;
      case 'error':$('save-status').textContent='操作未完成';showNotice(payload.message);break;
      case 'action':
        if(payload.action==='prepareQuit'){if(isComposing(view)){send('quitDeferred');break;}closing=true;stashTab();clearTimeout(autosaveTimer);clearTimeout(draftTimer);send('quitReady');break;}
        if(payload.action==='closeCancelled'){closing=false;closingTabID=null;scheduleSave();break;}
        if(payload.action==='closeTab')closeTab();
        if(payload.action==='previousTab')cycleTab(-1);
        if(payload.action==='nextTab')cycleTab(1);
        if(payload.action==='focusEditor'){view.focus();break;}
        if(isComposing(view)&&!['save','saveAs'].includes(payload.action))break;
        if(payload.action==='save')save(false,payload.extra||{});
        if(payload.action==='saveAs')save(true);
        if(payload.action==='exportPDF')exportDocument('pdf');
        if(payload.action==='exportHTML')exportDocument('html');
        if(payload.action==='undo')undo(view);
        if(payload.action==='redo')redo(view);
        if(payload.action==='preferences')preferences.open();
        if(payload.action==='openLink')openLink();
        if(payload.action==='navigateBack')navigateHistory('back');
        if(payload.action==='navigateForward')navigateHistory('forward');
        if(payload.action==='navigateAnchor')jumpAnchor(payload.fragment);
        if(payload.action==='tableTools')showTableTools();
        if(payload.action==='compareDisk')compareDisk();
        if(payload.action==='versions')showVersions();
        if(payload.action==='reading')setReading(!reading);
        if(payload.action==='statistics')documentStats.open();
        if(payload.action==='resources')resourceManager.open();
        if(payload.action==='importAttachment')importAttachment();
        if(payload.action==='importImage')insertLocalImage();
        if(payload.action==='toggleTask')toggleCurrentTask(view);
        if(payload.action==='goTo')showGoTo();
        if(payload.action==='navigateLine')navigateLine(payload.line,payload.column);
        if(payload.action==='workspaceSearch')showWorkspaceSearch();
        if(payload.action==='commands')showCommands();
        if(payload.action==='quickOpen')showQuickOpen();
        if(payload.action==='find')openSearchPanel(view);
        if(payload.action==='source')setMode(!sourceMode);
        if(payload.action==='sidebar')toggleSidebar();
        if(payload.action==='outline')floatingOutline.open();
        if(payload.action==='format')format(payload.name);
        if(payload.action==='focus')toggleFocus();
        if(payload.action==='appearance')$('appearance').hidden=!$('appearance').hidden;
        break;
    }
  },
  snapshot(){return {raw:currentRaw(),text:view.state.doc.toString(),revision,composing,theme:chosenTheme().id,sourceMode,reading,selection:view.state.selection.toJSON(),metadata:view.state.field(sourceField)};},
};

function browserCommand(command,payload){
  if(command==='openDocumentLink'){if(payload.reference?.startsWith('#'))jumpAnchor(payload.reference);else showNotice('本地文稿链接请在 Mac 应用中使用。');}
  if(command==='compareDisk')window.mokune.receive({type:'documentData',id:payload.id,error:'磁盘比较请在 Mac 应用中使用。'});
  if(command==='versions')window.mokune.receive({type:'documentData',id:payload.id,error:'版本历史请在 Mac 应用中使用。'});
  if(command==='importImageData')window.mokune.receive({type:'imageImported',id:payload.id,error:'图片粘贴与拖放请在 Mac 应用中使用。'});
  if(command==='importLocalImage')window.mokune.receive({type:'imageImported',id:payload.id,error:'本地图片导入请在 Mac 应用中使用。'});
  if(command==='searchWorkspace')window.mokune.receive({type:'workspaceSearchResults',id:payload.id,error:'文件夹搜索请在 Mac 应用中使用。'});
  if(command==='queryWorkspaceFiles')window.mokune.receive({type:'workspaceFiles',id:payload.id,error:'文件夹查找请在 Mac 应用中使用。'});
  if(command==='openFolder')fileTree.error('文件夹目录树请在 Mac 应用中打开。');
  if(command==='closeFolder')fileTree.setWorkspace({token:null});
  if(command==='open')$('browser-file').click();
  if(command==='new'&&(!view||currentRaw()===savedRaw||confirm('当前编辑还未保存，确定新建文稿吗？')))loadDocument({raw:'',name:'未命名.md'});
  if(command==='save'||command==='saveAs'){
    const blob=new Blob([new TextEncoder().encode(payload.raw)],{type:'text/markdown;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);savedRaw=payload.raw;$('save-status').textContent='已导出副本';
  }
}
$('browser-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{const bytes=await file.arrayBuffer();const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);if(currentRaw()!==savedRaw&&!confirm('当前编辑还未保存，确定打开其他文稿吗？'))return;loadDocument({raw,name:file.name});}catch{showNotice('此文件不是有效的 UTF-8 文本，未进行自动转码。');}event.target.value='';};
addEventListener('pagehide',()=>positions.record());
applyTheme();applyEditorPreferences();
if(native)send('ready');else{$('preview-label').textContent='浏览器预览 · ⌘S 导出副本';loadDocument({raw:welcome,name:'写作札记.md'});}
