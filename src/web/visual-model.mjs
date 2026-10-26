import {markdownLanguage} from '@codemirror/lang-markdown';
import MarkdownIt from 'markdown-it';
import {tableRowCells as tableCells} from './preview-model.mjs';
import {frontMatter} from './extended-markdown.mjs';
import {imageAttributes,dimensionSource,imageDimension,imageAlignment} from './image-properties.mjs';
const decode=new MarkdownIt().utils.unescapeAll;
function nodeAt(text,position,type){let found;const meta=frontMatter(text);markdownLanguage.parser.parse(text).iterate({enter(node){if(meta&&node.from<meta.to&&node.name!=='Document')return false;if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;if(node.name===type&&node.from<=position&&(node.to>=position||type==='Image'&&(imageAttributes(text,node.to)?.to??node.to)>=position)){found=node.node;return false;}}});return found;}
export function cellModel(text,position,row=null,column=null){
 const table=nodeAt(text,position,'Table');if(!table)return null;
 const lines=text.slice(table.from,table.to).split('\n'),width=tableCells(lines[0]).length,rows=lines.length-1;
 if(rows>5000||width>100)throw new Error('大表格请在源码中编辑（最多 5,000 行、100 列）。');
 if(row==null){const sourceRow=text.slice(table.from,position).split('\n').length-1;row=sourceRow===0?0:Math.max(0,sourceRow-1);const offset=table.from+lines.slice(0,sourceRow).reduce((n,line)=>n+line.length+1,0);column=tableCells(lines[sourceRow]||'',offset).findLastIndex(cell=>cell.from<=position);}
 row=Math.max(0,Math.min(rows-1,row));column=Math.max(0,Math.min(width-1,column??0));
 const index=row===0?0:row+1,from=table.from+lines.slice(0,index).reduce((n,line)=>n+line.length+1,0),cells=tableCells(lines[index],from),cell=cells[column];
 return {tableFrom:table.from,row,column,rows,width,line:lines[index],lineFrom:from,cell,value:cell?.text||''};
}
export function cellChange(model,value){
 if(value===model.value)return [];
 if(value.length>20000)throw new Error('单元格最多支持 20,000 个字符。');
 // Escape newly typed pipes without doubling existing Markdown escapes.
 const insert=value.replace(/\r\n?|\n/g,'<br>').replace(/(\\*)\|/g,(all,slashes)=>slashes.length%2?all:slashes+'\\|');
 if(model.cell)return [{from:model.cell.from,to:model.cell.from+model.cell.text.length,insert}];
 const cells=tableCells(model.line),trimmed=model.line.trimEnd(),trailing=trimmed.endsWith('|')&&/(^|[^\\])(?:\\\\)*\|$/.test(trimmed),at=model.lineFrom+(trailing?trimmed.length-1:model.line.length);
 const values=Array(model.column-cells.length+1).fill('');values[values.length-1]=insert;
 return [{from:at,insert:trailing?values.map(value=>'| '+value+' ').join(''):values.map(value=>' | '+value).join('')}];
}
export function nextCell(model,direction=1){const index=model.row*model.width+model.column+direction;if(index<0||index>=model.rows*model.width)return null;return {row:Math.floor(index/model.width),column:index%model.width};}
export function pictureModel(text,position){
 const node=nodeAt(text,position,'Image');if(!node)return null;
 const url=node.getChild('URL'),titleNode=node.getChild('LinkTitle'),label=node.getChild('LinkLabel'),marks=node.getChildren('LinkMark'),altEnd=marks[1]?.from;
 const alt=altEnd?text.slice(node.from+2,altEnd):'',normalize=label=>label.trim().replace(/\s+/g,' ').toUpperCase();
 let reference=url?text.slice(url.from,url.to):'',title=titleNode?decode(text.slice(titleNode.from+1,titleNode.to-1)):'';
 if(!url){const meta=frontMatter(text),key=normalize(label?text.slice(label.from+1,label.to-1)||alt:alt);markdownLanguage.parser.parse(text).iterate({enter(candidate){if(meta&&candidate.name!=='Document'&&candidate.from<meta.to)return false;if(['FencedCode','CodeBlock','HTMLBlock'].includes(candidate.name))return false;if(candidate.name!=='LinkReference')return;const name=candidate.node.getChild('LinkLabel'),path=candidate.node.getChild('URL'),caption=candidate.node.getChild('LinkTitle');if(name&&path&&normalize(text.slice(name.from+1,name.to-1))===key&&!reference){reference=text.slice(path.from,path.to);title=caption?decode(text.slice(caption.from+1,caption.to-1)):'';}return false;}});}
 if(!reference)throw new Error('图片引用没有找到对应路径，请先补全 Markdown。');
 const attrs=imageAttributes(text,node.to);
 return {from:node.from,to:node.to,labelEnd:altEnd,raw:text.slice(node.from,node.to),reference,alt:decode(alt),altSource:alt,title,titleFrom:titleNode?.from,titleTo:titleNode?.to,urlFrom:url?.from,urlEnd:url?.to,inline:!!url,width:attrs?.width||'',height:attrs?.height||'',align:attrs?.align||'',attrs};
}
export function pictureChanges(model,{title=model.title,width=model.width,height=model.height,align=model.align,alt=model.alt,reference=model.reference}){
 if(title.length>1000||/[\r\n]/.test(title))throw new Error('图片标题需为单行，最多 1,000 个字符。');
 if(alt.length>2000||/[\r\n]/.test(alt))throw new Error('替代文字需为单行，最多 2,000 个字符。');
 if(!reference||/[\r\n\0]/.test(reference))throw new Error('图片路径无效。');
 align=imageAlignment(align);width=imageDimension(width);height=imageDimension(height,'height');const changes=[];
 const escapedAlt=alt.replace(/[\\`*_{}\[\]<>!|]/g,'\\$&'),quoted='"'+title.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 if(!model.inline&&(title!==model.title||reference!==model.reference||alt!==model.alt)){
  changes.push({from:model.from,to:model.to,insert:'!['+escapedAlt+']('+reference+(title?' '+quoted:'')+')'});
 }else{
  if(alt!==model.alt)changes.push({from:model.from+2,to:model.labelEnd,insert:escapedAlt});
  if(reference!==model.reference)changes.push({from:model.urlFrom,to:model.urlEnd,insert:reference});
  if(title!==model.title){
   if(model.titleFrom!=null){let from=model.titleFrom;if(!title)while(from>model.urlEnd&&/[ \t]/.test(model.raw[from-model.from-1]))from--;changes.push({from,to:model.titleTo,insert:title?quoted:''});}
   else if(title)changes.push({from:model.to-1,insert:' '+quoted});
  }
 }
 if(width!==model.width||height!==model.height||align!==model.align)changes.push({from:model.attrs?.from??model.to,to:model.attrs?.to??model.to,insert:dimensionSource({width,height,align})});
 return changes.sort((a,b)=>a.from-b.from);
}
