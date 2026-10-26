import katex from 'katex';
import fontCSS from 'mokune:font-css';
// One local font payload serves both the live preview and standalone exports.
const style=document.createElement('style');style.id='mokune-math-fonts';style.textContent=fontCSS;document.head.append(style);
window.mokuneMath={katex,fontCSS,render(source,display){
  const target=document.createElement('span');
  katex.render(source,target,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',maxExpand:500,maxSize:20,output:'htmlAndMathml',macros:{}});
  return target;
}};
