import {markdownLanguage} from '@codemirror/lang-markdown';
import {collectHeadings} from './outline-model.mjs';
export function linkAt(text,position){let result;const references=new Map(),tree=markdownLanguage.parser.parse(text),normalize=label=>label.trim().replace(/\s+/g,' ').toLowerCase();tree.iterate({enter(node){if(node.name==='LinkReference'){const label=node.node.getChild('LinkLabel'),url=node.node.getChild('URL');if(label&&url)references.set(normalize(text.slice(label.from+1,label.to-1)),text.slice(url.from,url.to));return false;}}});tree.iterate({enter(node){if(['FencedCode','CodeBlock','Image'].includes(node.name))return false;if(['Link','Autolink'].includes(node.name)&&node.from<=position&&node.to>=position){const url=node.node.getChild('URL'),label=node.node.getChild('LinkLabel'),marks=node.node.getChildren('LinkMark'),title=marks.length>1?text.slice(marks[0].to,marks[1].from):'';result=url?text.slice(url.from,url.to):references.get(normalize(label?text.slice(label.from+1,label.to-1):title));return false;}}});return result;}
export function headingAnchors(text){
 const used=new Set();return collectHeadings(text).map(heading=>{
  const base=heading.title.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s/g,'-');let id=base,index=0;
  while(used.has(id))id=base+'-'+(++index);used.add(id);return {...heading,id};
 });
}
export function anchorPosition(text,fragment){let target;try{target=decodeURIComponent(fragment.replace(/^#/,''));}catch{return null;}if(!target)return 0;return headingAnchors(text).find(heading=>heading.id===target)?.from??null;}
