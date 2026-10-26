export const fontStacks={modern:'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',book:'"Iowan Old Style","Songti SC",serif',rounded:'"Avenir Next","PingFang SC",sans-serif',technical:'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif'};
export const colorKeys=['background','foreground','muted','accent','surface','border','selection','keyword','string','function','number','comment','lineNumber','activeLine','bracketBackground','bracketForeground','heading','heading2','codeBackground','quoteBackground','inlineCode'];
export function themeVariables(theme){
 const values={};for(const key of colorKeys)if(/^#[\da-f]{6}$/i.test(theme[key]||''))values['--'+key]=theme[key];
 const style=theme.style||{};
 return {...values,'--body-font':fontStacks[style.bodyFont]||fontStacks.modern,'--heading-font':fontStacks[style.headingFont]||fontStacks.modern,'--body-leading':String(style.lineHeight||1.8),'--heading-weight':String(style.headingWeight||650),'--h1-scale':String(style.headingScale||1.9),'--heading-rule':style.headingRule?'1px':'0px','--code-radius':(style.codeRadius??7)+'px','--code-border':style.codeBorder===false?'0px':'1px','--heading':theme.heading||theme.foreground,'--heading2':theme.heading2||theme.heading||theme.foreground,'--codeBackground':theme.codeBackground||theme.surface,'--quoteBackground':theme.quoteBackground||theme.surface,'--inlineCode':theme.inlineCode||theme.accent};
}
export function contentWidth(value){return value==='full'?'100%':`${[640,720,880].includes(Number(value))?Number(value):720}px`;}
