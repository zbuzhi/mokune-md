import {documentExtensions,extensionRanges} from './extended-markdown.mjs';
import {StateField,StateEffect} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {compositionState,isComposing,setComposing} from './composition.js';
import {mathSpans} from './math-model.mjs';
import {rangeIndex} from './range-index.mjs';

export const setPreviewPalette=StateEffect.define();
const defaultPalette={background:'#fbfaf7',surface:'#f1f0eb',foreground:'#30342f',accent:'#59765b',muted:'#757b73',dark:false};
const palette=StateField.define({create:()=>defaultPalette,update:(value,tr)=>{for(const effect of tr.effects)if(effect.is(setPreviewPalette))value=effect.value;return value;}});
export const scientificConfiguration=[palette];
const engines=new Map(),cache=new Map();let diagramQueue=Promise.resolve();
function engine(kind) {
  if(!engines.has(kind))engines.set(kind,(kind==='mermaid'?engine('math'):Promise.resolve()).then(()=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=kind==='mermaid'?'mermaid-engine.js':'math-engine.js';
    script.onload=()=>resolve(kind==='mermaid'?window.mokuneMermaid:window.mokuneMath);
    script.onerror=()=>{script.remove();reject(new Error('本地预览组件未能加载。'));};document.head.append(script);
  })).catch(error=>{engines.delete(kind);throw error;}));
  return engines.get(kind);
}
export function loadMathEngine(){return engine('math');}
export function renderScientific(kind,source,display,colors) {
  const key=JSON.stringify([kind,source,display,kind==='mermaid'?colors:null]);
  if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry;}
  const work=async()=>{const renderer=await engine(kind);return kind==='mermaid'?renderer.render(source,colors):renderer.render(source,display);};
  const promise=kind==='mermaid'?diagramQueue.then(work):work();
  if(kind==='mermaid')diagramQueue=promise.catch(()=>{});
  cache.set(key,promise);if(cache.size>48)cache.delete(cache.keys().next().value);
  // Cache syntax failures too: repeating a selection change must not rerender them.
  promise.catch(()=>{});return promise;
}
function edit(view,from) {
  if(isComposing(view))return;
  view.dispatch({selection:{anchor:Math.min(from,view.state.doc.length)},effects:EditorView.scrollIntoView(from,{y:'nearest'})});view.focus();
}
class ScientificPreview extends WidgetType {
  constructor(kind,source,from,editFrom,display,active,colors){super();Object.assign(this,{kind,source,from,editFrom,display,active,colors});}
  eq(other){return ['kind','source','from','editFrom','display','active'].every(k=>this[k]===other[k])&&JSON.stringify(this.colors)===JSON.stringify(other.colors);}
  toDOM(view) {
    const inline=!this.display&&!this.active,root=document.createElement(inline?'span':'section');
    root.className=inline?'md-math-inline':'md-scientific-preview';root.dataset.kind=this.kind;root.contentEditable='false';root.setAttribute('aria-label',this.kind==='mermaid'?'Mermaid 即时预览':inline?'行内公式即时预览':'公式即时预览');
    if(inline){root.tabIndex=0;root.title='点击编辑公式源码';root.addEventListener('click',()=>edit(view,this.editFrom));root.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();edit(view,this.editFrom);}});}
    else {
      const bar=document.createElement('div');bar.className='preview-toolbar';
      const label=document.createElement('span');label.textContent=this.kind==='mermaid'?'MERMAID':this.display?'公式':'行内公式';
      const button=document.createElement('button');button.type='button';button.textContent=this.active?'正在编辑源码':'编辑源码';
      button.addEventListener('click',event=>{event.preventDefault();edit(view,this.editFrom);});bar.append(label,button);root.append(bar);
    }
    const frame=document.createElement('span');frame.className=inline?'math-inline-body':'scientific-preview-frame';
    frame.setAttribute('aria-busy','true');frame.textContent=inline?this.source:'正在生成预览…';root.append(frame);
    let alive=true,timer;
    const later=callback=>{timer=setTimeout(callback,60);};
    const ready=callback=>{if(!alive||!root.isConnected)return;if(isComposing(view)){later(()=>ready(callback));return;}callback();};
    const start=()=>ready(()=>{
      if(this.source.length>(this.kind==='mermaid'?20000:8000))return fail(new Error('此片段较长，请在源码模式编辑；预览已暂停。'));
      renderScientific(this.kind,this.source,this.display,this.colors).then(result=>ready(()=>{
        frame.replaceChildren(result.cloneNode(true));frame.setAttribute('aria-busy','false');root.classList.add('preview-ready');view.requestMeasure();
      }),error=>ready(()=>fail(error)));
    });
    const fail=error=>{
      frame.setAttribute('aria-busy','false');root.classList.add('preview-error');
      frame.textContent=inline?this.source:(this.kind==='mermaid'?'图表暂时无法解析，请检查源码。':'公式暂时无法解析，请检查源码。');
      if(!inline){const details=document.createElement('span');details.className='preview-error-detail';details.textContent=String(error.message||error).replace(/\s+/g,' ').slice(0,220);frame.append(details);}
      else root.title='公式暂时无法解析；点击编辑源码。';view.requestMeasure();
    };
    // Debounce edits and wait for the DOM mount. Never paint an async result
    // during composition, even if it began before the candidate window opened.
    timer=setTimeout(start,180);root.__cancelPreview=()=>{alive=false;clearTimeout(timer);};return root;
  }
  destroy(dom){dom.__cancelPreview?.();}
  ignoreEvent(){return true;}
  get estimatedHeight(){return !this.display&&!this.active?-1:this.kind==='mermaid'?354:166;}
}
const scientificModels=new WeakMap();
function scientificModel(state){
  const tree=syntaxTree(state),cached=scientificModels.get(state.doc);if(cached?.tree===tree)return cached.fragments;
  const fragments=[],excluded=extensionRanges(documentExtensions(state.doc)),text=state.doc.toString(),masked=rangeIndex(excluded);
  const add=(kind,source,from,to,editFrom,display)=>fragments.push({kind,source,from,to,editFrom,display});
  tree.iterate({enter(node){
    if(node.name!=='Document'&&masked(node.from,node.from+1))return false;
    if(node.name==='FencedCode') {
      excluded.push({from:node.from,to:node.to});
      const info=node.node.getChild('CodeInfo'),marks=node.node.getChildren('CodeMark');
      const language=info?state.sliceDoc(info.from,info.to).trim().toLowerCase():'';
      if(!['mermaid','math','latex','tex'].includes(language)||marks.length!==2)return false;
      const start=state.doc.lineAt(node.from).to+1,end=state.doc.lineAt(marks[1].from).from;
      if(end>start)add(language==='mermaid'?'mermaid':'math',state.sliceDoc(start,end).replace(/\n$/,''),node.from,node.to,start,true);
      return false;
    }
    if(['CodeBlock','InlineCode','Image','Link','LinkReference','HTMLBlock','HTMLTag','Table'].includes(node.name)){excluded.push({from:node.from,to:node.to});return false;}
  }});
  for(const span of mathSpans(text,excluded))add('math',span.source,span.from,span.to,span.contentFrom,span.display);
  scientificModels.set(state.doc,{tree,fragments});return fragments;
}
function build(state) {
  const ranges=[],colors=state.field(palette),selected=(from,to)=>state.selection.ranges.some(r=>r.from<=to&&r.to>=from);
  for(const {kind,source,from,to,editFrom,display}of scientificModel(state)){
    const line=state.doc.lineAt(from),active=display?selected(from,to):selected(line.from,line.to);
    const widget=new ScientificPreview(kind,source,from,editFrom,display,active,colors);
    if(active)ranges.push(Decoration.widget({widget,block:true,side:1}).range(state.doc.lineAt(to).to));
    else ranges.push(Decoration.replace({widget,block:display}).range(from,to));
  }
  return Decoration.set(ranges,true);
}
export const scientificPreview=StateField.define({
  create:state=>build(state),
  update(value,tr){
    if(tr.state.field(compositionState,false))return value.map(tr.changes);
    if(tr.docChanged||tr.selection||syntaxTree(tr.startState)!==syntaxTree(tr.state)||tr.effects.some(e=>e.is(setComposing)||e.is(setPreviewPalette)))return build(tr.state);
    return value;
  },
  provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))]
});
