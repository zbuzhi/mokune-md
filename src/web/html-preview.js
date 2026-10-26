import DOMPurify from 'dompurify';
export function safeHTML(source){
 const fragment=DOMPurify.sanitize(source,{ALLOWED_TAGS:['div','span','p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','u','mark','small','sub','sup','blockquote','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','caption','a','img','figure','figcaption','pre','code','details','summary','kbd'],ALLOWED_ATTR:['href','src','alt','title','width','height','align','colspan','rowspan','open','style'],ALLOW_DATA_ATTR:false,RETURN_DOM_FRAGMENT:true});
 for(const node of fragment.querySelectorAll('[style]')){
  const original=node.style,clean=[];
  for(const property of ['color','background-color','text-align','font-weight','font-style','text-decoration','width','height','max-width','border','border-radius','padding','margin']){
   const value=original.getPropertyValue(property);if(value&&!/[\\@]|url\s*\(|expression|var\s*\(/i.test(value))clean.push(property+':'+value);
  }
  node.removeAttribute('style');if(clean.length)node.setAttribute('style',clean.join(';'));
 }
 for(const a of fragment.querySelectorAll('a'))a.rel='noreferrer noopener';
 for(const image of fragment.querySelectorAll('img')){image.dataset.htmlSrc=image.getAttribute('src')||'';image.removeAttribute('src');}
 const holder=document.createElement('div');holder.append(fragment);return holder.innerHTML;
}
export function safeInlineHTML(source){
 const closing=source.match(/^<\/(span|div|a|strong|b|em|i|s|del|u|mark|small|sub|sup|code|kbd)>$/i);if(closing)return '</'+closing[1].toLowerCase()+'>';
 const clean=safeHTML(source),opening=source.match(/^<(span|div|a|strong|b|em|i|s|del|u|mark|small|sub|sup|code|kbd)\b[^>]*>$/i);
 return opening?clean.replace(new RegExp('</'+opening[1]+'>$','i'),''):clean;
}
