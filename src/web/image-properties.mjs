// A small, explicit Markdown image attribute extension. Values never become
// arbitrary CSS. Unknown/invalid attribute blocks remain literal source.
export function imageDimension(value,axis='width'){
 const text=String(value??'').trim();if(!text)return '';
 const match=text.match(/^(\d+(?:\.\d+)?)(px|%)?$/);if(!match)throw new Error('尺寸请填写像素值，例如 320px；宽度也支持 50%。');
 const number=Number(match[1]),unit=match[2]||'px';if(number<1||number>(unit==='%'?100:8192)||axis==='height'&&unit==='%')throw new Error('像素范围为 1–8192，宽度百分比范围为 1–100%。');
 return number+unit;
}
export function imageAttributes(text,from=0){
 const match=text.slice(from).match(/^[ \t]?\{([^{}\n]*)\}/);if(!match)return null;
 const dims={},parts=match[1].trim().split(/\s+/);if(!parts.length)return null;
 try{for(const part of parts){const pair=part.match(/^(width|height|align)=(?:"([^"]+)"|'([^']+)'|([^\s]+))$/);if(!pair||dims[pair[1]])return null;const value=pair[2]||pair[3]||pair[4];dims[pair[1]]=pair[1]==='align'?imageAlignment(value):imageDimension(value,pair[1]);}}catch{return null;}
 return Object.keys(dims).length?{from,to:from+match[0].length,...dims}:null;
}
export function imageAlignment(value){if(value==null||value==='')return '';if(!['left','center','right'].includes(value))throw new Error('图片对齐仅支持 left、center 或 right。');return value;}
export function imageStyle(dimensions={}){const width=imageDimension(dimensions.width),height=imageDimension(dimensions.height,'height'),align=imageAlignment(dimensions.align);return [align&&`display:block;margin-left:${align==='left'?'0':'auto'};margin-right:${align==='right'?'0':'auto'}`,width&&`width:${width}`,height&&`height:${height}`,'max-width:100%','object-fit:contain'].filter(Boolean).join(';');}
export function dimensionSource({width='',height='',align=''}){align=imageAlignment(align);return width||height||align?'{'+[width&&`width=${imageDimension(width)}`,height&&`height=${imageDimension(height,'height')}`,align&&`align=${align}`].filter(Boolean).join(' ')+'}':'';}
export function imageAttributePlugin(md){
 md.inline.ruler.before('text','mokune-image-properties',(state,silent)=>{
  const image=state.tokens.at(-1);if(image?.type!=='image')return false;
  const attrs=imageAttributes(state.src,state.pos);if(!attrs)return false;
  if(!silent)image.meta={...image.meta,dimensions:{width:attrs.width||'',height:attrs.height||'',...(attrs.align?{align:attrs.align}:{})}};
  state.pos=attrs.to;return true;
 });
 // Only this exact inert HTML form is allowed, useful for multi-line cells.
 md.inline.ruler.before('html_inline','mokune-line-break',(state,silent)=>{const match=state.src.slice(state.pos).match(/^<br\s*\/?>/i);if(!match)return false;if(!silent)state.push('hardbreak','br',0);state.pos+=match[0].length;return true;});
}
