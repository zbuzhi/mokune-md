import {markdownLanguage} from '@codemirror/lang-markdown';
import {tableRowCells as tableCells,tableContainerPrefix} from './preview-model.mjs';
export function tableOperation(text,position,action){
 let table;markdownLanguage.parser.parse(text).iterate({enter(node){if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;if(node.name==='Table'&&node.from<=position&&node.to>=position){table={from:node.from,to:node.to};return false;}}});
 if(!table)return null;
 const source=text.slice(table.from,table.to),lines=source.split('\n'),width=tableCells(lines[0]).length,prefix=tableContainerPrefix(text,table.from);
 if(lines.length>5000||width>100)throw new Error('大表格请在源码中编辑（工具支持 5,000 行、100 列以内）。');
 const offsets=[];let offset=table.from;for(const line of lines){offsets.push(offset);offset+=line.length+1;}
 const row=Math.max(0,offsets.findLastIndex(from=>from<=position)),cells=tableCells(lines[row],offsets[row]);let column=0;for(let i=0;i<Math.min(cells.length,width);i++)if(position>=cells[i].from)column=i;
 if(action==='rowBefore'||action==='rowAfter'){const at=action==='rowBefore'?Math.max(2,row):Math.max(2,row+1),insert=prefix+'| '+Array(width).fill('').join(' | ')+' |';return at<lines.length?[{from:offsets[at],insert:insert+'\n'}]:[{from:table.to,insert:'\n'+insert}];}
 if(action==='deleteRow'){if(row<2)throw new Error('表头需要保留；可删除正文行。');return row===lines.length-1?[{from:offsets[row]-1,to:table.to,insert:''}]:[{from:offsets[row],to:offsets[row+1],insert:''}];}
 if(['columnBefore','columnAfter','deleteColumn'].includes(action)){
  if(action==='deleteColumn'&&width<=1)throw new Error('表格至少保留一列。');
  if(lines.some(line=>tableCells(line).length!==width))throw new Error('请先补齐各行列数，再调整列。');
  return lines.map((line,index)=>{const values=tableCells(line).map(cell=>cell.text),container=line.match(/^[ \t]*(?:>[ \t]*)*/)?.[0]||'';if(action==='deleteColumn')values.splice(column,1);else values.splice(column+(action==='columnAfter'?1:0),0,index===1?'---':'');return {from:offsets[index],to:offsets[index]+line.length,insert:container+'| '+values.join(' | ')+' |'};});
 }
 if(action==='row'){const after=Math.max(1,row),from=offsets[after]+lines[after].length;return [{from,insert:'\n'+prefix+'| '+Array(width).fill('').join(' | ')+' |'}];}
 if(action==='column'){if(lines.some(line=>tableCells(line).length!==width))throw new Error('请先补齐各行列数，再插入新列。');return lines.map((line,index)=>{const trimmed=line.trimEnd(),trailing=trimmed.endsWith('|')&&/(^|[^\\])(?:\\\\)*\|$/.test(trimmed),from=offsets[index]+(trailing?trimmed.length-1:line.length),value=index===0?'新列':index===1?'---':'';return {from,insert:trailing?'| '+value+' ':' | '+value+' '};});}
 if(['left','center','right'].includes(action)){const cell=tableCells(lines[1],offsets[1])[column];return [{from:cell.from,to:cell.from+cell.text.length,insert:{left:':---',center:':---:',right:'---:'}[action]}];}
 return null;
}
