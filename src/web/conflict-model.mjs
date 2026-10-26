import {StateField,StateEffect} from '@codemirror/state';
import {invertedEffects} from '@codemirror/commands';

export const setMergeAuthorization=StateEffect.define();
export const mergeAuthorization=StateField.define({create:()=>null,update(value,tr){for(const effect of tr.effects)if(effect.is(setMergeAuthorization))value=effect.value;return value;}});
export const mergeHistory=invertedEffects.of(tr=>tr.effects.some(effect=>effect.is(setMergeAuthorization))?[setMergeAuthorization.of(tr.startState.field(mergeAuthorization))]:[]);
const lines=text=>text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g)||[];

// Bounded Myers diff. Large unrelated replacements remain a complete single section.
function matchingPairs(a,b){
 let prefix=0,suffix=0;while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
 while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
 const n=a.length-prefix-suffix,m=b.length-prefix-suffix,trace=[],frontier=new Map([[1,0]]);let spent=0,pairs=[];
 outer:for(let d=0;d<=n+m;d++){
  if(spent+d*2+1>500000)break;
  trace.push(new Map(frontier));spent+=d*2+1;
  for(let k=-d;k<=d;k+=2){
   let x=k===-d||k!==d&&(frontier.get(k-1)??-1)<(frontier.get(k+1)??-1)?frontier.get(k+1)??0:(frontier.get(k-1)??0)+1,y=x-k;
   while(x<n&&y<m&&a[prefix+x]===b[prefix+y]){x++;y++;}frontier.set(k,x);
   if(x>=n&&y>=m){
    let px=n,py=m;
    for(let depth=d;depth>=0;depth--){const previous=trace[depth],diagonal=px-py,prevK=diagonal===-depth||diagonal!==depth&&(previous.get(diagonal-1)??-1)<(previous.get(diagonal+1)??-1)?diagonal+1:diagonal-1,prevX=previous.get(prevK)??0,prevY=prevX-prevK;
     while(px>prevX&&py>prevY){pairs.push([prefix+--px,prefix+--py]);}px=prevX;py=prevY;
    }
    pairs.reverse();break outer;
   }
  }
 }
 return [...Array.from({length:prefix},(_,i)=>[i,i]),...pairs,...Array.from({length:suffix},(_,i)=>[a.length-suffix+i,b.length-suffix+i])];
}
export function conflictPlan(current,disk,internalTextDiff=false){
 const budget=(internalTextDiff?4:2)*1024*1024;
 if(current.length+disk.length>budget||new TextEncoder().encode(current).length+new TextEncoder().encode(disk).length>budget)throw new Error('逐段合并暂支持两侧合计 2 MB 以内的文稿；请使用比较或另存副本处理大文稿。');
 const bomA=current.startsWith('\ufeff'),bomB=disk.startsWith('\ufeff'),a=lines(bomA?current.slice(1):current),b=lines(bomB?disk.slice(1):disk);
 if(a.length+b.length>(internalTextDiff?48000:24000))throw new Error('逐段合并暂支持两侧合计 24,000 行以内；原文仍完整保留。');
 const parts=[],hunks=[];let offsetA=bomA?1:0,offsetB=bomB?1:0;
 const add=(left,right,leftLine,rightLine,kind='text')=>{const hunk={id:hunks.length,kind,left,right,leftFrom:offsetA,leftTo:offsetA+left.length,rightFrom:offsetB,rightTo:offsetB+right.length,leftLine,rightLine,formatOnly:left.replace(/\r\n|\r/g,'\n')===right.replace(/\r\n|\r/g,'\n'),whitespaceOnly:left.replace(/[ \t\r\n]/g,'')===right.replace(/[ \t\r\n]/g,'')};hunks.push(hunk);parts.push(hunk);offsetA+=left.length;offsetB+=right.length;};
 if(bomA!==bomB){offsetA=offsetB=0;add(bomA?'\ufeff':'',bomB?'\ufeff':'',1,1,'bom');}else if(bomA)parts.push({equal:'\ufeff'});
 let ai=0,bi=0;for(const [x,y] of [...matchingPairs(a,b),[a.length,b.length]]){
  if(x>ai||y>bi)add(a.slice(ai,x).join(''),b.slice(bi,y).join(''),ai+1,bi+1);
  if(x<a.length){parts.push({equal:a[x]});offsetA+=a[x].length;offsetB+=b[y].length;}ai=x+1;bi=y+1;
 }
 if(hunks.length>300){const hunk={id:0,kind:'bulk',left:current,right:disk,leftFrom:0,leftTo:current.length,rightFrom:0,rightTo:disk.length,leftLine:1,rightLine:1,formatOnly:false};return {current,disk,parts:[hunk],hunks:[hunk],bulk:true};}
 return {current,disk,parts,hunks};
}
export function mergedSource(plan,choices){
 return plan.parts.map(part=>{if(Object.hasOwn(part,'equal'))return part.equal;const side=choices[part.id];if(side!=='current'&&side!=='disk')throw new Error('请先为每个差异段选择保留内容。');return side==='disk'?part.right:part.left;}).join('');
}
export function mergeTextChanges(before,after){return conflictPlan(before,after,true).hunks.map(h=>({from:h.leftFrom,to:h.leftTo,insert:h.right}));}
