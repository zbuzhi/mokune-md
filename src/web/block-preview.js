import MarkdownIt from 'markdown-it';
import {imageAttributes,imageStyle,imageAttributePlugin} from './image-properties.mjs';
import {documentExtensions,extensionRanges} from './extended-markdown.mjs';
import {StateEffect, StateField} from '@codemirror/state';
import {Decoration, EditorView, WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isComposing, compositionState, setComposing} from './composition.js';
import {tableModel, imageLocation} from './preview-model.mjs';
import {cellModel} from './visual-model.mjs';
import {tableOperation} from './table-tools.mjs';
import {copyTableTSV} from './table-transfer.mjs';
import {attachTableSelection,tableSelectionLifecycle} from './table-selection.js';
import {isolateHistory} from '@codemirror/commands';

let showTableTools,visualTools={};
let tableMenu;
function contextMenu(view,position,row,column,event){
 event.preventDefault();event.stopPropagation();if(isComposing(view)||visualTools.finishInline?.()===false)return;
 tableMenu?.remove();const menu=document.createElement('div');tableMenu=menu;menu.className='table-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','表格行列操作');
 const before=view.state.doc,model=cellModel(before.toString(),position,row,column);if(!model)return;const at=model.cell?.from??model.lineFrom;
 const actions=[['上方插入行','rowBefore'],['下方插入行','rowAfter'],['左侧插入列','columnBefore'],['右侧插入列','columnAfter'],['删除当前行','deleteRow'],['删除当前列','deleteColumn'],['当前列左对齐','left'],['当前列居中','center'],['当前列右对齐','right']];
 const close=()=>{menu.remove();if(tableMenu===menu)tableMenu=null;document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',close);};const outside=e=>{if(!menu.contains(e.target))close();};
 for(const [title,operation] of actions){const item=button(title,()=>{if(view.state.doc!==before||view.state.readOnly||isComposing(view)){close();return;}try{const changes=tableOperation(before.toString(),at,operation);close();if(changes)view.dispatch({changes,annotations:isolateHistory.of('full')});view.focus();}catch(error){menu.querySelector('[role=status]').textContent=error.message;}});item.setAttribute('role','menuitem');item.disabled=view.state.readOnly||operation==='deleteRow'&&row===0||operation==='deleteColumn'&&model.width===1;menu.append(item);}
 const copy=button('复制表格到 Excel / Numbers',async()=>{if(view.state.doc!==before||isComposing(view)){close();return;}try{const text=copyTableTSV(before.toString(),at);if(text==null)throw new Error('未找到当前表格。');await visualTools.copyText?.(text);close();view.focus();}catch(error){if(menu.isConnected)status.textContent=error.message;}});copy.setAttribute('role','menuitem');menu.append(copy);
 const selection=event.target.closest('.md-table-preview')?.__tableSelection;
 if(selection?.contains(row,column)){
  const bounds=selection.range(),rows=bounds.bottom-bounds.top+1,columns=bounds.right-bounds.left+1;
  for(const [title,operation]of [[`复制选区（${rows} × ${columns}）`,'copy'],['清空选区内容','clear'],[`删除选区所在 ${rows} 行`,'deleteRows'],[`删除选区所在 ${columns} 列`,'deleteColumns']]){
   const item=button(title,()=>{if(view.state.doc!==before||isComposing(view)){close();return;}if(operation==='copy')selection.copy();else selection.run(operation);close();});item.setAttribute('role','menuitem');item.disabled=operation!=='copy'&&(view.state.readOnly||operation==='deleteRows'&&bounds.top===0||operation==='deleteColumns'&&columns===model.width);menu.append(item);
  }
 }
 const status=document.createElement('p');status.setAttribute('role','status');menu.append(status);document.body.append(menu);const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-r.width-8,event.clientX))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-r.height-8,event.clientY))+'px';
 document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',close,{once:true});menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();view.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}};menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
export function configureVisualTools(callbacks){visualTools=callbacks;}
export function configureTableTools(callback){showTableTools=callback;}
export const setImageBase = StateEffect.define();
export const allowRemote = StateEffect.define();
const imageBase = StateField.define({create:()=>'',update:(value,tr)=>{for(const e of tr.effects)if(e.is(setImageBase))value=e.value;return value;}});
const remotePermission = StateField.define({create:()=>new Set(),update:(value,tr)=>{for(const e of tr.effects)if(e.is(allowRemote))value=new Set([...value,e.value]);return value;}});
export const previewConfiguration = [imageBase,remotePermission,tableSelectionLifecycle];
export function previewAssets(state){return {imageBase:state.field(imageBase),permissions:[...state.field(remotePermission)]};}

function editSource(view, from) {
  if(isComposing(view))return;
  if(visualTools.source){visualTools.source(view,from);return;}
  view.dispatch({selection:{anchor:Math.min(from,view.state.doc.length)},effects:EditorView.scrollIntoView(from,{y:'nearest'})});
  view.focus();
}
function button(label, action) {
  const el=document.createElement('button');el.type='button';el.textContent=label;
  el.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();action();});return el;
}
const inlineParser=new MarkdownIt({html:false,linkify:true,typographer:false}).use(imageAttributePlugin);
inlineParser.linkify.set({fuzzyLink:true});
function inline(parent,text,view) {
  const {imageBase:base,permissions}=previewAssets(view.state);
  inlineParser.renderer.rules.image=(tokens,index)=>{
    const token=tokens[index],location=imageLocation(token.attrGet('src')||'',base),escape=inlineParser.utils.escapeHtml;
    if(location.kind==='remote'&&!permissions.includes(location.url))return `<button data-cell-image="${escape(location.url)}">加载远程图片</button>`;
    if(!['local','remote'].includes(location.kind))return escape(token.content)+'（图片路径不可用）';
    return `<img src="${escape(location.url)}" alt="${escape(token.content)}" title="${escape(token.attrGet('title')||'')}" style="${imageStyle(token.meta?.dimensions)}" referrerpolicy="no-referrer">`;
  };
  parent.innerHTML=inlineParser.renderInline(text.replace(/\\\|/g,'|'));
  for(const link of parent.querySelectorAll('a'))link.rel='noreferrer noopener';
  for(const control of parent.querySelectorAll('[data-cell-image]'))control.onclick=event=>{event.preventDefault();event.stopPropagation();if(!isComposing(view))view.dispatch({effects:allowRemote.of(control.dataset.cellImage)});};
}
class TablePreview extends WidgetType {
  constructor(text, from, active, readOnly,assets) {super();Object.assign(this,{text,from,active,readOnly,assets});}
  eq(other){return this.text===other.text&&this.from===other.from&&this.active===other.active&&this.readOnly===other.readOnly&&this.assets===other.assets;}
  toDOM(view) {
    const model=tableModel(this.text,this.from),container=document.createElement('section');
    container.className='md-table-preview';container.contentEditable='false';container.setAttribute('aria-label','表格即时预览');container.dataset.tableFrom=this.from;
    const scroller=document.createElement('div');scroller.className='preview-table-scroll';
    const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');
    const row=(cells,heading,rowIndex)=>{
      const tr=document.createElement('tr');cells.forEach((cell,i)=>{
        const td=document.createElement(heading?'th':'td');td.style.textAlign=model.align[i]||'left';const content=document.createElement('span');content.className='cell-display';inline(content,cell.text,view);td.append(content);
        const editCell=button('',()=>visualTools.cell?.(view,this.from,rowIndex,i,td));editCell.innerHTML='<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 13l-1 4 4-1L16 7l-3-3zM11 6l3 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';editCell.className='cell-edit-button';editCell.setAttribute('aria-label',`编辑${heading?'表头':`第 ${rowIndex} 行`}第 ${i+1} 列`);editCell.disabled=this.readOnly;td.append(editCell);
        td.dataset.row=rowIndex;td.dataset.column=i;td.tabIndex=0;td.title='点击编辑 · 拖拽选择区域 · ⇧点击或方向键扩选 · ⌥点击源码';
        
        td.addEventListener('click',event=>{if(event.target.closest('a,button'))return;event.preventDefault();if(event.altKey||this.readOnly)editSource(view,cell.from);else visualTools.inlineCell?.(view,this.from,rowIndex,i,td,{x:event.clientX,y:event.clientY});});
        td.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();visualTools.inlineCell?.(view,this.from,rowIndex,i,td);}});td.addEventListener('contextmenu',event=>contextMenu(view,this.from,rowIndex,i,event));tr.append(td);
      });return tr;
    };
    head.append(row(model.header,true,0));model.rows.forEach((cells,index)=>body.append(row(cells,false,index+1)));table.append(head,body);scroller.append(table);container.append(scroller);
    if(model.truncated){const note=document.createElement('p');note.className='preview-note';note.textContent='预览前 100 行，完整内容保留在源码中。';container.append(note);}
    attachTableSelection(container,view,this.from,visualTools);return container;
  }
  destroy(dom){dom.__tableSelection?.destroy();}
  ignoreEvent(){return true;}
  get estimatedHeight(){return Math.min(this.text.split('\n').length,102)*36+36;}
}
class ImagePreview extends WidgetType {
  constructor(reference, alt, title, from, base, permission, dimensions,readOnly) {super();Object.assign(this,{reference,alt,title,from,base,permission,dimensions,readOnly});}
  eq(other){return ['reference','alt','title','from','base','permission','readOnly'].every(k=>this[k]===other[k])&&JSON.stringify(this.dimensions)===JSON.stringify(other.dimensions);}
  toDOM(view) {
    const root=document.createElement('figure');root.className='md-image-preview';root.contentEditable='false';root.setAttribute('aria-label','图片即时预览');
    const frame=document.createElement('div');frame.className='preview-image-frame';frame.style.textAlign=this.dimensions.align||'center';
    const location=imageLocation(this.reference,this.base);
    if(location.kind==='local'||location.kind==='remote'&&this.permission) {
      const image=document.createElement('img');image.alt=this.alt;image.title=this.title;image.referrerPolicy='no-referrer';image.loading='lazy';image.decoding='async';image.style.cssText=imageStyle(this.dimensions);if(this.dimensions.height)image.style.height=this.dimensions.height;else image.style.height='auto';if(!this.dimensions.width)image.style.width='auto';
      image.addEventListener('load',()=>{if(root.isConnected)view.requestMeasure();});
      image.addEventListener('error',()=>{image.hidden=true;frame.classList.add('image-unavailable');const note=document.createElement('span');note.textContent='图片无法显示，请检查路径、格式或文件权限。';frame.append(note);if(root.isConnected)view.requestMeasure();},{once:true});
      image.src=location.url;const wrap=document.createElement('span');wrap.className='preview-image-wrap';wrap.append(image);frame.append(wrap);
      root.addEventListener('contextmenu',event=>{
       event.preventDefault();event.stopPropagation();if(isComposing(view)||visualTools.finishInline?.()===false)return;tableMenu?.remove();const menu=document.createElement('div');menu.className='table-context-menu image-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','图片操作');tableMenu=menu;
       const close=()=>{menu.remove();document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',close);document.removeEventListener('wheel',outside,true);if(tableMenu===menu)tableMenu=null;},outside=e=>{if(!menu.contains(e.target))close();};
       for(const [title,run,disabled] of [['图片设置',()=>visualTools.image?.(view,this.from),this.readOnly],['编辑图片源码',()=>editSource(view,this.from),false]]){const item=button(title,()=>{close();run();});item.setAttribute('role','menuitem');item.disabled=disabled;menu.append(item);}
       document.body.append(menu);const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-r.width-8,event.clientX))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-r.height-8,event.clientY))+'px';document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',close,{once:true});document.addEventListener('wheel',outside,{capture:true,passive:true});menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();view.focus();}};menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
      });
      if(!this.readOnly){
       const toolbar=document.createElement('div');toolbar.className='image-align-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','图片对齐');
       for(const [align,label] of [['left','图片左对齐'],['center','图片居中'],['right','图片右对齐']]){
        const item=button('',()=>{if(isComposing(view)||visualTools.finishInline?.()===false)return;visualTools.align?.(view,this.from,align,view.state.doc);});item.setAttribute('aria-label',label);item.title=label;item.setAttribute('aria-pressed',String((this.dimensions.align||'center')===align));
        const x=align==='left'?4:align==='right'?10:7;item.innerHTML=`<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3h14M3 17h14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><rect x="${x}" y="6" width="6" height="8" rx="1" fill="currentColor"/></svg>`;item.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};toolbar.append(item);
       }
       wrap.append(toolbar);
      }
      if(!this.readOnly)for(const direction of ['n','ne','e','se','s','sw','w','nw']){
       const handle=document.createElement('button');handle.className='image-resize-handle resize-'+direction;handle.dataset.direction=direction;handle.setAttribute('aria-label',direction==='se'?'拖动调整图片大小':'拖动调整图片 '+direction);handle.title='拖动调整宽高 · 角拖动保持比例，⇧自由尺寸';wrap.append(handle);
       handle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
       handle.addEventListener('pointerdown',event=>{
        if(event.button!==0||isComposing(view)||visualTools.finishInline?.()===false)return;event.preventDefault();event.stopPropagation();const doc=view.state.doc,startX=event.clientX,startY=event.clientY,box=image.getBoundingClientRect(),width=box.width,height=box.height,ratio=width/Math.max(height,1),previous=image.style.cssText,max=Math.max(32,frame.clientWidth);let next={width,height};visualTools.resizeStart?.();handle.setPointerCapture(event.pointerId);
        const move=e=>{let w=width,h=height;if(/[ew]/.test(direction))w=width+(e.clientX-startX)*(direction.includes('w')?-1:1);if(/[ns]/.test(direction))h=height+(e.clientY-startY)*(direction.includes('n')?-1:1);if(!e.shiftKey){if(direction==='n'||direction==='s')w=h*ratio;else if(direction.length===2){const factor=Math.abs((w-width)/width)>Math.abs((h-height)/height)?w/width:h/height;w=width*factor;h=height*factor;}else h=w/ratio;}const factor=Math.min(1,max/Math.max(w,1),8192/Math.max(h,1));next={width:Math.max(24,w*factor),height:Math.max(24,h*factor)};image.style.width=next.width+'px';image.style.height=next.height+'px';view.requestMeasure();};
        const finish=e=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);handle.removeEventListener('lostpointercapture',finish);window.removeEventListener('blur',abort);window.removeEventListener('keydown',cancelKey,true);if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);try{if(e.type==='pointerup'&&(Math.abs(next.width-width)>=2||Math.abs(next.height-height)>=2))visualTools.resize?.(view,this.from,next,doc);else{image.style.cssText=previous;view.requestMeasure();}}finally{visualTools.resizeEnd?.();}};const abort=()=>finish({type:'pointercancel'}),cancelKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);window.addEventListener('blur',abort,{once:true});window.addEventListener('keydown',cancelKey,true);
       });
      }
    } else if(location.kind==='remote') {
      const text=document.createElement('p');text.textContent=`远程图片 · ${location.host}`;
      frame.append(text,button('加载这张图片',()=>view.dispatch({effects:allowRemote.of(location.url)})));
    } else {
      const text=document.createElement('p');text.textContent=location.kind==='unsaved'?'先保存文稿，再预览相对路径图片。':'此图片地址暂不支持预览。';frame.append(text);
    }
    root.append(frame);return root;
  }
  ignoreEvent(){return true;}
  get estimatedHeight(){return 320;}
}

function build(state) {
  const raw=state.doc.toString();if(!raw.includes('|')&&!raw.includes('!['))return Decoration.none;
  const masked=extensionRanges(documentExtensions(state.doc));
  const ranges=[],base=state.field(imageBase),permissions=state.field(remotePermission);
  const references=new Map(),normalize=label=>label.trim().replace(/\s+/g,' ').toLowerCase();
  syntaxTree(state).iterate({enter(node){
    if(masked.some(r=>node.from>=r.from&&node.from<=r.to))return false;
    if(node.name==='LinkReference') {
      const label=node.node.getChild('LinkLabel'),url=node.node.getChild('URL'),title=node.node.getChild('LinkTitle');
      if(label&&url)references.set(normalize(state.sliceDoc(label.from+1,label.to-1)),{reference:state.sliceDoc(url.from,url.to),title:title?state.sliceDoc(title.from+1,title.to-1):''});
      return false;
    }
    if(node.name==='FencedCode'||node.name==='CodeBlock')return false;
  }});
  const selected=(from,to)=>state.selection.ranges.some(r=>r.from<=to&&r.to>=from);
  syntaxTree(state).iterate({enter(node){
    if(masked.some(r=>node.from>=r.from&&node.from<=r.to))return false;
    if(node.name==='FencedCode'||node.name==='CodeBlock')return false;
    if(node.name==='Table') {
      const active=false,text=state.sliceDoc(node.from,node.to),widget=new TablePreview(text,node.from,active,state.readOnly,JSON.stringify(previewAssets(state)));
      ranges.push(Decoration.replace({widget,block:true}).range(node.from,node.to));
      return false;
    }
    if(node.name==='Image') {
      const url=node.node.getChild('URL'),label=node.node.getChild('LinkLabel');
      const dimensions=imageAttributes(raw,node.to)||{},imageEnd=dimensions.to??node.to;
      const source=state.sliceDoc(node.from,imageEnd),closing=node.node.getChildren('LinkMark')[1];
      const alt=closing?state.sliceDoc(node.from+2,closing.from):'',titleNode=node.node.getChild('LinkTitle');
      const resolved=references.get(normalize(label?state.sliceDoc(label.from+1,label.to-1)||alt:alt));
      const reference=url?state.sliceDoc(url.from,url.to):resolved?.reference;if(!reference)return false;
      const title=titleNode?state.sliceDoc(titleNode.from+1,titleNode.to-1):resolved?.title||'';
      const line=state.doc.lineAt(node.from);if(line.number!==state.doc.lineAt(node.to).number)return false;
      const location=imageLocation(reference,base),widget=new ImagePreview(reference,inlineParser.utils.unescapeAll(alt),inlineParser.utils.unescapeAll(title),node.from,base,permissions.has(location.url),dimensions,state.readOnly);
      if(line.text.trim()===source.trim()) ranges.push(Decoration.replace({widget,block:true}).range(line.from,line.to));
      else ranges.push(Decoration.widget({widget,block:true,side:1}).range(line.to));
      return false;
    }
  }});
  return Decoration.set(ranges,true);
}
export const blockPreview=StateField.define({
  create:state=>build(state),
  update(value,tr){
    if(tr.state.field(compositionState,false)===true)return value.map(tr.changes);
    if(tr.startState.readOnly!==tr.state.readOnly||tr.docChanged||tr.selection||syntaxTree(tr.startState)!==syntaxTree(tr.state)||tr.effects.some(e=>e.is(setComposing)||e.is(setImageBase)||e.is(allowRemote)))return build(tr.state);
    return value;
  },
  provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))]
});
