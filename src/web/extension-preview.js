import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import {compositionState,isComposing,setComposing} from './composition.js';
import {documentExtensions,metadataHTML} from './extended-markdown.mjs';
import {previewAssets,allowRemote} from './block-preview.js';
import {renderScientific} from './scientific-preview.js';
import {loadExportEngine,highlightCode} from './export-client.js';
import {restoreEditorFocus} from './editor-focus.js';
let getTheme=()=>({});
export function configureExtendedPreview(callback){getTheme=callback;}
function edit(view,from){if(isComposing(view))return;view.dispatch({selection:{anchor:from},effects:EditorView.scrollIntoView(from,{y:'center'})});restoreEditorFocus(view);}
class Metadata extends WidgetType {
  constructor(meta){super();this.meta=meta;}
  eq(other){return JSON.stringify(this.meta)===JSON.stringify(other.meta);}
  toDOM(view){const root=document.createElement('div');root.className='md-metadata-preview';root.contentEditable='false';root.innerHTML=metadataHTML(this.meta);const button=document.createElement('button');button.className='metadata-edit';button.textContent='编辑信息';button.onclick=()=>edit(view,Math.min(4,this.meta.to));root.firstChild.append(button);return root;}
  ignoreEvent(){return true;}
}
class Reference extends WidgetType {
  constructor(ref,definition){super();this.ref=ref;this.definition=definition;}
  eq(other){return JSON.stringify(this.ref)===JSON.stringify(other.ref)&&this.definition===other.definition;}
  toDOM(view){const button=document.createElement('button');button.className='md-footnote-reference';button.textContent=`[${this.ref.id+1}]`;button.title=`脚注 ${this.ref.label} · 点击编辑定义`;button.onclick=()=>edit(view,this.definition);return button;}
  ignoreEvent(){return true;}
}
class Notes extends WidgetType {
  constructor(snapshot,model){super();this.snapshot=snapshot;this.model=model;}
  eq(other){return JSON.stringify(this.snapshot)===JSON.stringify(other.snapshot);}
  toDOM(view){
    const root=document.createElement('section');root.className='md-footnotes-preview';root.contentEditable='false';root.setAttribute('aria-label','脚注即时预览');root.textContent='正在生成脚注…';let alive=true,timer;
    const ready=callback=>{if(!alive||!root.isConnected)return;if(isComposing(view)){timer=setTimeout(()=>ready(callback),60);return;}callback();};
    timer=setTimeout(()=>ready(()=>loadExportEngine().then(engine=>engine.renderDocument(this.snapshot,{renderScientific,highlightCode,resolveImages:async()=>[]},{notesOnly:true,preview:true})).then(article=>ready(()=>{
      root.replaceChildren(...article.childNodes);
      for(const item of root.querySelectorAll('.footnote-item')){const index=Number(item.id.replace('fn',''))-1,note=this.model.notes[index],definition=this.model.definitions.find(d=>d.label===note?.label);if(definition){const button=document.createElement('button');button.className='footnote-edit';button.textContent='编辑';button.title=`编辑脚注 ${note.label}`;button.onclick=()=>edit(view,definition.from);item.append(button);}}
      root.onclick=event=>{const remote=event.target.closest('[data-remote-image]');if(remote){event.preventDefault();if(!isComposing(view))view.dispatch({effects:allowRemote.of(remote.dataset.remoteImage)});return;}const link=event.target.closest('a');if(!link)return;const href=link.getAttribute('href');if(href?.startsWith('#fnref')){event.preventDefault();const id=Number(href.slice(6).split(':')[0])-1,sub=Number(href.split(':')[1]||0),refs=this.model.references.filter(r=>r.id===id);if(refs[sub])edit(view,refs[sub].from);}else if(href?.startsWith('#fn')){event.preventDefault();const note=this.model.notes[Number(href.slice(3))-1],def=this.model.definitions.find(d=>d.label===note?.label);if(def)edit(view,def.from);}};
      view.requestMeasure();
    }),error=>ready(()=>{root.textContent='脚注预览暂不可用：'+error.message;view.requestMeasure();}))),120);
    root.__cancel=()=>{alive=false;clearTimeout(timer);};return root;
  }
  destroy(dom){dom.__cancel?.();}
  ignoreEvent(){return true;}
  get estimatedHeight(){return this.model.notes.length*70+40;}
}
function build(state){
  const model=documentExtensions(state.doc),ranges=[],selected=(from,to)=>state.selection.ranges.some(r=>r.from<=to&&r.to>=from);
  if(model.metadata){const meta=model.metadata,widget=new Metadata(meta);ranges.push(selected(meta.from,meta.to)?Decoration.widget({widget,block:true,side:1}).range(meta.to):Decoration.replace({widget,block:true}).range(meta.from,meta.to));}
  for(const def of model.definitions)if(model.notes.some(note=>note.label===def.label)&&!selected(def.from,def.to))ranges.push(Decoration.replace({block:true}).range(def.from,def.to));
  for(const ref of model.references){if(model.definitions.some(d=>ref.from>=d.from&&ref.from<=d.to))continue;const line=state.doc.lineAt(ref.from),def=model.definitions.find(d=>d.label===ref.label);if(def&&!selected(line.from,line.to))ranges.push(Decoration.replace({widget:new Reference(ref,def.from)}).range(ref.from,ref.to));}
  if(model.notes.length)ranges.push(Decoration.widget({widget:new Notes({text:state.doc.toString(),theme:getTheme(),...previewAssets(state)},model),block:true,side:1}).range(state.doc.length));
  return Decoration.set(ranges,true);
}
export const extensionPreview=StateField.define({
  create:build,
  update(value,tr){if(tr.state.field(compositionState,false))return value.map(tr.changes);if(tr.docChanged||tr.selection||tr.effects.length)return build(tr.state);return value;},
  provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))]
});

// Metadata must not inherit the default parser's Setext heading paint in source
// mode. This mark changes appearance only and freezes with the IME guard.
export const metadataSourceStyle=StateField.define({
  create:state=>{const meta=documentExtensions(state.doc).metadata;return meta?Decoration.set([Decoration.mark({class:'md-meta-source'}).range(0,meta.to)]):Decoration.none;},
  update(value,tr){if(tr.state.field(compositionState,false))return value.map(tr.changes);if(tr.docChanged||tr.effects.some(e=>e.is(setComposing))){const meta=documentExtensions(tr.state.doc).metadata;return meta?Decoration.set([Decoration.mark({class:'md-meta-source'}).range(0,meta.to)]):Decoration.none;}return value;},
  provide:field=>EditorView.decorations.from(field)
});
