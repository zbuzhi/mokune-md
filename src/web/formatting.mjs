import {EditorSelection} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';

function wrap(marker, close = marker) {
  return ({state, dispatch}) => {
    dispatch(state.update(state.changeByRange(range => {
      const selected = state.sliceDoc(range.from, range.to);
      const asterisk = marker === '*' || marker === '**';
      const contains = (left,right) => marker === '*' ? left % 2 === 1 && right % 2 === 1 : left >= 2 && right >= 2;
      const run = (text, reverse = false) => {let n=0;while(n<text.length&&text[reverse?text.length-1-n:n]==='*')n++;return n;};
      const selectedMarked = selected.startsWith(marker) && selected.endsWith(close) && (!asterisk || contains(run(selected),run(selected,true)));
      if (selectedMarked && selected.length >= marker.length + close.length) {
        return {changes:[{from:range.from,to:range.from+marker.length,insert:''},{from:range.to-close.length,to:range.to,insert:''}],range:EditorSelection.range(range.from,range.to-marker.length-close.length)};
      }
      const before=state.sliceDoc(Math.max(0,range.from-16),range.from),after=state.sliceDoc(range.to,Math.min(state.doc.length,range.to+16));
      if (before.endsWith(marker) && after.startsWith(close) && (!asterisk || contains(run(before,true),run(after)))) {
        return {changes:[{from:range.from-marker.length,to:range.from,insert:''},{from:range.to,to:range.to+close.length,insert:''}],range:EditorSelection.range(range.from-marker.length,range.to-marker.length)};
      }
      return {changes:[{from:range.from,insert:marker},{from:range.to,insert:close}],range:EditorSelection.range(range.from+marker.length,range.to+marker.length)};
    }), {userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));
    return true;
  };
}
function prefixLines(prefix, pattern, toggle = true) {
  return ({state,dispatch}) => {
    const lines=new Map();
    for(const range of state.selection.ranges) {
      const last=state.doc.lineAt(range.empty?range.to:Math.max(range.from,range.to-1));
      for(let n=state.doc.lineAt(range.from).number;n<=last.number;n++)lines.set(n,state.doc.line(n));
    }
    const list=[...lines.values()],remove=toggle&&prefix&&list.every(line=>line.text.startsWith(prefix));
    const changes=list.map(line=>({from:line.from,to:line.from+(line.text.match(pattern)?.[0].length||0),insert:remove?'':prefix}));
    dispatch(state.update({changes,userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));return true;
  };
}
function insertLink(image = false) {
  return ({state,dispatch})=>{
    dispatch(state.update(state.changeByRange(range=>{
      const label=state.sliceDoc(range.from,range.to)||(image?'图片描述':'链接文字'),path=image?'图片路径':'https://';
      const text=`${image?'!':''}[${label}](${path})`,start=range.from+(image?2:1)+label.length+2;
      return {changes:{from:range.from,to:range.to,insert:text},range:EditorSelection.range(start,start+path.length)};
    }),{userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));return true;
  };
}
function insertTable({state,dispatch}) {
  const range=state.selection.main,line=state.doc.lineAt(range.from),lead=range.from>line.from?'\n\n':'';
  const text=lead+'| 名称 | 内容 |\n| --- | --- |\n| 项目 | 说明 |\n';
  dispatch(state.update({changes:{from:range.from,to:range.to,insert:text},selection:{anchor:range.from+lead.length+2,head:range.from+lead.length+4},userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));return true;
}
function insertFootnote({state,dispatch}) {
  const range=state.selection.main,text=state.doc.toString();let index=1;
  while(text.includes(`[^${index}]`))index++;
  const reference=`[^${index}]`,body=state.sliceDoc(range.from,range.to)||'脚注内容',tail=`\n\n${reference}: ${body}\n`;
  const changes=range.to===state.doc.length?{from:range.from,to:range.to,insert:reference+tail}:[{from:range.from,to:range.to,insert:reference},{from:state.doc.length,insert:tail}];
  const start=state.doc.length-(range.to-range.from)+reference.length+2+reference.length+2;
  dispatch(state.update({changes,selection:{anchor:start,head:start+body.length},userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));return true;
}
function insertRule({state,dispatch}) {
  const range=state.selection.main,insert='\n\n---\n\n';dispatch(state.update({changes:{from:range.from,to:range.to,insert},selection:{anchor:range.from+insert.length},userEvent:'input.format',annotations:isolateHistory.of('full'),scrollIntoView:true}));return true;
}
export const formatCommands = {
  footnote:insertFootnote,horizontalRule:insertRule,
  bold:wrap('**'),italic:wrap('*'),inlineCode:wrap('`'),strike:wrap('~~'),
  link:insertLink(),image:insertLink(true),codeBlock:wrap('```\n','\n```'),table:insertTable,
  paragraph:prefixLines('',/^#{1,6}\s+/u,false),
  bulletList:prefixLines('- ',/^(?:\s*[-+*]\s+(?:\[[ xX]\]\s+)?|\s*\d+[.)]\s+)/),
  orderedList:prefixLines('1. ',/^(?:\s*[-+*]\s+(?:\[[ xX]\]\s+)?|\s*\d+[.)]\s+)/),
  taskList:prefixLines('- [ ] ',/^(?:\s*[-+*]\s+(?:\[[ xX]\]\s+)?|\s*\d+[.)]\s+)/),
  quote:prefixLines('> ',/^>\s?/)
};
for(let level=1;level<=6;level++)formatCommands[`heading${level}`]=prefixLines('#'.repeat(level)+' ',/^#{1,6}\s+/,false);
