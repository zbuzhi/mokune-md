import {isolateHistory,undo,redo} from '@codemirror/commands';
import {isComposing} from './composition.js';
import {ViewPlugin} from '@codemirror/view';
import {rectangle,copyTableRange,tableRangeOperation} from './table-range.mjs';

// Selection is transient DOM state belonging to one widget/view. Document or
// tab changes destroy it, so stale ranges can never address another draft.
export function attachTableSelection(root,view,position,tools){
 const table=root.querySelector('table');let doc=view.state.doc,anchor=null,head=null,selected=false,gesture=null,dead=false;
 const cells=()=>[...table.querySelectorAll('[data-row][data-column]')];
 const valid=()=>!dead&&root.isConnected&&view.dom.isConnected&&view.state.doc===doc;
 const point=td=>({row:Number(td.dataset.row),column:Number(td.dataset.column)});
 const cellAt=p=>table.querySelector(`[data-row="${p.row}"][data-column="${p.column}"]`);
 const contains=(range,row,column)=>row>=range.top&&row<=range.bottom&&column>=range.left&&column<=range.right;
 function clear(){selected=false;for(const td of cells()){td.classList.remove('table-range-selected','table-range-anchor');td.setAttribute('aria-selected','false');}root.classList.remove('has-table-selection');table.setAttribute('aria-label','Markdown 表格：单击编辑，拖拽或 Shift 扩选');}
 function paint(focus=true){
  if(!valid()||!anchor||!head)return;selected=true;const range=rectangle(anchor,head);
  for(const td of cells()){const p=point(td),yes=contains(range,p.row,p.column);td.classList.toggle('table-range-selected',yes);td.classList.toggle('table-range-anchor',p.row===head.row&&p.column===head.column);td.setAttribute('aria-selected',String(yes));}
  root.classList.add('has-table-selection');table.setAttribute('aria-label',`已选择 ${range.bottom-range.top+1} 行、${range.right-range.left+1} 列；⌘C 复制，Delete 清空，Esc 取消`);
  if(focus)cellAt(head)?.focus({preventScroll:true});
 }
 const range=()=>selected&&anchor&&head?rectangle(anchor,head):null;
 function report(error){tools.error?.(error.message||String(error));}
 async function copy(){if(!valid()||isComposing(view)||!selected)return;try{await tools.copyText?.(copyTableRange(doc.toString(),position,range()));}catch(error){if(valid())report(error);}}
 function run(operation){
  if(!valid()||view.state.readOnly||isComposing(view)||!selected)return;
  try{const bounds=range(),changes=tableRangeOperation(doc.toString(),position,bounds,operation);if(changes?.length){view.dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input.table-range'});view.focus();}else clear();}catch(error){report(error);}
 }
 function cancel(){if(!gesture)return;window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',abort,true);window.removeEventListener('blur',abort);gesture=null;}
 function move(event){
  if(!gesture||event.pointerId!==gesture.id)return;if(!valid()||isComposing(view)){cancel();return;}
  if(!gesture.drag&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<5)return;
  const td=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-row][data-column]');
  if(td&&table.contains(td)){gesture.drag=true;head=point(td);paint(false);event.preventDefault();}
 }
 function finish(event){
  if(!gesture||event.pointerId!==gesture.id)return;const current=gesture;cancel();if(!valid()||isComposing(view))return;
  if(current.drag||current.shift){paint();return;}
  clear();const td=cellAt(current.cell);anchor={...current.cell};head={...current.cell};
  if(!view.state.readOnly)tools.inlineCell?.(view,position,head.row,head.column,td,{x:event.clientX,y:event.clientY});else{paint();}
 }
 function abort(){cancel();clear();}
 function sync(){if(doc!==view.state.doc){cancel();clear();anchor=null;head=null;doc=view.state.doc;}}
 function begin(event,cell,previousAnchor=anchor){
  if(dead||!root.isConnected||!view.dom.isConnected)return;
  if(doc!==view.state.doc){sync();previousAnchor=null;}
  if(isComposing(view))return;
  // Commit a previous inline field before recording offsets. That can rebuild
  // this widget; continue against its new controller rather than old nodes.
  if(tools.finishInline?.()===false)return;
  if(!valid()){
   const next=view.dom.querySelector(`[data-table-from="${position}"]`);if(next&&next!==root)next.__tableSelection?.begin(event,cell,previousAnchor);else if(next===root){sync();begin(event,cell,previousAnchor);}return;
  }
  cancel();anchor=event.shiftKey&&previousAnchor?previousAnchor:{...cell};head={...cell};
  if(event.shiftKey)paint();else clear();
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,cell,shift:event.shiftKey,drag:false};
  window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',abort,true);window.addEventListener('blur',abort,{once:true});
 }
 function down(event){
  const td=event.target.closest('[data-row][data-column]');if(!td||!table.contains(td)||event.button!==0||event.altKey||event.ctrlKey||event.target.closest('a,button,input,textarea'))return;
  event.preventDefault();event.stopPropagation();begin(event,point(td));
 }
 function click(event){if(event.detail===0)return;if(event.target.closest('a,button,input,textarea')||event.altKey||event.ctrlKey)return;if(event.target.closest('[data-row][data-column]')){event.preventDefault();event.stopImmediatePropagation();}}
 function key(event){
  if(event.target.closest('input,textarea,button')||!valid()||isComposing(view)||event.isComposing||event.keyCode===229)return;
  const td=event.target.closest('[data-row][data-column]');if(!td)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();clear();view.focus();return;}
  if(event.shiftKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
   event.preventDefault();event.stopPropagation();anchor??=point(td);head??=point(td);const maxRow=Math.max(...cells().map(td=>Number(td.dataset.row))),maxColumn=Math.max(...cells().map(td=>Number(td.dataset.column)));
   head={row:Math.max(0,Math.min(maxRow,head.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0))),column:Math.max(0,Math.min(maxColumn,head.column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)))};paint();cellAt(head)?.scrollIntoView({block:'nearest',inline:'nearest'});return;
  }
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();if(!view.state.readOnly)(event.shiftKey?redo:undo)(view);return;}
  if(!selected)return;
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='c'){event.preventDefault();event.stopPropagation();copy();}
  else if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopPropagation();run('clear');}
  else if(event.key==='Enter'&&!view.state.readOnly){event.preventDefault();event.stopPropagation();const p={...head};clear();tools.inlineCell?.(view,position,p.row,p.column,cellAt(p));}
 }
 function outside(event){if(!root.contains(event.target)&&!event.target.closest('.table-context-menu')){cancel();clear();anchor=null;head=null;}}
 function copyEvent(event){if(!selected||!valid()||isComposing(view)||event.target.closest('input,textarea'))return;try{event.clipboardData.setData('text/plain',copyTableRange(doc.toString(),position,range()));event.preventDefault();event.stopPropagation();}catch(error){report(error);}}
 table.setAttribute('role','grid');table.setAttribute('aria-multiselectable','true');
 root.addEventListener('pointerdown',down,true);root.addEventListener('click',click,true);root.addEventListener('keydown',key,true);root.addEventListener('copy',copyEvent);document.addEventListener('pointerdown',outside,true);
 const controller={begin,sync,range,run,copy,contains:(row,column)=>selected&&contains(range(),row,column),destroy(){dead=true;cancel();document.removeEventListener('pointerdown',outside,true);}};
 root.__tableSelection=controller;return controller;
}

// Equal table widgets may survive edits in surrounding paragraphs. Invalidate
// their transient bounds and snapshot even when CodeMirror reuses their DOM.
export const tableSelectionLifecycle=ViewPlugin.fromClass(class{
 constructor(view){this.view=view;this.alive=true;}
 update(update){if(update.docChanged)queueMicrotask(()=>{if(this.alive)for(const root of this.view.dom.querySelectorAll('.md-table-preview'))root.__tableSelection?.sync();});}
 destroy(){this.alive=false;}
});
