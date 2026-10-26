const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
export function textStats(raw){
 const text=raw.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
 const han=(text.match(/\p{Script=Han}/gu)||[]).length;
 const words=han+(text.replace(/\p{Script=Han}/gu,' ').match(/[\p{L}\p{N}_]+/gu)||[]).length;
 let characters=0;for(const part of segmenter.segment(text))if(!/^\s+$/u.test(part.segment))characters++;
 return {words,characters,lines:text.split('\n').length,bytes:new TextEncoder().encode(raw).length,minutes:words?Math.max(1,Math.ceil(words/400)):0};
}
