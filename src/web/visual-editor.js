import {isolateHistory} from '@codemirror/commands';
import {restoreEditorFocus} from './editor-focus.js';
import {cellModel,cellChange,nextCell,pictureModel,pictureChanges} from './visual-model.mjs';
import {pasteTable} from './table-transfer.mjs';
export function createVisualEditor({getView,isComposing,onOpenChange,onReplace,onReveal,onError=()=>{}}){
 const dialog=document.createElement('dialog');dialog.id='visual-editor';dialog.setAttribute('aria-labelledby','visual-editor-title');dialog.setAttribute('aria-modal','true');dialog.setAttribute('role','dialog');
 dialog.innerHTML='<header><div><p class="visual-eyebrow"></p><h2 id="visual-editor-title"></h2></div><button type="button" data-cancel aria-label="取消编辑">×</button></header><div class="visual-fields"></div><p class="visual-message" role="status"></p><footer><span class="visual-hint"></span><div><button type="button" data-cancel>取消</button><button type="button" data-apply>应用</button></div></footer>';
 document.body.append(dialog);const fields=dialog.querySelector('.visual-fields'),message=dialog.querySelector('.visual-message'),applyButton=dialog.querySelector('[data-apply]');
 let inlineField=null,inlineHost=null,inlineNodes=[],anchorNode=null,blurTimer;
 let session=null,panelComposing=false,generation=0,endTimer;
 const blocked=event=>panelComposing||event?.isComposing||event?.keyCode===229;
 function close(){if(blocked())return;generation++;clearTimeout(endTimer);session=null;clearTimeout(blurTimer);if(inlineHost?.isConnected){inlineHost.replaceChildren(...inlineNodes);inlineHost.classList.remove('table-cell-editing');}inlineField=null;inlineHost=null;inlineNodes=[];anchorNode=null;if(dialog.open)dialog.close();dialog.classList.remove('cell-popover');dialog.style.removeProperty('left');dialog.style.removeProperty('top');dialog.style.removeProperty('width');onOpenChange(false);restoreEditorFocus(getView());}
 function report(error){message.textContent=error.message||error;}
 function input(name,label,value,placeholder='',area=false){const wrapper=document.createElement('label');wrapper.textContent=label;const field=document.createElement(area?'textarea':'input');field.name=name;field.value=value;field.placeholder=placeholder;field.spellcheck=false;field.autocomplete='off';field.maxLength=area?20000:name==='title'?1000:name==='alt'?2000:16;if(area){field.rows=4;field.setAttribute('aria-label','单元格内容');}wrapper.append(field);fields.append(wrapper);return field;}
 function draw(){
  message.textContent='';applyButton.disabled=false;fields.replaceChildren();dialog.dataset.kind=session.kind;
  if(session.kind==='cell'){
   const m=session.model;dialog.querySelector('.visual-eyebrow').textContent='TABLE CELL';dialog.querySelector('h2').textContent=m.row===0?`表头 · 第 ${m.column+1} 列`:`第 ${m.row} 行 · 第 ${m.column+1} 列`;
   input('cell','单元格内容',m.value.replace(/<br\s*\/?>/gi,'\n'),'支持行内 Markdown；换行自动保存为 <br>',true);
   dialog.querySelector('.visual-hint').textContent='Tab 切换单元格 · ⌘Enter 应用 · Esc 取消';
  }else{
   dialog.querySelector('.visual-eyebrow').textContent='IMAGE';dialog.querySelector('h2').textContent='图片设置';
   input('alt','替代文字',session.model.alt,'描述图片内容，供无障碍阅读或图片无法加载时使用');
   input('title','图片标题',session.model.title,'可留空；独立图片显示为题注');
   const row=document.createElement('div');row.className='visual-size-row';fields.append(row);
   const width=input('width','宽度',session.model.width,'自动 / 320px / 50%'),height=input('height','高度',session.model.height,'自动 / 180px');row.append(width.parentNode,height.parentNode);
   const note=document.createElement('p');note.className='visual-field-note';note.textContent=session.model.inline?'留空保持自然比例；同时指定宽高时，图片完整放入该尺寸区域。':'引用式图片：修改替代文字、标题或替换图片时，仅这一处转为行内写法，其他引用保持不变。';fields.append(note);
   const actions=document.createElement('div');actions.className='visual-image-actions';
   const path=document.createElement('p');path.className='visual-image-path';path.textContent=session.reference||session.model.reference;path.title=path.textContent;fields.append(path);
   for(const [text,handler] of [['替换图片…',async()=>{if(blocked()||!valid()||session.importing)return;const current=session;current.importing=true;applyButton.disabled=true;try{const result=await onReplace?.();if(session!==current||result?.cancelled)return;if(!valid())return;if(result?.reference){current.reference=result.reference;path.textContent=result.reference;path.title=result.reference;message.textContent='新图片将在应用后替换；原资源保留，可撤销。';}}catch(error){if(session===current)report(error);}finally{if(session===current){current.importing=false;applyButton.disabled=panelComposing;}}}],['定位原文件',async()=>{if(blocked())return;const current=session;try{await onReveal?.(current.reference||current.model.reference);}catch(error){if(session===current)report(error);}}]]){const control=document.createElement('button');control.type='button';control.textContent=text;control.onclick=handler;actions.append(control);}fields.append(actions);
   const reset=document.createElement('button');reset.type='button';reset.className='visual-reset';reset.textContent='恢复自然尺寸';reset.onclick=()=>{if(blocked())return;width.value='';height.value='';};fields.append(reset);
   dialog.querySelector('.visual-hint').textContent='⌘Enter 应用 · Esc 取消';
  }
  fields.querySelector('textarea,input')?.focus();if(session.kind==='cell')fields.querySelector('textarea').select();
 }
 function valid(){const view=getView();if(!session||view!==session.owner||view.state.doc!==session.doc||view.state.readOnly){report('正文或标签已变化；为保护内容，未应用这次编辑。可复制输入内容后取消。');return false;}if(blocked()||isComposing(view))return false;return true;}
 function pasteMatrix(event){
  const data=event.clipboardData,source=data?.getData('text/tab-separated-values')||data?.getData('text/plain')||'';
  const spreadsheet=data?.types?.includes('text/tab-separated-values')||/<table[\s>]/i.test(data?.getData('text/html')||'');
  if(!source.includes('\t')&&!(spreadsheet&&/[\r\n]/.test(source)))return;
  event.preventDefault();event.stopPropagation();if(!valid())return;
  const current=session;if(current.kind!=='cell')return;
  try{
   const changes=pasteTable(current.owner.state.doc.toString(),current.model.tableFrom,current.model.row,current.model.column,source);
   if(!changes)throw new Error('当前位置无法进行表格批量粘贴。');
   // Apply before closing, like a normal cell commit: closing can flush deferred
   // link updates or document loads. Never apply stale offsets after that flush.
   const field=inlineField||fields.querySelector('[name=cell]');
   if(field.value!==current.model.value.replace(/<br\s*\/?>/gi,'\n'))throw new Error('当前单元格有未提交内容，请先按 Enter 应用，再粘贴表格。');
   if(changes.length)current.owner.dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input.table-paste'});close();current.owner.focus();
  }catch(error){if(inlineField)onError(error.message);else report(error);}
 }
 function commit(direction){
  if(!valid()||session.importing)return false;const current=session;
  try{
   let changes;if(current.kind==='cell'){
    const value=(inlineField||fields.querySelector('[name=cell]')).value;
    // A no-op Apply must not rewrite existing <br /> spelling or whitespace.
    changes=value===current.model.value.replace(/<br\s*\/?>/gi,'\n')?[]:cellChange(current.model,value);
   }else changes=pictureChanges(current.model,{...Object.fromEntries([...fields.querySelectorAll('input')].map(field=>[field.name,field.value])),reference:current.reference||current.model.reference});
   if(changes.length)current.owner.dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input.visual'});
   if(direction&&current.kind==='cell'){
    const next=nextCell(current.model,direction);if(!next){close();return true;}
    current.doc=current.owner.state.doc;current.model=cellModel(current.doc.toString(),current.model.tableFrom,next.row,next.column);anchorNode=current.owner.dom.querySelector(`[data-table-from="${current.model.tableFrom}"] [data-row="${next.row}"][data-column="${next.column}"]`);draw();positionPopover();return true;
   }
   close();return true;
  }catch(error){report(error);return false;}
 }
 function open(kind,position,row,column,anchor){const owner=getView();if(!owner||owner.state.readOnly||isComposing(owner)||session)return;try{const text=owner.state.doc.toString(),model=kind==='cell'?cellModel(text,position,row,column):pictureModel(text,position);if(!model)throw new Error(kind==='cell'?'请先将光标放在表格中，或点击预览单元格。':'请先将光标放在图片源码中，或点击预览上的“图片设置”。');session={kind,model,owner,doc:owner.state.doc};panelComposing=false;generation++;onOpenChange(true);dialog.showModal();draw();if(anchor){anchorNode=anchor;dialog.classList.add('cell-popover');positionPopover();}}catch(error){session=null;if(dialog.open)dialog.close();onOpenChange(false);onError(error.message);}}
 function positionPopover(){
  if(!anchorNode?.isConnected||!dialog.open)return;
  const a=anchorNode.getBoundingClientRect(),pad=16,gap=12,w=Math.min(390,innerWidth-pad*2),h=Math.min(dialog.offsetHeight,innerHeight-pad*2);
  const options=[['bottom',innerHeight-a.bottom-pad-gap,h],['top',a.top-pad-gap,h],['right',innerWidth-a.right-pad-gap,w],['left',a.left-pad-gap,w]];
  const fits=options.filter(([,space,need])=>space>=need).sort((a,b)=>b[1]/b[2]-a[1]/a[2]);const side=(fits[0]||options.filter(([side])=>side==='bottom'||side==='top').sort((a,b)=>b[1]-a[1])[0])[0];
  let left=side==='right'?a.right+gap:side==='left'?a.left-w-gap:a.left+a.width/2-w/2,top=side==='bottom'?a.bottom+gap:side==='top'?a.top-h-gap:a.top+a.height/2-h/2;
  left=Math.max(pad,Math.min(innerWidth-w-pad,left));top=Math.max(pad,Math.min(innerHeight-h-pad,top));dialog.dataset.side=side;dialog.style.width=w+'px';dialog.style.left=left+'px';dialog.style.top=top+'px';dialog.style.setProperty('--arrow-x',Math.max(20,Math.min(w-20,a.left+a.width/2-left))+'px');dialog.style.setProperty('--arrow-y',Math.max(20,Math.min(h-20,a.top+a.height/2-top))+'px');
 }

 window.addEventListener('resize',positionPopover);document.addEventListener('scroll',()=>{if(anchorNode&&dialog.open)positionPopover();},true);
 function inlineCell(position,row,column,host,point){
  if(session){if(!inlineField||blocked())return;const owner=session.owner,tableFrom=session.model.tableFrom;if(!commit())return;host=owner.dom.querySelector(`[data-table-from="${tableFrom}"] [data-row="${row}"][data-column="${column}"]`);}
  const owner=getView();if(!host?.isConnected||!owner||owner.state.readOnly||isComposing(owner))return;
  try{const model=cellModel(owner.state.doc.toString(),position,row,column);if(!model)return;session={kind:'cell',model,owner,doc:owner.state.doc};panelComposing=false;generation++;onOpenChange(true);inlineHost=host;inlineNodes=[...host.childNodes];inlineField=document.createElement('textarea');inlineField.className='table-cell-input';inlineField.setAttribute('aria-label','直接编辑单元格');inlineField.value=model.value.replace(/<br\s*\/?>/gi,'\n');inlineField.rows=1;const style=getComputedStyle(host);inlineField.style.padding=style.padding;inlineField.style.textAlign=style.textAlign;inlineField.style.lineHeight=style.lineHeight;inlineField.style.font=style.font;let offset=null;if(point){const caret=document.caretPositionFromPoint?.(point.x,point.y),range=document.caretRangeFromPoint?.(point.x,point.y),node=caret?.offsetNode||range?.startContainer,at=caret?.offset??range?.startOffset;if(node&&host.contains(node)){const r=document.createRange();r.setStart(host.querySelector('.cell-display')||host,0);try{r.setEnd(node,at);offset=r.toString().length;}catch{}}}host.classList.add('table-cell-editing');host.append(inlineField);inlineField.focus({preventScroll:true});if(offset===null)inlineField.select();else inlineField.setSelectionRange(Math.min(offset,inlineField.value.length),Math.min(offset,inlineField.value.length));
   inlineField.addEventListener('compositionstart',()=>{clearTimeout(endTimer);generation++;panelComposing=true;});
   inlineField.addEventListener('paste',pasteMatrix);
   inlineField.addEventListener('compositionend',()=>{const ticket=generation;endTimer=setTimeout(()=>{if(ticket===generation){panelComposing=false;if(inlineField&&document.activeElement!==inlineField)commit();}},60);});
   inlineField.addEventListener('keydown',event=>{event.stopPropagation();if(blocked(event))return;if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){event.preventDefault();const current=session,next=nextCell(current.model,event.shiftKey?-1:1);if(commit()&&next){const node=owner.dom.querySelector(`[data-table-from="${current.model.tableFrom}"] [data-row="${next.row}"][data-column="${next.column}"]`);inlineCell(current.model.tableFrom,next.row,next.column,node);}}else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();commit();}});
   inlineField.addEventListener('blur',()=>{clearTimeout(blurTimer);blurTimer=setTimeout(()=>{if(inlineField&&!blocked())commit();},0);});
  }catch(error){onError(error.message);close();}
 }
 dialog.addEventListener('compositionstart',()=>{clearTimeout(endTimer);generation++;panelComposing=true;applyButton.disabled=true;});
 dialog.addEventListener('paste',event=>{if(session?.kind==='cell')pasteMatrix(event);});
 dialog.addEventListener('compositionend',()=>{const ticket=generation;endTimer=setTimeout(()=>{if(ticket===generation){panelComposing=false;applyButton.disabled=!!session?.importing;}},60);});
 dialog.addEventListener('keydown',event=>{
  if(blocked(event))return;
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();commit();}
  if(event.key==='Tab'&&session?.kind==='cell'){event.preventDefault();commit(event.shiftKey?-1:1);}
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!blocked(event))close();});
 dialog.addEventListener('pointerdown',event=>{if(!dialog.classList.contains('cell-popover')||event.target!==dialog||blocked(event))return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();});
 dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=close);applyButton.onclick=()=>commit();
 // Native menu Undo/Redo must stay inside the field while this panel is open.
 function action(name){if(!session)return false;if(blocked())return true;if(name==='undo'||name==='redo'){document.execCommand(name);return true;}report('请先应用或取消当前编辑，再操作文稿。');return true;}
 return {finishInline:()=>!inlineField||commit(),inlineCell,cell:(position,row,column,anchor)=>open('cell',position,row,column,anchor),image:position=>open('image',position),isOpen:()=>!!session,action,close};
}
