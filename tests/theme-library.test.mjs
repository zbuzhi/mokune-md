import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseTheme,serializeTheme} from '../src/web/theme-library.mjs';
import {themeVariables,contentWidth} from '../src/web/theme-style.mjs';
const themes=JSON.parse(await readFile(new URL('../src/web/themes.json',import.meta.url)));
test('six community adaptations retain fixed source revisions and full MIT attribution',()=>{const community=themes.filter(t=>t.source);assert.equal(community.length,6);for(const theme of community){assert.match(theme.source,/^https:\/\/github.com\//);assert.match(theme.sourceRevision,/^[a-f0-9]{40}$/);assert.match(theme.attribution,/Permission is hereby granted/);assert.ok(theme.style.headingFont);}});
test('theme JSON roundtrip preserves appearance and attribution as structured data',()=>{for(const theme of themes){const parsed=parseTheme(serializeTheme(theme),themes[0]);for(const key of ['background','foreground','accent','heading','codeBackground'])if(theme[key])assert.equal(parsed[key],theme[key]);assert.deepEqual(parsed.style,theme.style||{});if(theme.attribution)assert.equal(parsed.attribution,theme.attribution);assert.equal(parsed.custom,true);}});
test('rejects CSS injection, malformed types, oversized files and unbounded style values',()=>{const base=JSON.parse(serializeTheme(themes[0]));for(const invalid of [{...base,colors:{...base.colors,background:'url(https://evil)'}},{...base,style:{headingScale:Infinity}},{...base,style:{bodyFont:'url(evil)'}},{...base,dark:'false'},{...base,schema:'css'},{...base,name:''}])assert.throws(()=>parseTheme(JSON.stringify(invalid),themes[0]));assert.throws(()=>parseTheme(' '.repeat(129*1024),themes[0]));});
test('CSS variables use bounded font and color mappings; full width is an explicit option',()=>{for(const theme of themes){const variables=themeVariables(theme);assert.equal(variables['--background'],theme.background);assert.ok(!Object.values(variables).some(v=>/url\(|@import|<script/.test(v)));}assert.equal(contentWidth('full'),'100%');assert.equal(contentWidth(880),'880px');assert.equal(contentWidth('bad'),'720px');});
test('built-in code palettes distinguish strings/keywords and meet text contrast',()=>{
 const lum=color=>{const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const theme of themes){const bg=lum(theme.codeBackground||theme.surface);assert.notEqual(theme.keyword.toLowerCase(),theme.string.toLowerCase(),theme.id);for(const key of ['keyword','string','function','number','comment']){const fg=lum(theme[key]),ratio=(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);assert.ok(ratio>=4.5,theme.id+' '+key+' contrast '+ratio);}}
});
