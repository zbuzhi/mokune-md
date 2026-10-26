import {markdownLanguage} from '@codemirror/lang-markdown';
import MarkdownIt from 'markdown-it';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {mathSpans} from './math-model.mjs';
const unescape=new MarkdownIt().utils.unescapeAll;
const label=value=>value.trim().replace(/\s+/g,' ').toUpperCase();
export function resourceReferences(raw){
 const tree=markdownLanguage.parser.parse(raw),refs=[],definitions=new Map(),front=/^(?:\ufeff)?---[ \t]*\r?\n[\s\S]*?^(?:---|\.\.\.)[ \t]*\r?$/m.exec(raw),frontEnd=front?.index===0?front[0].length:0,math=mathSpans(raw);
 const blocked=n=>n.name!=='Document'&&n.from<frontEnd||['FencedCode','CodeBlock','InlineCode'].includes(n.name)||math.some(span=>span.from<=n.from&&span.to>=n.to);
 tree.iterate({enter(n){if(blocked(n))return false;if(n.name==='LinkReference'){const key=n.node.getChild('LinkLabel'),url=n.node.getChild('URL');if(key&&url)definitions.set(label(raw.slice(key.from+1,key.to-1)),raw.slice(url.from,url.to));return false;}}});
 const add=(reference,from,kind)=>{if(reference?.startsWith('<')&&reference.endsWith('>'))reference=reference.slice(1,-1);refs.push({reference:reference==null?null:unescape(reference),from,line:raw.slice(0,from).split(/\r\n|\r|\n/).length,kind});};
 tree.iterate({enter(n){
  if(blocked(n))return false;
  if(['Link','Image'].includes(n.name)&&!n.node.getChild('URL')){const key=n.node.getChild('LinkLabel'),marks=n.node.getChildren('LinkMark'),text=key?raw.slice(key.from+1,key.to-1):marks[1]?raw.slice(marks[0].to,marks[1].from):'';add(definitions.get(label(text||raw.slice(marks[0]?.to??n.from,marks[1]?.from??n.to)))??null,n.from,n.name==='Image'?'image':'link');return false;}
  if(n.name==='URL'){add(raw.slice(n.from,n.to),n.from,n.node.parent?.name==='Image'?'image':'link');return false;}
  if(['HTMLBlock','HTMLTag'].includes(n.name)){
   const html=raw.slice(n.from,n.to);if(/<(?:script|style|pre|code)\b/i.test(html))return false;const tags=/<!--[\s\S]*?-->|<(?:a|img|source|video|audio|object|embed)\b[^>]*>/gi;let tag;
   while((tag=tags.exec(html))){if(tag[0].startsWith('<!--'))continue;const attributes=/(?<![\w:-])(?:href|src|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;let attr;while((attr=attributes.exec(tag[0]))){const value=attr[1]??attr[2]??attr[3];add(value,n.from+tag.index+attr.index,/^<img\b/i.test(tag[0])?'image':'link');}}
   return false;
  }
 }});return refs;
}
function normalize(path){const parts=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(part);}return '/'+parts.join('/');}
export function resourceTarget(reference,documentPath){
 if(!reference||/^(?:#|\?|\/\/)/.test(reference))return null;
 if(/^file:/i.test(reference)){try{const url=new URL(reference);if(url.hostname&&url.hostname!=='localhost')return null;return normalize(decodeURIComponent(url.pathname));}catch{return null;}}
 if(/^[a-z][\w+.-]*:/i.test(reference))return null;
 const end=reference.search(/[?#]/),path=end<0?reference:reference.slice(0,end);let decoded;try{decoded=decodeURIComponent(path);}catch{return null;}
 if(decoded.includes('\0'))return null;if(decoded.startsWith('/'))return normalize(decoded);if(!documentPath)return null;
 return normalize(documentPath.slice(0,documentPath.lastIndexOf('/'))+'/'+decoded);
}
export function classifyResources(inventory){
 const key=path=>inventory.caseSensitive===false?path.normalize('NFC').toLowerCase():path.normalize('NFC'),existing=new Set(inventory.paths.map(key)),usages=new Map(),missing=[],root=inventory.root.replace(/\/$/,'');
 for(const doc of inventory.documents){
  for(const ref of resourceReferences(doc.raw)){
   if(ref.reference===null){if(!doc.historical)missing.push({...ref,document:doc.name,documentID:doc.id,path:doc.path,status:'未定义的引用'});continue;}
   const target=resourceTarget(ref.reference,doc.path);if(!target)continue;
   const use={document:doc.name,documentID:doc.id,path:doc.path,line:ref.line,reference:ref.reference,historical:!!doc.historical};
   const targetKey=key(target);if(!usages.has(targetKey))usages.set(targetKey,[]);if(!usages.get(targetKey).some(old=>old.document===use.document&&old.path===use.path&&old.line===use.line&&old.reference===use.reference&&old.historical===use.historical))usages.get(targetKey).push(use);
   if(!doc.historical&&target.startsWith(root+'/')&&!existing.has(key(target)))missing.push({...use,kind:ref.kind,status:'文件不存在'});
  }
 }
 const assets=inventory.assets.map(asset=>{
  const references=usages.get(key(asset.path))||[];
  // Retain ambiguous mentions (YAML, CSS, code examples, unknown syntax, untitled drafts).
  const possible=!references.length&&inventory.documents.some(doc=>key(doc.raw).includes(key(asset.name))||key(doc.raw).includes(key(encodeURIComponent(asset.name))));
  const unused=!references.length&&!possible&&asset.eligible&&!asset.open;
  return {...asset,references,possible,unused};
 });return {assets,missing,unused:assets.filter(asset=>asset.unused).map(asset=>asset.path)};
}
export function attachmentMarkdown(name,reference){const text=name.replace(/[\\`*_{}\[\]<>!|]/g,'\\$&');if(/[\r\n\0]/.test(reference)||!reference.startsWith('assets/'))throw new Error('附件路径无效');return `[${text}](${reference})`;}

export function resourceHistory(tabs,unlock=state=>state){
 const documents=[];let budget=8*1024*1024,steps=0,complete=true;
 outer:for(const tab of tabs){for(const [command,depth] of [[undo,undoDepth],[redo,redoDepth]]){
  let state=unlock(tab.state);while(depth(state)>0){
   if(++steps>200){complete=false;break outer;}
   const ok=command({state,dispatch:transaction=>{state=transaction.state;}});if(!ok){complete=false;break outer;}
   const raw=state.doc.toString();budget-=raw.length*2;if(budget<0){complete=false;break outer;}
   documents.push({id:tab.id,path:tab.path,name:'撤销历史 · '+tab.name,raw,historical:true});
  }
 }}return {documents,complete};
}
