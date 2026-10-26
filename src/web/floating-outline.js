import {EditorView} from '@codemirror/view';
import {isComposing} from './composition.js';
import {collectHeadings,headingAt} from './outline-model.mjs';

export function createFloatingOutline({getView,settings,persist}) {
  const root=document.getElementById('floating-outline'),mini=document.getElementById('outline-mini'),panel=document.getElementById('outline-panel'),nav=document.getElementById('outline');
  const pin=document.getElementById('outline-pin'),count=document.getElementById('outline-count'),miniRows=document.getElementById('outline-mini-rows');
  let headings=[],rendered=false,active=-1,source=null,enterTimer,leaveTimer,expanded=false,attached=null,scrollHandler,keyboardFocus=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function expand(value) {
    document.getElementById('editor').dataset.outlinePinned=String(!!settings.outlinePinned);
    clearTimeout(enterTimer);clearTimeout(leaveTimer);
    if(value)renderHeadings();
    if(expanded===value)return;
    expanded=value;root.classList.toggle('expanded',value);mini.setAttribute('aria-expanded',String(value));panel.inert=!value;panel.setAttribute('aria-hidden',String(!value));
    if(value)requestAnimationFrame(()=>{const item=nav.querySelector('[aria-current="location"]');if(!item)return;const a=item.getBoundingClientRect(),b=nav.getBoundingClientRect();if(a.top<b.top)nav.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)nav.scrollTop+=a.bottom-b.bottom;});
  }
  function preferences() {
    const position=['left','right','off'].includes(settings.outlinePosition)?settings.outlinePosition:'right';
    root.dataset.side=position;root.hidden=position==='off'||!headings.length;
    document.getElementById('editor').dataset.outlineSide=root.hidden?'off':position;
    document.getElementById('editor').dataset.outlinePinned=String(!!settings.outlinePinned);
    pin.setAttribute('aria-pressed',String(!!settings.outlinePinned));pin.title=settings.outlinePinned?'取消固定大纲':'固定展开';
    pin.setAttribute('aria-label',pin.title);
    document.querySelectorAll('[data-outline-position]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.outlinePosition===position)));
    expand(!!settings.outlinePinned);
  }
  function compact() {
    miniRows.replaceChildren();
    const start=Math.max(0,Math.min(active-7,headings.length-18)),end=Math.min(headings.length,start+18);
    for(let index=start;index<end;index++) {
      const heading=headings[index],row=document.createElement('span');row.className='outline-mini-row'+(index===active?' active':'');row.style.setProperty('--depth',heading.level-1);
      const line=document.createElement('span');line.className='mini-rule';const title=document.createElement('span');title.className='mini-title';title.textContent=heading.title;
      row.append(line,title);miniRows.append(row);
    }
    document.getElementById('outline-mini-count').textContent=String(headings.length).padStart(2,'0');
  }
  function setActive(position) {
    const index=headingAt(headings,position);if(index===active)return;active=index;
    [...nav.querySelectorAll('button')].forEach((button,i)=>{if(i===active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');});compact();
  }
  function locate(index) {
    const view=getView(),heading=headings[index];if(!view||!heading||isComposing(view))return;
    view.dispatch({selection:{anchor:heading.from}});view.focus();setActive(heading.from);
    view.requestMeasure({read:()=>({top:Math.max(0,view.lineBlockAt(heading.from).top-36),start:view.scrollDOM.scrollTop}),write:({top,start})=>{
      if(view!==getView())return;
      if(reduced.matches||Math.abs(top-start)>1800)view.scrollDOM.scrollTo({top,behavior:'auto'});
      else view.scrollDOM.scrollTo({top,behavior:'smooth'});
    }});
  }
  function renderHeadings(){
    if(rendered)return;rendered=true;
    const fragment=document.createDocumentFragment();
    const minimum=Math.min(...headings.map(heading=>heading.level),1);
    headings.forEach((heading,index)=>{
      const button=document.createElement('button');button.type='button';button.className='outline-heading';button.style.setProperty('--depth',heading.level-minimum);button.title=heading.title;
      const level=document.createElement('span');level.className='outline-level';level.textContent='H'+heading.level;
      const title=document.createElement('span');title.className='outline-title';title.textContent=heading.title;button.append(level,title);button.addEventListener('click',()=>locate(index));fragment.append(button);
    });
    nav.replaceChildren(fragment);
    [...nav.querySelectorAll('button')].forEach((button,i)=>{if(i===active)button.setAttribute('aria-current','location');});
  }
  function refresh(text) {
    if(text===source)return;source=text;headings=collectHeadings(text);active=-1;nav.replaceChildren();
    rendered=false;if(expanded)renderHeadings();
    count.textContent=`${headings.length} 个标题`;root.hidden=settings.outlinePosition==='off'||!headings.length;
    document.getElementById('editor').dataset.outlineSide=root.hidden?'off':settings.outlinePosition;
    setActive(getView()?.state.selection.main.head||0);
  }
  function measure() {
    const view=getView();if(!view||isComposing(view))return;
    view.requestMeasure({key:root,read:()=>{const scroller=view.scrollDOM;if(scroller.scrollTop>0&&scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4)return view.state.doc.length;return view.lineBlockAtHeight(Math.max(0,scroller.getBoundingClientRect().top+60-view.documentTop)).from;},write:position=>{if(view===getView()&&!isComposing(view))setActive(position);}});
  }
  function attach(view) {
    if(attached&&scrollHandler)attached.scrollDOM.removeEventListener('scroll',scrollHandler);
    attached=view;source=null;scrollHandler=()=>measure();view.scrollDOM.addEventListener('scroll',scrollHandler,{passive:true});refresh(view.state.doc.toString());
  }
  function hoverOpen(){clearTimeout(leaveTimer);clearTimeout(enterTimer);if(!expanded)enterTimer=setTimeout(()=>expand(true),45);}
  root.addEventListener('pointerenter',hoverOpen);mini.addEventListener('pointerenter',hoverOpen);
  root.addEventListener('pointerleave',()=>{clearTimeout(enterTimer);if(!settings.outlinePinned)leaveTimer=setTimeout(()=>{if(!keyboardFocus||!root.contains(document.activeElement))expand(false);},210);});
  root.addEventListener('pointerdown',()=>{keyboardFocus=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Tab')keyboardFocus=true;},true);
  root.addEventListener('focusin',()=>expand(true));
  root.addEventListener('focusout',()=>{if(!settings.outlinePinned)leaveTimer=setTimeout(()=>{if(!root.contains(document.activeElement)&&!root.matches(':hover'))expand(false);},160);});
  mini.addEventListener('click',()=>expand(true));
  pin.addEventListener('click',()=>{settings.outlinePinned=!settings.outlinePinned;persist();preferences();if(!settings.outlinePinned)expand(true);});
  document.getElementById('outline-close').addEventListener('click',()=>{settings.outlinePinned=false;persist();pin.setAttribute('aria-pressed','false');if(!isComposing(getView()))getView()?.focus();expand(false);});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!isComposing(getView())){event.preventDefault();event.stopPropagation();settings.outlinePinned=false;pin.setAttribute('aria-pressed','false');persist();getView()?.focus();expand(false);}});
  document.addEventListener('pointerdown',event=>{if(expanded&&!settings.outlinePinned&&!root.contains(event.target))expand(false);});
  document.querySelectorAll('[data-outline-position]').forEach(button=>button.addEventListener('click',()=>{settings.outlinePosition=button.dataset.outlinePosition;persist();preferences();}));
  preferences();return {refresh,attach,preferences,selection:position=>setActive(position),measure,open:()=>{if(settings.outlinePosition==='off'){settings.outlinePosition='right';persist();preferences();}expand(true);}};
}
