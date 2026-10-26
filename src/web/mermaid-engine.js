import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
let nextID=0;
window.mokuneMermaid={async render(source,palette){
  // Disable document-owned configuration, HTML labels and all click bindings.
  // Keeping rendering serial also isolates Mermaid's process-global config.
  if(/^\s*---(?:\r?\n)|%%\s*\{/m.test(source))throw new Error('此预览不执行 Mermaid 配置指令，请保留纯图表源码。');
  // Mermaid measures a temporary SVG before returning it. Reject asset-bearing
  // input before that step, rather than relying only on post-render cleanup.
  const resourceScan=source.replace(/\\([0-9a-f]{1,6})\s?/gi,(_,hex)=>String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff)))
    .replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,code)=>String.fromCodePoint(Math.min(parseInt(code.replace(/^x/i,''),/^x/i.test(code)?16:10),0x10ffff)))
    .replace(/&colon;/gi,':').replace(/[\u0000-\u0020]/g,'');
  if(/(?:https?|data|file|mokune-image):|\/\/|url\(|\bimg:|!\[/i.test(resourceScan))throw new Error('图表预览不加载外部资源或图片，请使用纯文本节点。');
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:20000,maxEdges:300,theme:'base',
    htmlLabels:false,flowchart:{htmlLabels:false},fontFamily:'-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif',
    themeVariables:{darkMode:palette.dark,background:palette.background,primaryColor:palette.surface,primaryTextColor:palette.foreground,primaryBorderColor:palette.accent,lineColor:palette.muted,textColor:palette.foreground,secondaryColor:palette.surface,tertiaryColor:palette.background},
    secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','htmlLabels','flowchart','theme','themeVariables']});
  const {svg}=await mermaid.render(`mokune-diagram-${++nextID}`,source);
  const clean=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','a','image','script','iframe','animate','set'],RETURN_DOM_FRAGMENT:true});
  for(const element of clean.querySelectorAll('*'))for(const attr of [...element.attributes]) {
    if(/^on/i.test(attr.name)||/href$/i.test(attr.name)&&!attr.value.startsWith('#')||/url\(\s*['"]?(?!#)/i.test(attr.value))element.removeAttribute(attr.name);
  }
  // Diagram CSS is renderer-generated, but forbid external CSS references too.
  for(const style of clean.querySelectorAll('style'))if(/@import|url\(\s*['"]?(?!#)/i.test(style.textContent))style.remove();
  return clean;
}};
