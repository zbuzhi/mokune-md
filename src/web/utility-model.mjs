export function rankFiles(files,query){
 const needle=query.trim().toLocaleLowerCase();
 return files.map(file=>{const name=file.name.toLocaleLowerCase(),path=file.path.toLocaleLowerCase();let score;
  if(!needle)score=0;else if(name===needle)score=1000;else if(name.startsWith(needle))score=800;else if(name.includes(needle))score=600-name.indexOf(needle);else if(path.includes(needle))score=400-path.indexOf(needle);else {let index=0,gaps=0,last=-1;for(let i=0;i<path.length&&index<needle.length;i++)if(path[i]===needle[index]){gaps+=last<0?0:i-last-1;last=i;index++;}score=index===needle.length?100-gaps:-Infinity;}
  return {...file,score};}).filter(file=>Number.isFinite(file.score)).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,100);
}
export function parseLocation(query,lineLengths){
 const match=query.trim().match(/^(\d+)(?::(\d+))?$/);if(!match)return null;
 const requested=Number(match[1]),column=Number(match[2]||1);if(!Number.isSafeInteger(requested)||!Number.isSafeInteger(column)||requested<1||column<1)return null;
 const line=Math.min(requested,lineLengths.length),length=lineLengths[line-1]??0;return {line,column:Math.min(column,length+1)};
}
