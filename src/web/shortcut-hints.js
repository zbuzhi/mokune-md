import shortcuts from './shortcuts.json';

export function createShortcutHints({native,canShow}) {
  const root=document.createElement('aside');
  root.className='shortcut-hints';root.setAttribute('aria-label','常用快捷键');root.setAttribute('aria-hidden','true');
  const heading=document.createElement('div');heading.className='shortcut-hints-heading';
  const title=document.createElement('strong');title.textContent='常用快捷键';
  const note=document.createElement('span');note.textContent='松开 ⌘ 收起';heading.append(title,note);root.append(heading);
  const format=action=>{const item=shortcuts.find(item=>item.action===action);return [item.title,item.binding.replace('Mod-','⌘').replace('Shift-','⇧').replace('Alt-','⌥').toUpperCase()];};
  const sections=[['文稿',[['新建文稿','⌘N'],['快速打开','⌘P'],['保存','⌘S'],['导出 PDF','⇧⌘E']]],['编辑',[['撤销 / 重做','⌘Z / ⇧⌘Z'],['查找与替换','⌘F'],format('bold'),format('italic')]],['Markdown',[format('link'),format('inlineCode'),format('codeBlock'),format('table')]],['视图',[['源码 / 即时预览','⌘/'],['切换侧栏','⇧⌘B'],['专注模式','⇧⌘F'],['命令面板','⇧⌘P']]]];
  const grid=document.createElement('div');grid.className='shortcut-hints-grid';
  for(const [name,items] of sections){const section=document.createElement('section');const label=document.createElement('h3');label.textContent=name;section.append(label);for(const [text,key] of items){const row=document.createElement('div');row.className='shortcut-hint';const caption=document.createElement('span');caption.textContent=text;const kbd=document.createElement('kbd');kbd.textContent=key;row.append(caption,kbd);section.append(row);}grid.append(section);}
  root.append(grid);document.body.append(root);
  let timer,held=false,suppressed=false;
  function show(visible){const active=!!visible&&canShow()&&!document.hidden;root.classList.toggle('is-visible',active);root.setAttribute('aria-hidden',String(!active));}
  function cancel(reset=false){clearTimeout(timer);suppressed=!reset;if(reset)held=false;show(false);}
  // AppKit owns the timer in the Mac app: WebKit may swallow modifier key-up.
  if(!native){
    document.addEventListener('keydown',event=>{
      if(event.key!=='Meta'){if(held||event.metaKey)cancel();return;}
      if(event.repeat||held)return;
      held=true;suppressed=false;
      if(event.shiftKey||event.altKey||event.ctrlKey||event.isComposing||!canShow()){suppressed=true;return;}
      timer=setTimeout(()=>{if(held&&!suppressed)show(true);},500);
    },true);
    document.addEventListener('keyup',event=>{if(event.key==='Meta'||!event.metaKey)cancel(true);},true);
  }
  window.addEventListener('blur',()=>cancel(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel(true);});
  document.addEventListener('compositionstart',()=>cancel(),true);
  document.addEventListener('pointerdown',()=>cancel(),true);
  return {show};
}
