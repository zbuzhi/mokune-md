import {colorKeys} from './theme-style.mjs';
export function parseTheme(raw,base){
 if(typeof raw!=='string'||raw.length>128*1024)throw new Error('主题文件需小于 128 KB。');
 let item;try{item=JSON.parse(raw);}catch{throw new Error('主题文件不是有效 JSON。');}
 if(!item||Array.isArray(item)||item.schema!=='mokune.theme.v1')throw new Error('请选择 Mokune 主题 JSON，可先导出当前主题作为模板。');
 if(typeof item.name!=='string'||!item.name.trim()||item.name.length>36)throw new Error('主题名称应为 1–36 个字。');
 if(typeof item.dark!=='boolean')throw new Error('dark 字段需要 true 或 false。');
 const colors=item.colors||{};for(const key of ['background','foreground','accent','surface','border'])if(!/^#[\da-f]{6}$/i.test(colors[key]||''))throw new Error('主题需要 background、foreground、accent、surface、border 六位色值。');
 const theme={...base,id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:item.name.trim(),english:'Custom',dark:!!item.dark,custom:true,source:undefined,subtitle:'自定义排版',style:{}};
 if(item.attribution!==undefined){if(typeof item.attribution!=='string'||item.attribution.length>8192)throw new Error('主题来源声明过长。');theme.attribution=item.attribution;}
 for(const key of colorKeys)if(colors[key]!==undefined){if(!/^#[\da-f]{6}$/i.test(colors[key]))throw new Error('色值需要使用 #RRGGBB 格式。');theme[key]=colors[key];}
 for(const [key,fallback] of Object.entries({muted:theme.foreground,selection:theme.surface,keyword:theme.accent,string:theme.accent,function:theme.foreground,number:theme.accent,comment:colors.muted||theme.foreground,lineNumber:colors.muted||theme.foreground,activeLine:theme.surface,bracketBackground:theme.surface,bracketForeground:theme.foreground,heading:theme.foreground,heading2:theme.foreground,codeBackground:theme.surface,quoteBackground:theme.surface,inlineCode:theme.accent}))if(!colors[key])theme[key]=fallback;
 const style=item.style||{};
 for(const key of ['bodyFont','headingFont'])if(style[key]!==undefined){if(!['modern','book','rounded','technical'].includes(style[key]))throw new Error('字体风格应为 modern、book、rounded 或 technical。');theme.style[key]=style[key];}
 for(const [key,min,max]of [['lineHeight',1.5,2.1],['headingWeight',400,750],['headingScale',1.5,2.3],['codeRadius',0,16]])if(style[key]!==undefined){if(typeof style[key]!=='number'||!Number.isFinite(style[key])||style[key]<min||style[key]>max)throw new Error('排版参数超出支持范围：'+key);theme.style[key]=style[key];}
 for(const key of ['headingRule','codeBorder'])if(typeof style[key]==='boolean')theme.style[key]=style[key];
 // Only structured appearance data crosses into styles; no arbitrary CSS or URLs.
 return theme;
}
export function serializeTheme(theme){return JSON.stringify({schema:'mokune.theme.v1',name:theme.name,dark:theme.dark,colors:Object.fromEntries(colorKeys.filter(key=>theme[key]).map(key=>[key,theme[key]])),style:theme.style||{},...(theme.attribution?{attribution:theme.attribution}:{})},null,2)+'\n';}
