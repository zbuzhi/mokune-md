import {markdownLanguage} from '@codemirror/lang-markdown';
import MarkdownIt from 'markdown-it';
import {tableRowCells as tableCells,tableContainerPrefix} from './preview-model.mjs';
import {cellModel} from './visual-model.mjs';
import {frontMatter} from './extended-markdown.mjs';
const plainParser=new MarkdownIt({html:false});
export function parseTSV(source){
 if(new TextEncoder().encode(source).length>1024*1024)throw new Error('表格粘贴最多支持 1 MB 文本。');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const field=()=>{row.push(cell);cell='';closed=false;if(row.length>100)throw new Error('表格最多支持 100 列。');};
 const line=()=>{field();rows.push(row);row=[];if(rows.length>5001)throw new Error('表格最多支持 5,000 行。');};
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){if(ch==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch==='"'&&!cell&&!closed){quoted=true;continue;}
  if(ch==='\t'){field();continue;}
  if(ch==='\r'||ch==='\n'){if(ch==='\r'&&source[i+1]==='\n')i++;line();continue;}
  if(closed)throw new Error('表格引号格式不完整，请从表格软件重新复制。');
  cell+=ch;
 }
 if(quoted)throw new Error('表格引号未闭合，未修改正文。');
 // A spreadsheet's final row terminator is not an extra empty record.
 if(cell||row.length||closed||!rows.length)line();
 if(rows.length>5000||rows.reduce((n,row)=>n+row.length,0)>50000)throw new Error('一次粘贴最多支持 5,000 行、50,000 个单元格。');
 return rows;
}
export function tableGrid(text,position){
 const meta=frontMatter(text);let table;markdownLanguage.parser.parse(text).iterate({enter(node){if(meta&&node.name!=='Document'&&node.from<meta.to)return false;if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;if(node.name==='Table'&&node.from<=position&&node.to>=position){table={from:node.from,to:node.to};return false;}}});
 if(!table)return null;
 const lines=text.slice(table.from,table.to).split('\n'),width=tableCells(lines[0]).length;
 if(lines.length>5001||width>100)throw new Error('表格超过可视化操作上限，请在源码中编辑。');
 return {...table,lines,width,prefix:tableContainerPrefix(text,table.from)};
}
const encode=value=>value.replace(/\r\n?|\n/g,'<br>').replace(/(\\*)\|/g,(all,slashes)=>slashes.length%2?all:slashes+'\\|');
function append(line,values){const trimmed=line.trimEnd(),trailing=/(^|[^\\])(?:\\\\)*\|$/.test(trimmed),at=trailing?trimmed.length-1:line.length;return line.slice(0,at)+values.map(value=>(trailing?'| ':' | ')+value+(trailing?' ':'')).join('')+line.slice(at);}
export function pasteTable(text,position,row,column,source){
 const table=tableGrid(text,position),model=cellModel(text,position,row,column);if(!table||!model)return null;
 const matrix=parseTSV(source);if(matrix.some(row=>row.some(value=>value.length>20000)))throw new Error('单元格最多支持 20,000 个字符。');const matrixWidth=Math.max(...matrix.map(row=>row.length)),width=Math.max(table.width,column+matrixWidth),rowCount=Math.max(table.lines.length-1,row+matrix.length);
 if(width>100||rowCount>5000||width*rowCount>50000)throw new Error('粘贴后超过 100 列、5,000 行或 50,000 个单元格，未修改正文。');
 const changes=[];let offset=table.from;
 for(let physical=0;physical<table.lines.length;physical++){
  const line=table.lines[physical],cells=tableCells(line),logical=physical===0?0:physical-1,values=Array(width).fill('');
  if(physical===1){for(let c=cells.length;c<width;c++)values[c]='---';}
  else if(logical>=row&&logical<row+matrix.length){for(let c=0;c<matrixWidth;c++)values[column+c]=encode(matrix[logical-row][c]??'');}
  let updated=line;
  // Pad only rows which need it; preserve all original cell whitespace and
  // separator alignment while adding columns. Apply replacements right-to-left.
  const edits=[];
  if(physical!==1&&logical>=row&&logical<row+matrix.length)for(let c=column;c<Math.min(cells.length,column+matrixWidth);c++)edits.push({from:cells[c].from,to:cells[c].from+cells[c].text.length,insert:values[c]});
  if(cells.length<width)edits.push({from:line.length,to:line.length,append:true,values:values.slice(cells.length)});
  for(const edit of edits.sort((a,b)=>b.from-a.from))updated=edit.append?append(updated,edit.values):updated.slice(0,edit.from)+edit.insert+updated.slice(edit.to);
  if(updated!==line)changes.push({from:offset,to:offset+line.length,insert:updated});offset+=line.length+1;
 }
 if(rowCount>table.lines.length-1){const lines=[];for(let r=table.lines.length-1;r<rowCount;r++){const values=Array(width).fill(''),incoming=matrix[r-row];if(incoming)for(let c=0;c<matrixWidth;c++)values[column+c]=encode(incoming[c]??'');lines.push(table.prefix+'| '+values.join(' | ')+' |');}changes.push({from:table.to,insert:'\n'+lines.join('\n')});}
 return changes;
}
export function tableCellText(source){const tokens=plainParser.parseInline(source.replace(/<br\s*\/?>/gi,'\n'),{});const collect=list=>list.map(token=>token.children?collect(token.children):['text','code_inline'].includes(token.type)?token.content:['softbreak','hardbreak'].includes(token.type)?'\n':token.type==='image'?token.content:'').join('');return collect(tokens);}
export function copyTableTSV(text,position){const table=tableGrid(text,position);if(!table)return null;return table.lines.filter((_,i)=>i!==1).map(line=>{const cells=tableCells(line);return Array.from({length:table.width},(_,i)=>{const value=tableCellText(cells[i]?.text||'');return /[\t\r\n"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;}).join('\t');}).join('\r\n');}
