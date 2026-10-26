import {classifyResources} from './resource-model.mjs';
import {restoreEditorFocus} from './editor-focus.js';
const size=bytes=>bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';
export function createResourceManager({request,send,getView,isComposing,onOpenChange,navigate,history=()=>({documents:[],complete:true})}){
 const dialog=document.createElement('dialog');dialog.id='resource-manager';dialog.setAttribute('aria-labelledby','resources-title');dialog.innerHTML='<header><div><p class="visual-eyebrow">LOCAL RESOURCES</p><h2 id="resources-title">图片与附件</h2><p class="resources-scope"></p></div><button data-close aria-label="关闭资源管理">×</button></header><div class="resources-controls"><input type="search" aria-label="查找资源" placeholder="搜索文件名或路径…"><select aria-label="资源筛选"><option value="all">全部资源</option><option value="missing">失效引用</option><option value="unused">可清理资源</option></select><button data-refresh>重新检查</button></div><p class="resources-status" role="status"></p><div class="resources-content"><div class="resources-list" role="list" aria-label="资源列表"></div><section class="resources-detail" aria-label="资源预览"></section></div><footer><label><input type="checkbox" data-select>选择当前列表中可清理的资源</label><div><button data-undo hidden>撤销清理</button><button data-clean disabled>移入废纸篓…</button></div></footer>';
 document.body.append(dialog);const list=dialog.querySelector('.resources-list'),detail=dialog.querySelector('.resources-detail'),status=dialog.querySelector('.resources-status'),search=dialog.querySelector('[type=search]'),filter=dialog.querySelector('select'),cleanup=dialog.querySelector('[data-clean]'),select=dialog.querySelector('[data-select]'),undo=dialog.querySelector('[data-undo]');
 let inventory,report,active=null,selected=new Set(),busy=false,destructive=false,panelComposing=false,generation=0,visible=[],endTimer;
 function message(text){status.textContent=text;}
 function updateActions(){cleanup.disabled=busy||panelComposing||!inventory?.complete||!selected.size;cleanup.textContent=selected.size?`移入废纸篓 · ${selected.size}`:'移入废纸篓…';select.disabled=busy||panelComposing||!inventory?.complete;const eligible=visible.filter(x=>x.unused);select.checked=!!eligible.length&&eligible.every(x=>selected.has(x.path));select.indeterminate=!select.checked&&eligible.some(x=>selected.has(x.path));dialog.querySelector('[data-refresh]').disabled=busy||panelComposing;undo.disabled=busy||panelComposing;}
 function inspect(item){
  active=item;detail.replaceChildren();const title=document.createElement('h3'),path=document.createElement('p');title.textContent=item.name||item.reference||'未定义引用';path.className='resources-detail-path';path.textContent=item.relative||item.reference||'';detail.append(title,path);
  if(item.path&&item.references){
   if(item.image){const img=document.createElement('img');img.alt=item.name;img.src=inventory.imageBase+'?path='+encodeURIComponent(item.relative);img.addEventListener('error',()=>{img.replaceWith(Object.assign(document.createElement('p'),{textContent:'无法预览图片，可定位原文件检查。'}));});detail.append(img);}
   else{const icon=document.createElement('div');icon.className='resource-file-icon';icon.textContent=item.name.split('.').at(-1).toUpperCase().slice(0,8);detail.append(icon);}
   const meta=document.createElement('p');meta.textContent=size(item.size)+' · '+(item.references.length?item.references.length+' 处引用':item.possible?'存在可能引用，保留':item.open?'文件已在标签中打开':item.managed===false?'位于 assets 之外，仅检查不清理':!item.eligible?'此类型仅检查，不自动清理':'未发现引用');detail.append(meta);
   const reveal=document.createElement('button');reveal.textContent='在 Finder 中显示';reveal.onclick=()=>run(()=>request('resourceReveal',{scanID:inventory.scanID,path:item.path}));detail.append(reveal);
   for(const ref of item.references.slice(0,30)){const button=document.createElement('button');button.className='resource-reference';button.textContent=ref.document+' · 第 '+ref.line+' 行';button.disabled=!!ref.historical;button.onclick=()=>jump(ref);detail.append(button);}
   if(item.unused){const note=document.createElement('p');note.className='resource-cleanup-note';note.textContent='清理仅移入废纸篓；正文与原始 Markdown 保持不变。';detail.append(note);}
  }else{const note=document.createElement('p');note.textContent=item.status;const button=document.createElement('button');button.textContent='前往引用位置';button.onclick=()=>jump(item);detail.append(note,button);}
 }
 function jump(item){if(busy||panelComposing)return;navigate(item,inventory?.scanID);close();}
 function render(){
  list.replaceChildren();const query=search.value.trim().toLowerCase(),all=filter.value==='missing'?report?.missing||[]:filter.value==='unused'?report?.assets.filter(x=>x.unused)||[]:report?.assets||[];
  visible=all.filter(item=>(item.relative||item.reference||item.document||'').toLowerCase().includes(query)).slice(0,300);
  if(!visible.length){const empty=document.createElement('p');empty.className='resources-empty';empty.textContent=filter.value==='missing'?'未发现失效引用':filter.value==='unused'?'没有可清理资源':'没有匹配的资源';list.append(empty);}
  for(const item of visible){const row=document.createElement('div');row.className='resource-row';row.setAttribute('role','listitem');
   if(item.unused){const box=document.createElement('input');box.type='checkbox';box.checked=selected.has(item.path);box.disabled=busy||panelComposing||!inventory.complete;box.setAttribute('aria-label','选择 '+item.relative);box.onchange=()=>{if(box.checked)selected.add(item.path);else selected.delete(item.path);updateActions();};row.append(box);}else{const dot=document.createElement('span');dot.className='resource-kind';dot.textContent=item.status?'!':item.image?'▧':'◇';row.append(dot);}
   const button=document.createElement('button');button.className='resource-row-main';const title=document.createElement('strong'),subtitle=document.createElement('small');title.textContent=item.name||item.reference||'未定义引用';subtitle.textContent=item.relative||item.document+' · 第 '+item.line+' 行';button.append(title,subtitle);button.onclick=()=>{inspect(item);for(const e of list.querySelectorAll('.selected'))e.classList.remove('selected');row.classList.add('selected');};row.append(button);
   if(item.size!=null){const bytes=document.createElement('span');bytes.className='resource-bytes';bytes.textContent=size(item.size);row.append(bytes);}list.append(row);
  }
  if(!active||!visible.includes(active)){detail.replaceChildren();const hint=document.createElement('p');hint.className='resources-empty';hint.textContent='选择资源，查看预览和引用位置';detail.append(hint);active=null;}
  updateActions();
 }
 async function refresh(){
  if(busy||panelComposing)return;const ticket=++generation;busy=true;selected.clear();report=null;inventory=null;list.replaceChildren();detail.replaceChildren();updateActions();message('正在核对磁盘文稿与未保存草稿…');
  try{const result=await request('resourceScan');if(ticket!==generation||!dialog.open)return;inventory=result;const previous=history();inventory.complete=inventory.complete&&previous.complete;report=classifyResources({...result,documents:[...result.documents,...previous.documents]});send('resourceClassified',{scanID:result.scanID,unused:report.unused,complete:inventory.complete});undo.hidden=!result.canUndo;dialog.querySelector('.resources-scope').textContent=result.root;message(`${report.assets.length} 个资源 · ${report.missing.length} 处失效引用 · ${report.unused.length} 个可清理`+(result.complete?'':' · 扫描不完整，清理已停用'));}
  catch(error){if(ticket===generation)message(error.message);}finally{if(ticket===generation){busy=false;render();}}
 }
 async function run(action,lock=false){if(busy||panelComposing)return;busy=true;destructive=lock;updateActions();try{const result=await action();if(result?.canUndo)undo.hidden=false;return result;}catch(error){if(error.canUndo)undo.hidden=false;message(error.message);}finally{busy=false;destructive=false;updateActions();}}
 cleanup.onclick=async()=>{if(cleanup.disabled)return;const result=await run(()=>request('resourceCleanup',{scanID:inventory.scanID,paths:[...selected]}),true);if(result?.removed){await refresh();message('已移入废纸篓 '+result.removed+' 个资源，可撤销本次清理。');}else if(result?.cancelled)message('已取消，资源保持原位。');};
 undo.onclick=async()=>{const result=await run(()=>request('resourceRestore'),true);if(result?.restored){await refresh();message('已还原上次清理的资源。');}};
 select.onchange=()=>{if(panelComposing||busy)return;for(const item of visible.filter(x=>x.unused)){if(select.checked)selected.add(item.path);else selected.delete(item.path);}render();};
 search.oninput=()=>{if(!panelComposing)render();};filter.onchange=()=>{if(!panelComposing)render();};dialog.querySelector('[data-refresh]').onclick=refresh;
 dialog.addEventListener('compositionstart',()=>{clearTimeout(endTimer);panelComposing=true;updateActions();});dialog.addEventListener('compositionend',()=>{clearTimeout(endTimer);endTimer=setTimeout(()=>{panelComposing=false;render();},60);});
 function close(){if(panelComposing||destructive)return;generation++;busy=false;clearTimeout(endTimer);if(dialog.open)dialog.close();send('resourceClose');onOpenChange(false);restoreEditorFocus(getView());}
 dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return {open(){if(!getView()||isComposing(getView())||dialog.open)return;onOpenChange(true);dialog.showModal();search.value='';filter.value='all';search.focus();refresh();},isOpen:()=>dialog.open,action(name){if(name==='undo'||name==='redo')document.execCommand(name);},close};
}
