const icons={folder:'<path d="M3 6.5h6l2 2h10v10.5H3z"/><path d="M3 6.5V5h6l2 2h8v1.5"/>',file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h5"/>',chevron:'<path d="m9 5 7 7-7 7"/>'};
const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=icons[name];return svg;};
const parentOf=path=>path.split('/').slice(0,-1).join('/');
const remap=(path,from,to)=>path===from?to:path.startsWith(from+'/')?to+path.slice(from.length):path;
export function createFileTree({send,getView,isComposing}) {
  const tree=document.getElementById('file-tree'),empty=document.getElementById('folder-empty'),status=document.getElementById('tree-status'),current=document.getElementById('current-file-section'),scroller=tree.closest('.files-scroll');
  const cache=new Map(),expanded=new Set(['']),requests=new Map(),mutations=new Map();
  let token=null,rootName='',currentPath=null,serial=0,selected='',edit=null,deferred=null,generation=0,dragged=null,dragTimer,menu;
  const nodes=()=>[...tree.querySelectorAll('.tree-item')],find=path=>nodes().find(node=>node.dataset.path===path);
  const busy=()=>isComposing(getView())||!!edit||!!dragged;
  function error(message){status.textContent=message;}
  function selectedFolder(){const row=find(selected);return row?.dataset.kind==='folder'?selected:parentOf(selected);}
  function hideMenu(){menu?.remove();menu=null;}
  function mutate(operation,values={}) {
    if(isComposing(getView()))return;
    const id='mutation-'+(++serial);mutations.set(id,{operation,token,...values});send('workspaceMutation',{id,operation,workspaceToken:token,...values});return id;
  }
  function finishEdit(){edit=null;render();if(deferred){const payload=deferred;deferred=null;setWorkspace(payload);}}
  function begin(operation,path=selected) {
    if(['trash','reveal','restoreTrash'].includes(operation)){hideMenu();mutate(operation,{path});return;}
    hideMenu();if(!token||isComposing(getView()))return;error('');
    const parent=operation==='rename'?parentOf(path):(find(path)?.dataset.kind==='folder'?path:parentOf(path));
    if(operation==='rename'&&!path)return;
    expanded.add(parent);edit={operation,path,parent,value:operation==='rename'?path.split('/').at(-1):operation==='createFile'?'未命名.md':'新建文件夹'};render();
    const input=tree.querySelector('.tree-name-input');input?.focus();input?.setSelectionRange(0,operation==='createFile'?edit.value.length-3:edit.value.length);
    if(!cache.has(parent))read(parent).then(()=>{if(!edit)render();}).catch(e=>error(e.message));
  }
  function editor(parent,depth,node) {
    let namingComposition=false;
    const li=document.createElement('li');li.className='tree-edit-row';li.style.setProperty('--depth',depth);li.setAttribute('role','none');
    const form=document.createElement('form');form.className='tree-edit-form';const input=document.createElement('input');input.className='tree-name-input';input.value=edit.value;input.setAttribute('aria-label',edit.operation==='rename'?'重命名':'新项目名称');input.autocomplete='off';input.spellcheck=false;input.addEventListener('compositionstart',()=>namingComposition=true);input.addEventListener('compositionend',()=>setTimeout(()=>namingComposition=false,0));
    input.addEventListener('input',()=>edit&&(edit.value=input.value));input.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();finishEdit();find(node?.id||selected)?.focus();}});
    const submit=document.createElement('button');submit.type='submit';submit.textContent='✓';submit.title='确认';submit.setAttribute('aria-label','确认名称');
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='×';cancel.title='取消';cancel.setAttribute('aria-label','取消编辑名称');cancel.onclick=finishEdit;
    form.addEventListener('submit',event=>{event.preventDefault();if(!edit||namingComposition||input.matches(':disabled')||event.isComposing)return;const value=input.value;if(!value.trim()){error('请填写名称。');return;}const state={...edit};const id=mutate(state.operation,{path:state.path,parent:state.parent,name:value});if(id){edit.pending=id;input.disabled=true;submit.disabled=true;cancel.disabled=true;}});
    form.append(input,submit,cancel);li.append(form);parent.append(li);
  }
  function render() {
    if(edit?.pending&&tree.querySelector('.tree-name-input'))return;
    const focus=document.activeElement?.closest?.('.tree-item')?.dataset.path,scroll=scroller.scrollTop;tree.replaceChildren();
    tree.hidden=!token;empty.hidden=!!token;document.getElementById('close-folder').hidden=!token;current.hidden=!!token&&currentPath!==null;
    document.querySelectorAll('[data-tree-create]').forEach(b=>b.disabled=!token);
    if(!token)return;
    function item(node,depth,parent) {
      if(edit?.operation==='rename'&&edit.path===node.id){editor(parent,depth,node);return;}
      const li=document.createElement('li');li.setAttribute('role','none');
      const row=document.createElement('div');row.className='tree-item'+(node.kind==='folder'?' folder':'')+(node.id===currentPath?' current':'');row.dataset.path=node.id;row.dataset.kind=node.kind;row.style.setProperty('--depth',depth-1);row.setAttribute('role','treeitem');row.setAttribute('aria-level',depth);row.tabIndex=-1;row.title=node.id||rootName;
      if(node.kind==='folder')row.setAttribute('aria-expanded',String(expanded.has(node.id)));else row.setAttribute('aria-selected',String(node.id===currentPath));
      const arrow=document.createElement('span');arrow.className='tree-chevron';if(node.kind==='folder')arrow.append(icon('chevron'));
      const symbol=document.createElement('span');symbol.className='tree-symbol';symbol.append(icon(node.kind));
      const name=document.createElement('span');name.className='tree-name';if(node.kind==='file'&&node.name.lastIndexOf('.')>0){const cut=node.name.lastIndexOf('.'),base=document.createElement('span'),extension=document.createElement('span');base.className='tree-basename';base.textContent=node.name.slice(0,cut);extension.className='tree-extension';extension.textContent=node.name.slice(cut);name.append(base,extension);}else name.textContent=node.name;row.append(arrow,symbol,name);
      if(node.id===currentPath){const dot=document.createElement('span');dot.className='tree-current-dot';dot.setAttribute('aria-label','当前文稿');row.append(dot);}
      const more=document.createElement('button');more.className='tree-more';more.type='button';more.textContent='⋯';more.tabIndex=-1;more.setAttribute('aria-label','操作 '+node.name);more.onclick=event=>{event.stopPropagation();showMenu(node,more.getBoundingClientRect());};row.append(more);
      row.addEventListener('click',()=>{selected=node.id;hideMenu();if(!edit)activate(node);});row.addEventListener('contextmenu',event=>{event.preventDefault();showMenu(node,{left:event.clientX,bottom:event.clientY});});
      row.draggable=!!node.id;
      row.addEventListener('dragstart',event=>{if(busy()){event.preventDefault();return;}hideMenu();dragged={path:node.id,token};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-mokune-path',JSON.stringify(dragged));row.classList.add('dragging');});
      row.addEventListener('dragend',()=>{dragged=null;clearTimeout(dragTimer);tree.querySelectorAll('.drop-target,.dragging').forEach(e=>e.classList.remove('drop-target','dragging'));flush();});
      row.addEventListener('dragover',event=>{const target=node.kind==='folder'?node.id:parentOf(node.id);if(!dragged||dragged.token!==token||target===dragged.path||target.startsWith(dragged.path+'/')||target===parentOf(dragged.path))return;event.preventDefault();event.dataTransfer.dropEffect='move';row.classList.add('drop-target');});
      row.addEventListener('dragleave',()=>{row.classList.remove('drop-target');clearTimeout(dragTimer);dragTimer=null;});
      row.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();clearTimeout(dragTimer);dragTimer=null;row.classList.remove('drop-target');if(!dragged||dragged.token!==token)return;const parent=node.kind==='folder'?node.id:parentOf(node.id);mutate('move',{path:dragged.path,parent});dragged=null;});
      li.append(row);parent.append(li);
      if(node.kind==='folder'&&expanded.has(node.id)) {
        const list=document.createElement('ul');list.setAttribute('role','group');list.className='tree-children';list.style.setProperty('--guide-depth',depth-1);li.append(list);
        if(edit&&edit.operation!=='rename'&&edit.parent===node.id)editor(list,depth+1);
        if(cache.has(node.id)) {const children=cache.get(node.id);children.forEach(child=>item(child,depth+1,list));if(!children.length&&!edit){const note=document.createElement('li');note.className='tree-empty-folder';note.textContent='空文件夹';note.style.setProperty('--depth',depth);note.setAttribute('role','none');list.append(note);}}
        else {const note=document.createElement('li');note.className='tree-empty-folder';note.textContent='正在读取…';note.setAttribute('role','none');list.append(note);}
      }
    }
    item({id:'',name:rootName,kind:'folder'},1,tree);scroller.scrollTop=scroll;
    const target=find(focus??selected)||find(currentPath)||nodes()[0];if(target){target.tabIndex=0;if(focus!==undefined&&!edit)target.focus({preventScroll:true});}
  }
  function read(path,force=false) {
    if(!force&&cache.has(path))return Promise.resolve(cache.get(path));
    const id='folder-'+(++serial),root=token;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(new Error('文件夹读取超时。'));},20000);requests.set(id,{resolve,reject,timer,root,generation});send('readDirectory',{id,path,workspaceToken:root});});
  }
  async function activate(node) {
    if(isComposing(getView()))return;
    if(node.kind==='file'){send('openWorkspaceFile',{path:node.id,workspaceToken:token});return;}
    if(expanded.has(node.id)){expanded.delete(node.id);render();return;}
    expanded.add(node.id);render();try{await read(node.id);if(!edit)render();}catch(e){error(e.message);expanded.delete(node.id);if(!edit)render();}
  }
  async function setWorkspace(payload) {
    if(edit||dragged||isComposing(getView())){deferred=payload;return;}
    const ticket=++generation,rootChanged=token!==payload.token,oldCurrent=currentPath;
    if(rootChanged){hideMenu();cache.clear();expanded.clear();expanded.add('');selected='';for(const request of requests.values()){clearTimeout(request.timer);request.resolve([]);}requests.clear();}
    token=payload.token||null;rootName=payload.name||'';currentPath=payload.currentPath??null;if(payload.truncated)error('此层仅显示前 1,000 项。');
    if(token)cache.set('',payload.children||[]);
    if(rootChanged)render();
    if(currentPath){let path='';for(const part of currentPath.split('/').slice(0,-1)){path=path?path+'/'+part:part;expanded.add(path);}}
    const owner=token;
    for(const path of [...expanded].filter(Boolean).sort((a,b)=>a.split('/').length-b.split('/').length)){
      try{await read(path,!!payload.invalidate);}catch{expanded.delete(path);cache.delete(path);}if(token!==owner||ticket!==generation)return;
    }
    if(edit||dragged||isComposing(getView())){deferred=payload;return;}
    render();if(currentPath&&(rootChanged||oldCurrent!==currentPath)){const row=find(currentPath);if(row){const a=row.getBoundingClientRect(),b=scroller.getBoundingClientRect();if(a.top<b.top)scroller.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)scroller.scrollTop+=a.bottom-b.bottom;}}
  }
  function receive(payload) {
    const request=requests.get(payload.id);if(!request)return;clearTimeout(request.timer);requests.delete(payload.id);
    if(payload.error){request.reject(new Error(payload.error));return;}
    if(request.root===token&&request.generation===generation)cache.set(payload.path,payload.children||[]);if(payload.truncated)error('此层仅显示前 1,000 项。');request.resolve(payload.children||[]);
  }
  function result(payload) {
    const operation=mutations.get(payload.id);if(!operation)return;mutations.delete(payload.id);if(operation.token!==token)return;
    if(payload.error){error(payload.error);if(edit?.pending===payload.id){delete edit.pending;render();const input=tree.querySelector('input');input?.focus();}return;}
    if(payload.operation==='reveal')return;
    if(payload.operation==='restoreTrash'){error('已还原');return;}
    if(payload.operation==='trash'){for(const key of [...cache.keys()]){if(key===payload.path||key.startsWith(payload.path+'/'))cache.delete(key);else cache.set(key,cache.get(key).filter(node=>node.id!==payload.path));}for(const path of [...expanded])if(path===payload.path||path.startsWith(payload.path+'/'))expanded.delete(path);selected=payload.parent||'';render();error('已移入废纸篓');if(payload.canUndo){const undo=document.createElement('button');undo.className='tree-undo';undo.textContent='撤销';undo.onclick=()=>mutate('restoreTrash');status.append(' · ',undo);}return;}
    if(payload.operation==='rename'||payload.operation==='move'){
      const values=[...expanded].map(path=>remap(path,payload.oldPath,payload.path));expanded.clear();values.forEach(path=>expanded.add(path));
      const moved=[...cache.values()].flat().find(node=>node.id===payload.oldPath),entries=[...cache];cache.clear();
      for(const [path,children] of entries)cache.set(remap(path,payload.oldPath,payload.path),children.filter(node=>node.id!==payload.oldPath).map(node=>({...node,id:remap(node.id,payload.oldPath,payload.path)})));
      if(moved){const children=(cache.get(payload.parent)||[]).filter(node=>node.id!==payload.path);children.push({...moved,id:payload.path,name:payload.path.split('/').at(-1)});cache.set(payload.parent,children);}
      if(currentPath!==null)currentPath=remap(currentPath,payload.oldPath,payload.path);
    }
    if(payload.operation.startsWith('create')){const children=(cache.get(payload.parent)||[]).filter(node=>node.id!==payload.path);children.push({id:payload.path,name:payload.path.split('/').at(-1),kind:payload.operation==='createFolder'?'folder':'file'});cache.set(payload.parent,children);if(payload.operation==='createFolder')cache.set(payload.path,[]);}
    selected=payload.path;expanded.add(payload.parent||'');if(payload.operation==='createFolder')expanded.add(payload.path);
    error(payload.message||(payload.operation==='move'?'已移动':payload.operation==='rename'?'已重命名':payload.operation==='createFolder'?'已新建文件夹':'已新建文稿'));
    if(edit?.pending===payload.id)finishEdit();
  }
  function showMenu(node,rect) {
    hideMenu();if(busy())return;selected=node.id;menu=document.createElement('div');menu.className='tree-menu';menu.setAttribute('role','menu');
    const folder=node.kind==='folder';const actions=[['新建文稿','createFile'],['新建文件夹','createFolder'],...(node.id?[['重命名','rename']]:[]),['在 Finder 中显示','reveal'],...(node.id?[['移入废纸篓…','trash']]:[])];
    actions.forEach(([label,operation])=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.onclick=()=>begin(operation,operation.startsWith('create')&&!folder?parentOf(node.id):node.id);menu.append(button);});
    document.body.append(menu);menu.style.left=Math.min(rect.left,innerWidth-174)+'px';menu.style.top=Math.min(rect.bottom+4,innerHeight-menu.offsetHeight-12)+'px';menu.querySelector('button').focus({preventScroll:true});
    menu.onkeydown=event=>{if(event.key==='Escape'){hideMenu();find(node.id)?.focus();}const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(i+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}};
  }
  document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target))hideMenu();});
  tree.addEventListener('focusin',event=>{const target=event.target.closest('.tree-item');if(target){selected=target.dataset.path;nodes().forEach(row=>row.tabIndex=row===target?0:-1);}});
  tree.addEventListener('keydown',event=>{
    if(event.target.matches('input')||event.isComposing)return;const row=event.target.closest('.tree-item');if(!row)return;const list=nodes(),index=list.indexOf(row),path=row.dataset.path;let target;
    if(event.metaKey&&event.key==='Backspace'&&path){event.preventDefault();begin('trash',path);return;}
    if(event.key==='F2'){event.preventDefault();begin('rename',path);return;}
    if(event.key==='ArrowDown')target=list[Math.min(index+1,list.length-1)];else if(event.key==='ArrowUp')target=list[Math.max(index-1,0)];else if(event.key==='Home')target=list[0];else if(event.key==='End')target=list.at(-1);
    else if(event.key==='ArrowRight'&&row.dataset.kind==='folder'){if(!expanded.has(path))activate({id:path,kind:'folder'});else target=list[index+1];}
    else if(event.key==='ArrowLeft'){if(row.dataset.kind==='folder'&&expanded.has(path))activate({id:path,kind:'folder'});else target=find(parentOf(path));}
    else if(event.key==='Enter'||event.key===' '){activate({id:path,kind:row.dataset.kind});}else return;event.preventDefault();target?.focus();
  });
  document.querySelectorAll('[data-tree-create]').forEach(button=>button.addEventListener('click',()=>begin(button.dataset.treeCreate,selectedFolder())));
  document.querySelectorAll('[data-open-folder]').forEach(button=>button.addEventListener('click',()=>send('openFolder')));document.getElementById('close-folder').addEventListener('click',()=>send('closeFolder'));
  document.querySelector('.cm-content')?.addEventListener('compositionend',()=>{if(deferred){const p=deferred;deferred=null;setWorkspace(p);}});
  function flush(){if(deferred&&!busy()){const p=deferred;deferred=null;setWorkspace(p);}}
  render();return {setWorkspace,receive,result,error,flush,setDocument:()=>{currentPath=null;if(!edit)render();}};
}
