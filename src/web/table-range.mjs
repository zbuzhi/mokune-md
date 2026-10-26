import {tableGrid,tableCellText} from './table-transfer.mjs';
import {tableRowCells} from './preview-model.mjs';
export function rectangle(anchor,head){return {top:Math.min(anchor.row,head.row),bottom:Math.max(anchor.row,head.row),left:Math.min(anchor.column,head.column),right:Math.max(anchor.column,head.column)};}
function checked(text,position,range){
 const table=tableGrid(text,position);if(!table)return null;
 const {top,bottom,left,right}=range;
 if(![top,bottom,left,right].every(Number.isInteger)||top<0||left<0||bottom<top||right<left||bottom>=table.lines.length-1||right>=table.width)throw new Error('表格选区已变化，请重新选择。');
 const offsets=[];let at=table.from;for(const line of table.lines){offsets.push(at);at+=line.length+1;}
 return {...table,offsets};
}
export function copyTableRange(text,position,range){
 const table=checked(text,position,range);if(!table)return null;
 const rows=[];for(let row=range.top;row<=range.bottom;row++){
  const cells=tableRowCells(table.lines[row===0?0:row+1]);
  rows.push(Array.from({length:range.right-range.left+1},(_,i)=>{const value=tableCellText(cells[range.left+i]?.text||'');return /[\t\r\n"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;}).join('\t'));
 }
 return rows.join('\r\n');
}
// Raw spans include cell whitespace but never quote/list containers. Deleting
// a column removes only its own span and one adjacent separator, byte-for-byte.
function segments(line){
 const prefix=line.match(/^[ \t]*(?:>[ \t]*)+/)?.[0]||'',start=prefix.length,cuts=[start-1];
 for(let i=start;i<line.length;i++)if(line[i]==='|'){let n=0;for(let j=i-1;j>=start&&line[j]==='\\';j--)n++;if(n%2===0)cuts.push(i);}
 cuts.push(line.length);const spans=cuts.slice(0,-1).map((cut,i)=>({from:cut+1,to:cuts[i+1]}));
 if(line.slice(start).trimStart().startsWith('|'))spans.shift();
 if(line.trimEnd().endsWith('|')&&cuts.at(-2)===line.trimEnd().length-1)spans.pop();return spans;
}
export function tableRangeOperation(text,position,range,operation){
 const table=checked(text,position,range);if(!table)return null;
 if(operation==='clear'){
  const edits=[];for(let row=range.top;row<=range.bottom;row++){const physical=row===0?0:row+1,cells=tableRowCells(table.lines[physical],table.offsets[physical]);for(let col=range.left;col<=range.right;col++){const cell=cells[col];if(cell?.text)edits.push({from:cell.from,to:cell.from+cell.text.length,insert:''});}}
  return edits;
 }
 if(operation==='deleteRows'){
  if(range.top===0)throw new Error('表头需要保留，请只选择正文行。');
  const first=range.top+1,last=range.bottom+1;
  return last===table.lines.length-1?[{from:table.offsets[first]-1,to:table.to,insert:''}]:[{from:table.offsets[first],to:table.offsets[last+1],insert:''}];
 }
 if(operation==='deleteColumns'){
  if(range.right-range.left+1===table.width)throw new Error('表格至少保留一列。');
  if(table.lines.some(line=>tableRowCells(line).length!==table.width))throw new Error('请先补齐各行列数，再删除整列。');
  return table.lines.map((line,i)=>{const spans=segments(line),first=spans[range.left],last=spans[range.right],from=range.right<spans.length-1?first.from:spans[range.left-1].to,to=range.right<spans.length-1?spans[range.right+1].from:last.to;return {from:table.offsets[i]+from,to:table.offsets[i]+to,insert:''};});
 }
 throw new Error('未知的表格区域操作。');
}
