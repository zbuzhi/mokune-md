// Immutable interval lookup for source exclusions. Merge nested/adjacent spans
// once so queries remain logarithmic even in documents with thousands of spans.
export function rangeIndex(ranges){
 const merged=[];
 for(const range of [...ranges].sort((a,b)=>a.from-b.from||a.to-b.to)){
  if(range.to<=range.from)continue;
  const last=merged.at(-1);if(last&&range.from<=last.to)last.to=Math.max(last.to,range.to);else merged.push({from:range.from,to:range.to});
 }
 return (from,to)=>{if(to<=from)return false;let lo=0,hi=merged.length;while(lo<hi){const mid=(lo+hi)>>>1;if(merged[mid].to<=from)lo=mid+1;else hi=mid;}return lo<merged.length&&merged[lo].from<to;};
}
