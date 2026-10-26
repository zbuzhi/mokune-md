import {languages} from '@codemirror/language-data';
import {classHighlighter,highlightTree} from '@lezer/highlight';
import {loadMathEngine} from './scientific-preview.js';
import {createMarkdownParser} from './extended-markdown.mjs';
import {safeHTML,safeInlineHTML} from './html-preview.js';
import DOMPurify from 'dompurify';
import {headingAnchors} from './link-model.mjs';
// These are the same parser/sanitizer functions already used by live preview.
// Deferred engines share their code, while creating independent parser state.
window.mokuneRenderShared=Object.freeze({createMarkdownParser,headingAnchors,safeHTML,safeInlineHTML,createSanitizer:()=>DOMPurify(window)});
let enginePromise;
export function loadExportEngine() {
  if(!enginePromise)enginePromise=loadMathEngine().then(()=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='export-engine.js';
    script.onload=()=>resolve(window.mokuneExport);script.onerror=()=>{script.remove();reject(new Error('本地导出组件未能加载。'));};document.head.append(script);
  })).catch(error=>{enginePromise=null;throw error;});
  return enginePromise;
}
export async function highlightCode(source,name) {
  const fragment=document.createDocumentFragment(),language=languages.find(l=>l.name.toLowerCase()===name||l.alias.some(alias=>alias.toLowerCase()===name));
  if(!language||source.length>100000){fragment.append(document.createTextNode(source));return fragment;}
  const support=await language.load();let pos=0;
  highlightTree(support.language.parser.parse(source),classHighlighter,(from,to,classes)=>{
    if(from>pos)fragment.append(document.createTextNode(source.slice(pos,from)));
    const token=document.createElement('span');token.className=classes;token.textContent=source.slice(from,to);fragment.append(token);pos=to;
  });
  if(pos<source.length)fragment.append(document.createTextNode(source.slice(pos)));return fragment;
}
