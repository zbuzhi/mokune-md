import {markdownLanguage} from '@codemirror/lang-markdown';
import {mathSpans} from './math-model.mjs';
const parent=path=>path.split('/').slice(0,-1).join('/');
export function relocatedPath(path,from,to){return path===from?to:path.startsWith(from+'/')?to+path.slice(from.length):path;}
function normalize(path){const parts=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(part);}return parts.join('/');}
function relative(from,to){const a=parent(from).split('/').filter(Boolean),b=to.split('/');let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return [...a.slice(i).map(()=> '..'),...b.slice(i)].join('/')||to.split('/').at(-1);}
const encodePath=path=>path.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
function replacement(value,path,from,to){
 if(!value||/^(?:[a-z][\w+.-]*:|\/|#|\?)/i.test(value))return null;
 const cut=value.search(/[?#]/),suffix=cut<0?'':value.slice(cut),url=cut<0?value:value.slice(0,cut);let decoded;
 try{decoded=decodeURIComponent(url.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g,'$1'));}catch{return null;}
 if(decoded.includes('\0'))return null;
 const target=normalize(parent(path)+'/'+decoded);if(target===null)return null;
 const nextPath=relocatedPath(path,from,to),nextTarget=relocatedPath(target,from,to);
 if(nextPath===path&&nextTarget===target)return null;
 // Keep original spelling when a whole folder moves and their relationship stays the same.
 const oldRelative=relative(path,target),nextRelative=relative(nextPath,nextTarget);if(oldRelative===nextRelative)return null;
 return encodePath(nextRelative)+suffix;
}
export function maintainLinks(raw,path,from,to){
 const changes=[],front=/^(?:\ufeff)?---[ \t]*\r?\n[\s\S]*?^(?:---|\.\.\.)[ \t]*\r?$/m.exec(raw),frontEnd=front?.index===0?front[0].length:0,math=mathSpans(raw);
 const add=(start,end)=>{let value=raw.slice(start,end),angle=value.startsWith('<')&&value.endsWith('>');if(angle){start++;end--;value=value.slice(1,-1);}const insert=replacement(value,path,from,to);if(insert!==null&&insert!==value)changes.push({from:start,to:end,insert});};
 markdownLanguage.parser.parse(raw).iterate({enter(node){
  if(node.name!=='Document'&&node.from<frontEnd||math.some(span=>span.from<=node.from&&span.to>=node.to)||['FencedCode','CodeBlock','InlineCode','Autolink'].includes(node.name))return false;
  if(node.name==='URL'){add(node.from,node.to);return false;}
  if(['HTMLBlock','HTMLTag'].includes(node.name)){
   const html=raw.slice(node.from,node.to);if(/<(?:script|style|pre|code)\b/i.test(html))return false;
   const tags=/<!--[\s\S]*?-->|<(?:a|img|source|video|audio)\b[^>]*>/gi;let tag;
   while((tag=tags.exec(html))){if(tag[0].startsWith('<!--'))continue;const attrs=/(?<![\w:-])(?:href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;let attr;while((attr=attrs.exec(tag[0]))){const value=attr[1]??attr[2]??attr[3],at=attr.index+attr[0].indexOf('=')+1,segment=attr[0].slice(attr[0].indexOf('=')+1),start=node.from+tag.index+at+segment.indexOf(value);add(start,start+value.length);}}
   return false;
  }
 }});
 changes.sort((a,b)=>a.from-b.from);let result=raw;for(const change of [...changes].reverse())result=result.slice(0,change.from)+change.insert+result.slice(change.to);
 return {raw:result,changes};
}
