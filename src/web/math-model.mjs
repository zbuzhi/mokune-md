import {rangeIndex} from './range-index.mjs';
// Source positions only: no normalization, parsing output never becomes Markdown.
const escaped=(text,pos)=>{let n=0;while(pos>0&&text[--pos]==='\\')n++;return n%2===1;};
export function mathSpans(text,excluded=[]) {
  if(!text.includes('$')&&!text.includes('\\(')&&!text.includes('\\['))return [];
  const spans=[],excludedOverlap=rangeIndex(excluded);
  let overlaps=(from,to)=>excludedOverlap(from,to)||(spans.length>0&&spans.at(-1).from<to&&spans.at(-1).to>from);
  const add=(from,to,contentFrom,contentTo,display)=>{if(!overlaps(from,to))spans.push({from,to,contentFrom,contentTo,display,source:text.slice(contentFrom,contentTo)});};
  // Display delimiters must occupy their own lines, or a complete single line.
  const display=/^ {0,3}(\$\$|\\\[)([^\n]*)/gm;
  const closes={'$$':[],'\\]':[]};
  for(const m of text.matchAll(/^ {0,3}(\$\$|\\\])[ \t]*$/gm))closes[m[1]].push({from:m.index,to:m.index+m[0].length});
  const nextClose=(kind,from)=>{const list=closes[kind];let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid].from<from)lo=mid+1;else hi=mid;}return list[lo];};
  for(const m of text.matchAll(display)) {
    if(overlaps(m.index,m.index+m[0].length))continue;
    const open=m[1],close=open==='$$'?'$$':'\\]',contentFrom=m.index+m[0].indexOf(open)+open.length;
    const lineEnd=text.indexOf('\n',contentFrom),lineTail=text.slice(contentFrom,lineEnd<0?text.length:lineEnd),localClose=lineTail.indexOf(close),same=localClose<0?-1:contentFrom+localClose;
    if(same>=0&&(lineEnd<0||same<lineEnd)&&!text.slice(same+close.length,lineEnd<0?text.length:lineEnd).trim()) {
      if(text.slice(contentFrom,same).trim())add(m.index,same+close.length,contentFrom,same,true);
      continue;
    }
    if(m[2].trim())continue;
    const end=nextClose(close,contentFrom);if(!end)continue;
    const contentTo=end.from;
    if(text.slice(contentFrom,contentTo).trim())add(m.index,end.to,contentFrom,contentTo,true);
  }
  // Accepted display spans are already ordered and disjoint. Inline scanning
  // advances past each accepted close, so it need not rescan prior inline spans.
  const displayOverlap=rangeIndex(spans);
  overlaps=(from,to)=>excludedOverlap(from,to)||displayOverlap(from,to);
  let offset=0;
  for(const line of text.split('\n')) {
    for(let i=0;i<line.length;i++) {
      if(escaped(line,i))continue;
      const paren=line.startsWith('\\(',i),dollar=line[i]==='$'&&line[i-1]!=='$'&&line[i+1]!=='$';
      if(!paren&&!dollar)continue;
      const length=paren?2:1,close=paren?'\\)':'$';
      if(!paren&&(!line[i+1]||/\s/.test(line[i+1])))continue;
      let end=line.indexOf(close,i+length);
      while(end>=0&&(escaped(line,end)||!paren&&(/\s/.test(line[end-1])||/[\d$]/.test(line[end+1]||'')||line[end-1]==='$')))end=line.indexOf(close,end+close.length);
      if(end<0)continue;
      if(end>i+length)add(offset+i,offset+end+close.length,offset+i+length,offset+end,false);
      i=end+close.length-1;
    }
    offset+=line.length+1;
  }
  return spans.sort((a,b)=>a.from-b.from);
}

// markdown-it asks about one prefix at a time. Scanning every remaining formula
// for each token makes long paragraphs quadratic during export and footnotes.
export function inlineMathPrefix(text){
 const paren=text.startsWith('\\('),dollar=text[0]==='$'&&text[1]!=='$';if(!paren&&!dollar)return null;
 if(dollar&&(!text[1]||/\s/.test(text[1])))return null;
 const length=paren?2:1,close=paren?'\\)':'$',lineEnd=text.indexOf('\n'),limit=lineEnd<0?text.length:lineEnd,line=text.slice(0,limit);
 let end=line.indexOf(close,length);
 while(end>=0&&end<limit&&(escaped(text,end)||!paren&&(/\s/.test(text[end-1])||/[\d$]/.test(text[end+1]||'')||text[end-1]==='$')))end=line.indexOf(close,end+close.length);
 return end>length&&end<limit?{from:0,to:end+close.length,source:text.slice(length,end),display:false}:null;
}
