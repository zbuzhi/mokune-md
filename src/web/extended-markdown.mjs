import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import {imageAttributePlugin} from './image-properties.mjs';
import {parseDocument} from 'yaml';
import {mathSpans,inlineMathPrefix} from './math-model.mjs';
import {calloutPlugin} from './callouts.mjs';

export const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Recognition is deliberately independent of YAML validity. Invalid metadata is
// still metadata, with its complete source displayed rather than discarded.
export function frontMatter(text) {
  if(!/^---[ \t]*\n/.test(text))return null;
  const closing=/^(?:---|\.\.\.)[ \t]*$/gm;closing.lastIndex=text.indexOf('\n')+1;
  const end=closing.exec(text);if(!end)return null;
  const from=0,to=end.index+end[0].length,source=text.slice(text.indexOf('\n')+1,end.index);
  let entries=[],error='';
  try {
    if(source.length>65536)throw new Error('元数据超过 64 KB，显示源码。');
    const doc=parseDocument(source,{schema:'core',uniqueKeys:true,customTags:[]});
    if(doc.errors.length||doc.warnings.length)throw new Error('YAML 格式或标签需要检查，显示源码。');
    const value=doc.toJS({mapAsMap:true,maxAliasCount:30});
    if(value!=null&&!(value instanceof Map))throw new Error('Front Matter 需要 YAML 键值映射，显示源码。');
    const printable=(value,depth=0)=>{if(depth>8)return '…';if(value instanceof Map)return [...value].map(([k,v])=>`${printable(k,depth+1)}: ${printable(v,depth+1)}`).join(' · ');if(Array.isArray(value))return value.map(v=>printable(v,depth+1)).join(' · ');return value==null?'—':String(value);};
    entries=[...(value||[])].map(([key,value])=>[printable(key),printable(value)]);
  } catch(reason){error=reason.message||'无法解析 YAML，显示源码。';}
  return {from,to,source,entries,error};
}
export function metadataHTML(meta) {
  return `<section class="front-matter" aria-label="文稿信息"><div class="metadata-label">文稿信息 <span>YAML</span></div>${meta.error?`<p class="metadata-error">${escapeHTML(meta.error)}</p><pre>${escapeHTML(meta.source)}</pre>`:`<dl>${meta.entries.map(([key,value])=>`<div><dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>`}</section>`;
}
export function createMarkdownParser({html=false,frontMatterEnabled=true}={}) {
  const md=new MarkdownIt({html,linkify:true,typographer:false}).use(footnote).use(imageAttributePlugin).use(calloutPlugin);
  md.linkify.set({fuzzyLink:true});
  // Named notes are portable to common Markdown tools. Inline ^[...] remains
  // literal until source-range tracking for that extension is implemented.
  md.inline.ruler.disable('footnote_inline');
  md.renderer.rules.footnote_caption=(tokens,index)=>`[${tokens[index].meta.id+1}]`;
  const validate=md.validateLink.bind(md);md.validateLink=url=>/^file:/i.test(url)||validate(url);
  md.block.ruler.before('hr','mokune-front-matter',(state,line,end,silent)=>{
    if(!frontMatterEnabled||line!==0||state.parentType!=='root')return false;
    const meta=frontMatter(state.src);if(!meta)return false;if(silent)return true;
    const token=state.push('mokune_metadata','',0);token.block=true;token.meta=meta;
    state.line=state.src.slice(0,meta.to).split('\n').length;token.map=[0,state.line];state.env.metadata=meta;return true;
  },{alt:['paragraph','reference']});
  md.renderer.rules.mokune_metadata=(tokens,index)=>metadataHTML(tokens[index].meta);
  // GFM task markers apply only to the first paragraph of a list item. Use
  // static accessible output: exported documents must never execute controls.
  md.core.ruler.after('inline','mokune-task-lists',state=>{
    for(let i=2;i<state.tokens.length;i++){
      const token=state.tokens[i],item=state.tokens[i-2];
      if(token.type!=='inline'||state.tokens[i-1].type!=='paragraph_open'||item.type!=='list_item_open')continue;
      const text=token.children?.[0];if(text?.type!=='text')continue;
      const match=text.content.match(/^\[([ xX])\](?:[ \t]+|$)/);if(!match)continue;
      text.content=text.content.slice(match[0].length);item.attrJoin('class','task-list-item');
      const marker=new state.Token('mokune_task','span',0);marker.meta={checked:match[1]!==' '};token.children.unshift(marker);
    }
  });
  md.renderer.rules.mokune_task=(tokens,index)=>{const checked=tokens[index].meta.checked;return `<span class="task-marker" role="checkbox" aria-checked="${checked}" aria-label="${checked?'已完成':'未完成'}">${checked?'✓':''}</span> `;};
  md.inline.ruler.before('escape','mokune-math',(state,silent)=>{
    if(state.linkLevel||!['$','\\'].includes(state.src[state.pos]))return false;
    const span=inlineMathPrefix(state.src.slice(state.pos));if(!span)return false;
    if(!silent){const token=state.push('mokune_math','',0);token.content=span.source;token.markup=state.src.slice(state.pos,state.pos+span.to);token.meta={display:false};}
    state.pos+=span.to;return true;
  });
  md.block.ruler.before('fence','mokune-display',(state,line,end,silent)=>{
    if(state.sCount[line]-state.blkIndent>=4)return false;
    const start=state.bMarks[line]+state.tShift[line],tail=state.src.slice(start,state.bMarks[end]??state.src.length);
    if(!tail.startsWith('$$')&&!tail.startsWith('\\['))return false;
    const span=mathSpans(tail).find(s=>s.from===0&&s.display);if(!span)return false;if(silent)return true;
    const token=state.push('mokune_math','',0);token.content=span.source;token.block=true;token.meta={display:true};state.line=line+tail.slice(0,span.to).split('\n').length;token.map=[line,state.line];return true;
  },{alt:['paragraph','reference','blockquote','list']});
  // Retain definition source ranges before the footnote plugin relocates its
  // tokens. Positions always refer to the original, normalized document.
  md.core.ruler.before('inline','mokune-note-ranges',state=>{
    const lines=state.src.split('\n'),starts=[0];for(let i=0;i<lines.length;i++)starts.push(starts[i]+lines[i].length+1);
    state.env.noteDefinitions=[];let current=null;
    for(const token of state.tokens){
      if(token.type==='footnote_reference_open')current={label:token.meta.label,from:null,to:null};
      else if(token.type==='footnote_reference_close'){if(current?.from!=null)state.env.noteDefinitions.push(current);current=null;}
      else if(current&&token.map){current.from??=starts[token.map[0]];current.to=Math.min(state.src.length,starts[token.map[1]]-1);}
    }
    state.env.noteReferences=[];state.env.sourceStarts=starts;state.env.sourceLines=lines;
  });
  md.core.ruler.at('inline',state=>{
    for(const token of state.tokens)if(token.type==='inline'){
      state.env.currentInline=token;state.md.inline.parse(token.content,state.md,state.env,token.children);
    }
    delete state.env.currentInline;
  });
  md.inline.ruler.before('footnote_ref','mokune-note-position',(state,silent)=>{
    if(silent||!state.env.currentInline)return false;
    const match=state.src.slice(state.pos).match(/^\[\^([^\] \n]+)\]/);if(!match||state.env.footnotes?.refs?.[':'+match[1]]===undefined)return false;
    const parent=state.env.currentInline;if(!parent.map)return false;
    const before=state.src.slice(0,state.pos),row=before.split('\n').length-1,col=before.length-(before.lastIndexOf('\n')+1),lineNumber=parent.map[0]+row;
    const inlineLine=state.src.split('\n')[row],original=state.env.sourceLines[lineNumber]||'',offset=original.indexOf(inlineLine);
    if(offset>=0){const from=state.env.sourceStarts[lineNumber]+offset+col;state.env.noteReferences.push({from,to:from+match[0].length,label:match[1]});}
    return false;
  });
  return md;
}
const parser=createMarkdownParser();
export function extendedModel(text) {
  if(!text.startsWith('---')&&!text.includes('[^')&&!text.includes('[!'))return {metadata:null,definitions:[],references:[],notes:[],callouts:[]};
  const env={},tokens=parser.parse(text,env);
  const references=(env.noteReferences||[]).map(ref=>({...ref,id:env.footnotes.refs[':'+ref.label]}));
  const notes=env.footnotes?.list||[];
  return {metadata:env.metadata||null,definitions:env.noteDefinitions||[],references,notes,tokens,callouts:env.callouts||[]};
}
// Cache only the most recent documents, and release their parsed token graphs.
const models=new WeakMap();
export function documentExtensions(doc){let model=models.get(doc);if(!model){model=extendedModel(doc.toString());models.set(doc,model);}return model;}
export function extensionRanges(model){return [...(model.metadata?[model.metadata]:[]),...model.definitions];}
