import MarkdownIt from 'markdown-it';
import {StateField,StateEffect,EditorSelection} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,ViewPlugin} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {compositionState,setComposing,isComposing} from './composition.js';
import {documentExtensions,extensionRanges} from './extended-markdown.mjs';
import {safeHTML,safeInlineHTML} from './html-preview.js';
import {previewAssets,setImageBase,allowRemote} from './block-preview.js';
import {imageLocation} from './preview-model.mjs';
const pointerLockEffect=StateEffect.define();
const pointerLock=StateField.define({create:()=>false,update(value,tr){for(const effect of tr.effects)if(effect.is(pointerLockEffect))value=effect.value;return value;}});
let tools={};export function configureRichPreview(value){tools=value;}
const parser=new MarkdownIt({html:true,linkify:true});parser.renderer.rules.html_inline=(tokens,i)=>safeInlineHTML(tokens[i].content);parser.renderer.rules.html_block=(tokens,i)=>safeHTML(tokens[i].content);
parser.linkify.set({fuzzyLink:true});
class RichWidget extends WidgetType{
 constructor(source,kind,from,assets,reference){super();Object.assign(this,{source,kind,from,assets,reference});}
 eq(other){return this.source===other.source&&this.kind===other.kind&&this.from===other.from&&this.assets===other.assets&&this.reference===other.reference;}
 toDOM(view){
  const root=document.createElement(this.kind==='link'?'span':'section');root.className='md-rich-preview md-rich-'+this.kind;root.contentEditable='false';
  if(this.kind==='hr'){root.setAttribute('aria-label','分隔线');root.append(document.createElement('hr'));return root;}
  const content=document.createElement(this.kind==='link'?'span':'div');content.innerHTML=this.kind==='html'?safeHTML(this.source):parser.renderInline(this.source);root.append(content);
  if(this.kind==='link'&&!content.querySelector('a')&&this.reference&&parser.validateLink(this.reference)){const a=document.createElement('a');a.href=this.reference;const label=this.source.match(/^\[([^\]]*)\]/)?.[1]||this.source;content.replaceChildren(a);a.innerHTML=parser.renderInline(label);}
  for(const a of root.querySelectorAll('a'))a.onclick=event=>{event.preventDefault();event.stopPropagation();if(isComposing(view))return;if(event.altKey)tools.edit?.(this.from);else tools.link?.(a.getAttribute('href'));};
  for(const image of root.querySelectorAll('img')){
   const {imageBase,permissions}=previewAssets(view.state),location=imageLocation(image.dataset.htmlSrc||image.getAttribute('src')||'',imageBase);delete image.dataset.htmlSrc;
   if(location.kind==='local'||location.kind==='remote'&&permissions.includes(location.url)){image.referrerPolicy='no-referrer';image.src=location.url;image.onload=()=>view.requestMeasure();}
   else if(location.kind==='remote'){const button=document.createElement('button');button.textContent='加载远程图片';button.onclick=()=>view.dispatch({effects:allowRemote.of(location.url)});image.replaceWith(button);}else image.remove();
  }
  if(this.kind!=='link'){const edit=document.createElement('button');edit.className='rich-source-button';edit.textContent='HTML 源码';edit.onclick=()=>{if(!isComposing(view))tools.edit?.(this.from);};root.append(edit);}
  return root;
 }
 ignoreEvent(){return true;}
}
function build(state){
 const model=documentExtensions(state.doc),ranges=[],excluded=extensionRanges(model),assets=JSON.stringify(previewAssets(state)),references=new Map(),normalize=value=>value.trim().replace(/\s+/g,' ').toLowerCase();
 syntaxTree(state).iterate({enter(node){if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;if(node.name==='LinkReference'){const label=node.node.getChild('LinkLabel'),url=node.node.getChild('URL');if(label&&url)references.set(normalize(state.sliceDoc(label.from+1,label.to-1)),state.sliceDoc(url.from,url.to));return false;}}});
 syntaxTree(state).iterate({enter(node){
  if(excluded.some(r=>node.from>=r.from&&node.from<=r.to))return false;
  if(['FencedCode','CodeBlock','Image','Table','LinkReference'].includes(node.name))return false;
  if(node.name==='URL'&&['Paragraph','Task'].includes(node.node.parent?.name)){
   const source=state.sliceDoc(node.from,node.to),matches=parser.linkify.match(source),reference=matches?.find(match=>match.index===0&&match.lastIndex===source.length)?.url;
   if(reference&&parser.validateLink(reference))ranges.push(Decoration.mark({class:'md-editable-link',attributes:{'data-editable-link':'true','data-link-reference':reference,title:'⌘点击打开链接'}}).range(node.from,node.to));
   return false;
  }
  if(node.name==='Paragraph'){
   const stack=[];
   for(const tag of node.node.getChildren('HTMLTag')){
    const source=state.sliceDoc(tag.from,tag.to),open=source.match(/^<(span|strong|b|em|i|u|s|del|mark|small|sub|sup|code)\b[^>]*>$/i),close=source.match(/^<\/(\w+)>$/);
    if(open){const holder=document.createElement('div');holder.innerHTML=safeHTML(source);const element=holder.firstElementChild;stack.push({tag:open[1].toLowerCase(),from:tag.to,style:element?.getAttribute('style')||''});}
    else if(close){const index=stack.findLastIndex(entry=>entry.tag===close[1].toLowerCase());if(index<0)continue;const entry=stack.splice(index,1)[0],styles={strong:'font-weight:600',b:'font-weight:600',em:'font-style:italic',i:'font-style:italic',u:'text-decoration:underline',s:'text-decoration:line-through',del:'text-decoration:line-through',mark:'background:var(--selection)',small:'font-size:.85em',sub:'vertical-align:sub;font-size:.8em',sup:'vertical-align:super;font-size:.8em',code:'font-family:ui-monospace,monospace'};if(tag.from>entry.from)ranges.push(Decoration.mark({class:'md-html-inline',attributes:{style:[styles[entry.tag]||'',entry.style].filter(Boolean).join(';')}}).range(entry.from,tag.from));}
   }
  }
  let kind=node.name==='HorizontalRule'?'hr':node.name==='HTMLBlock'?'html':node.name==='Link'||node.name==='Autolink'?'link':null;

  if(node.name==='HTMLTag'){const cursor=state.selection.main;if(!cursor.empty||cursor.head<node.from||cursor.head>node.to)ranges.push(Decoration.replace({}).range(node.from,node.to));return false;}
  if(kind==='link'){
   if(model.callouts.some(c=>state.doc.lineAt(node.from).number===c.startLine+1)&&/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i.test(state.sliceDoc(node.from,node.to)))return false;
   const cursor=state.selection.main;if(cursor.empty&&cursor.head>=node.from&&cursor.head<=node.to)return false;
   const marks=node.node.getChildren('LinkMark'),isAuto=node.name==='Autolink',from=isAuto?node.from+1:marks[0]?.to,to=isAuto?node.to-1:marks[1]?.from;
   if(from==null||to==null||to<from)return false;
   const url=node.node.getChild('URL'),label=node.node.getChild('LinkLabel'),reference=url?state.sliceDoc(url.from,url.to):references.get(normalize(label?state.sliceDoc(label.from+1,label.to-1):state.sliceDoc(from,to)));
   // Lezer recognizes unresolved shortcut references as Link nodes too. They
   // remain literal Markdown, including alert labels and unknown [!TYPES].
   if(!reference&&!state.sliceDoc(to,node.to).startsWith('](')){ranges.push(Decoration.mark({class:'md-unresolved-link'}).range(node.from,node.to));return false;}
   if(from>node.from)ranges.push(Decoration.replace({}).range(node.from,from));
   if(to>from)ranges.push(Decoration.mark({class:'md-editable-link',attributes:{'data-editable-link':'true','data-link-reference':reference||'','title':'点击编辑链接 · ⌘点击打开'}}).range(from,to));
   if(node.to>to)ranges.push(Decoration.replace({}).range(to,node.to));return false;
  }

  if(!kind)return;
  const source=state.sliceDoc(node.from,node.to),label=node.node.getChild('LinkLabel'),reference=kind==='link'?references.get(normalize(label?state.sliceDoc(label.from+1,label.to-1):source.match(/^\[([^\]]*)\]/)?.[1]||'')):null,widget=new RichWidget(source,kind,node.from,assets,reference);
  ranges.push(Decoration.replace({widget,block:kind!=='link'}).range(node.from,node.to));return false;
 }});return Decoration.set(ranges,true);
}
function editingSpan(state){const cursor=state.selection.main;if(!cursor.empty)return '';for(const bias of [1,-1]){let node=syntaxTree(state).resolveInner(cursor.head,bias);while(node){if(['Link','Autolink','HTMLTag'].includes(node.name))return node.from+':'+node.to;node=node.parent;}}return '';}
const richDecorations=StateField.define({create:build,update(value,tr){if(tr.state.field(compositionState,false)||tr.state.field(pointerLock))return value.map(tr.changes);if(tr.docChanged||tr.selection&&editingSpan(tr.startState)!==editingSpan(tr.state)||syntaxTree(tr.startState)!==syntaxTree(tr.state)||tr.effects.some(e=>e.is(setComposing)||e.is(setImageBase)||e.is(allowRemote)||e.is(pointerLockEffect)))return build(tr.state);return value.map(tr.changes);},provide:field=>EditorView.decorations.from(field)});
// Resolve visible text against the browser's current DOM, rather than the
// editor's height estimates. Large image widgets may have changed height since
// the previous measure, which otherwise maps a paragraph click to its end or
// the next line. Widget/control clicks keep their own handlers.
function textAtPoint(view,event){
 const doc=view.contentDOM.ownerDocument,hit=doc.elementFromPoint(event.clientX,event.clientY),line=hit?.closest('.cm-line');
 if(!line||!view.contentDOM.contains(line)||hit.closest('button,input,textarea,[contenteditable="false"]'))return null;
 const point=doc.caretPositionFromPoint?.(event.clientX,event.clientY),range=point?null:doc.caretRangeFromPoint?.(event.clientX,event.clientY),node=point?.offsetNode||range?.startContainer,offset=point?.offset??range?.startOffset;
 if(!node||!view.contentDOM.contains(node)||(node.nodeType===3?node.parentElement:node).closest?.('.cm-line')!==line)return null;
 try{return view.posAtDOM(node,offset);}catch{return null;}
}
const visibleTextSelection=EditorView.mouseSelectionStyle.of((view,event)=>{
 if(event.button!==0||event.detail!==1||event.altKey||isComposing(view))return null;
 let anchor=textAtPoint(view,event),initial=view.state.selection;if(anchor==null)return null;
 const x=event.clientX,y=event.clientY;
 return {
  get(current,extend,multiple){const head=current.clientX===x&&current.clientY===y?anchor:textAtPoint(view,current)??view.posAtCoords({x:current.clientX,y:current.clientY},false)??anchor,range=EditorSelection.range(extend?initial.main.anchor:anchor,head);return multiple?initial.addRange(range):EditorSelection.create([range]);},
  update(update){if(update.docChanged){anchor=update.changes.mapPos(anchor);initial=initial.map(update.changes);}}
 };
});
const pointerSelection=ViewPlugin.fromClass(class{
 constructor(view){this.view=view;this.cleanup=null;this.releaseFrame=0;this.releaseTimer=0;this.alive=true;if(view.state.field(pointerLock))queueMicrotask(()=>{if(this.alive&&view.dom.isConnected)view.dispatch({effects:pointerLockEffect.of(false)});});}
 start(event){
  const view=this.view;if(event.button!==0||isComposing(view))return false;const link=event.target.closest?.('[data-editable-link]');if(event.metaKey||event.ctrlKey){if(link?.dataset.linkReference){event.preventDefault();event.stopPropagation();tools.link?.(link.dataset.linkReference);return true;}return false;}
  cancelAnimationFrame(this.releaseFrame);clearTimeout(this.releaseTimer);this.releaseFrame=0;this.releaseTimer=0;this.cleanup?.();
  view.dispatch({effects:pointerLockEffect.of(true)});
  // pointerup precedes mouseup. CodeMirror may still place a caret in its
  // mouseup handler (notably when clicking inside an existing selection).
  // Keep the old geometry until that handler and native selection settle.
  // Occluded WebKit windows may suspend animation frames, so a later timer
  // also releases the freeze; neither path can end a newer gesture.
  const finish=()=>{this.cleanup?.();this.cleanup=null;const release=()=>{cancelAnimationFrame(this.releaseFrame);clearTimeout(this.releaseTimer);this.releaseFrame=0;this.releaseTimer=0;if(this.alive&&view.dom.isConnected)view.dispatch({effects:pointerLockEffect.of(false)});};this.releaseFrame=requestAnimationFrame(release);this.releaseTimer=setTimeout(release,80);};
  this.cleanup=()=>{window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);window.removeEventListener('blur',finish);};
  window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);window.addEventListener('blur',finish);return false;
 }
 destroy(){this.alive=false;this.cleanup?.();cancelAnimationFrame(this.releaseFrame);clearTimeout(this.releaseTimer);}
},{eventHandlers:{pointerdown(event){return this.start(event);}}});
export const richPreview=[pointerLock,richDecorations,pointerSelection,visibleTextSelection];
