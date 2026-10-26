import {exportLayout,exportPageCSS} from './export-layout.mjs';
import {themeVariables,contentWidth} from './theme-style.mjs';
const {createMarkdownParser,safeHTML,safeInlineHTML}=window.mokuneRenderShared;
import {imageStyle} from './image-properties.mjs';
import {imageLocation} from './preview-model.mjs';
import css from './export.css';
import extensionCSS from './extensions.css';
const fontCSS=window.mokuneMath.fontCSS;

const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uniqueSVG(fragment,prefix) {
  const result=fragment.cloneNode(true),ids=[...result.querySelectorAll('[id]')].map(el=>[el.id,prefix+el.id]);
  for(const element of result.querySelectorAll('*')) {
    for(const attr of [...element.attributes]) {
      if(attr.name==='id'){element.id=prefix+attr.value;continue;}
      let value=attr.value;for(const [old,next]of ids)value=value.replaceAll(`#${old}`,`#${next}`);element.setAttribute(attr.name,value);
    }
    if(element.tagName.toLowerCase()==='style')for(const [old,next]of ids)element.textContent=element.textContent.replaceAll(`#${old}`,`#${next}`);
  }
  return result;
}
export async function renderDocument(snapshot,{renderScientific,resolveImages,highlightCode},{notesOnly=false,preview=false}={}) {
  const md=createMarkdownParser({html:true}),env={},allTokens=md.parse(snapshot.text,env),noteStart=allTokens.findIndex(token=>token.type==='footnote_block_open'),tokens=notesOnly?(noteStart<0?[]:allTokens.slice(noteStart)):allTokens,tasks=[],images=[],lines=snapshot.text.split('\n');
  // Match real Markdown headings by source line, so headings inside raw HTML
  // cannot consume another heading's anchor. Use exactly the editor's IDs.
  const starts=[0];for(const line of lines)starts.push(starts.at(-1)+line.length+1);
  const headingIDs=new Map();for(const heading of window.mokuneRenderShared.headingAnchors(snapshot.text)){
    let low=0,high=starts.length;while(low<high){const mid=(low+high)>>1;if(starts[mid]<=heading.from)low=mid+1;else high=mid;}
    headingIDs.set(low-1,heading.id);
  }
  for(const token of allTokens)if(token.type==='heading_open'&&token.map&&headingIDs.has(token.map[0]))token.attrSet('id',headingIDs.get(token.map[0]));
  let tableDepth=0;
  for(const token of tokens){if(token.type==='table_open')tableDepth++;if(token.type==='table_close')tableDepth--;if(tableDepth&&token.children)for(const child of token.children)if(child.type==='mokune_math'){child.type='text';child.content=child.markup;}}
  const root=document.createElement('article');root.className='document'+(snapshot.theme.dark?' theme-dark':'');
  md.renderer.rules.html_block=(tokens,index)=>safeHTML(tokens[index].content);
  md.renderer.rules.html_inline=(tokens,index)=>safeInlineHTML(tokens[index].content);
  // Placeholder nodes originate only from these controlled renderers. User HTML
  // is escaped by markdown-it, and document text never becomes a script.
  const placeholder=(kind,source,display)=>{const id=tasks.length;tasks.push({kind,source,display});return `<${display?'section':'span'} data-render="${id}" class="${display?kind==='math'?'export-math':'export-diagram':'export-inline-math'}"></${display?'section':'span'}>`;};
  md.renderer.rules.mokune_math=(list,index)=>placeholder('math',list[index].content,list[index].meta.display);
  md.renderer.rules.fence=(list,index)=>{
    const token=list[index],language=token.info.trim().split(/\s+/)[0].toLowerCase();
    const closing=lines[(token.map?.[1]||0)-1]?.match(/^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})[ \t]*$/),complete=closing&&closing[1][0]===token.markup[0]&&closing[1].length>=token.markup.length;
    if(complete&&['math','tex','latex','mermaid'].includes(token.info.trim().toLowerCase()))return placeholder(language==='mermaid'?'mermaid':'math',token.content.replace(/\n$/,''),true);
    const id=tasks.length;tasks.push({kind:'code',source:token.content,language});return `<pre><code data-render="${id}"></code></pre>`;
  };
  md.renderer.rules.image=(list,index)=>{
    const token=list[index],reference=token.attrGet('src')||'',location=imageLocation(reference,snapshot.imageBase);
    if(location.kind==='unsaved')throw new Error('请先保存文稿，再导出相对路径图片。');
    if(location.kind==='blocked')throw new Error(`图片地址无法导出：${reference}`);
    if(location.kind==='remote'&&!snapshot.permissions.includes(location.url)&&!preview)throw new Error('请先在预览中点击加载远程图片，再导出。');
    const attributes=` style="${imageStyle(token.meta?.dimensions)}"${token.attrGet('title')?` title="${escape(token.attrGet('title'))}"`:''}`;
    if(preview)return location.kind==='remote'&&!snapshot.permissions.includes(location.url)?`<button class=footnote-remote-image data-remote-image="${escape(location.url)}">加载远程图片 · ${escape(location.host)}</button>`:`<img src="${escape(location.url)}" alt="${escape(token.content)}"${attributes} referrerpolicy="no-referrer">`;
    const id=images.length;images.push({reference,url:location.url,kind:location.kind});
    return `<img data-image="${id}" alt="${escape(token.content)}"${attributes}>`;
  };
  root.innerHTML=md.renderer.render(tokens,md.options,env);
  // HTML images use the same scoped path, remote consent and embedding rules.
  for(const image of root.querySelectorAll('img:not([data-image])')){
    if(preview&&image.hasAttribute('referrerpolicy'))continue;
    const reference=image.dataset.htmlSrc||image.getAttribute('src')||'',location=imageLocation(reference,snapshot.imageBase);delete image.dataset.htmlSrc;
    image.referrerPolicy='no-referrer';
    if(!['local','remote'].includes(location.kind))throw new Error('HTML 图片地址无法解析：'+reference);
    if(location.kind==='remote'&&!snapshot.permissions.includes(location.url)){
      if(!preview)throw new Error('请先在预览中加载远程图片，再导出。');
      const control=document.createElement('button');control.dataset.remoteImage=location.url;control.textContent='加载远程图片 · '+location.host;image.replaceWith(control);continue;
    }
    if(preview)image.src=location.url;else{const id=images.length;images.push({reference,url:location.url,kind:location.kind});image.removeAttribute('src');image.dataset.image=id;}
  }
  for(let index=0;index<tasks.length;index++) {
    const task=tasks[index];if(task.skip)continue;
    const node=root.querySelector(`[data-render="${index}"]`);if(!node)continue;
    if(task.source.length>(task.kind==='mermaid'?20000:task.kind==='code'?1000000:8000))throw new Error('片段超过预览上限，请缩小片段后导出。');
    try {
      if(task.kind==='code')node.append(await highlightCode(task.source,task.language));
      else {const result=await renderScientific(task.kind,task.source,task.display,snapshot.theme);node.append(task.kind==='mermaid'?uniqueSVG(result,`export-${index}-`):result.cloneNode(true));}
    } catch(error){throw new Error(`${task.kind==='mermaid'?'Mermaid 图表':task.kind==='code'?'代码':'公式'}无法导出：${String(error.message||error).slice(0,180)}`);}
    node.removeAttribute('data-render');
  }
  const assets=await resolveImages(images,snapshot.imageBase);
  for(const image of root.querySelectorAll('[data-image]')) {
    const data=assets[Number(image.dataset.image)];
    if(typeof data!=='string'||!/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|heic);base64,/i.test(data))throw new Error('图片无法内嵌，导出已停止。');
    image.src=data;image.removeAttribute('data-image');
  }
  await Promise.all([...root.querySelectorAll('img')].map(image=>Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('图片解码超时，导出已停止。')),15000))])));
  for(const image of root.querySelectorAll('img[title]')){
    const parent=image.parentElement,title=image.getAttribute('title');
    if(!title||parent?.tagName!=='P'||parent.children.length!==1||parent.textContent.trim())continue;
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');figure.className='document-image';caption.textContent=title;parent.replaceWith(figure);figure.append(image,caption);
  }
  for(const link of root.querySelectorAll('a')){link.rel='noreferrer noopener';if(!/^(https?:|mailto:|#)/i.test(link.getAttribute('href')||''))link.removeAttribute('href');}
  return root;
}
async function build(snapshot,dependencies,options={}) {
  const root=await renderDocument(snapshot,dependencies,options);
  if(options.preview)return root;
  const variables=Object.entries(themeVariables(snapshot.theme)).map(([key,value])=>`${key}:${value}`).join(';');
  const styles=`:root{${variables};--font-size:${Number(snapshot.fontSize)||17}px;--line-width:${contentWidth(snapshot.width)};color-scheme:${snapshot.theme.dark?'dark':'light'}}\n${fontCSS}\n${css}\n${extensionCSS}\n/*${(snapshot.theme.attribution||'').replace(/\*\//g,'* /')}*/`;
  const layout=exportLayout({exportPaper:snapshot.layout?.paper,exportOrientation:snapshot.layout?.orientation,exportMargin:snapshot.layout?.margin});
  const title=snapshot.name.replace(/\.(md|markdown)$/i,'');
  const csp="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="generator" content="Mokune MD"><meta name="mokune-paper" content="${layout.paper}-${layout.orientation}"><meta name="mokune-margin" content="${layout.margin}"><title>${escape(title)}</title><style>${(styles+'\n'+exportPageCSS(layout)).replace(/<\/style/gi,'<\\/style')}</style></head><body data-theme="${escape(snapshot.theme.id)}">${root.outerHTML}</body></html>`;
}
window.mokuneExport={build,renderDocument};
