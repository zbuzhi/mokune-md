import {extendedModel,extensionRanges} from './extended-markdown.mjs';
import {markdownLanguage} from '@codemirror/lang-markdown';
import {mathSpans} from './math-model.mjs';
export function collectHeadings(text) {
  const tree=markdownLanguage.parser.parse(text),headings=[],excluded=extensionRanges(extendedModel(text));
  tree.iterate({enter(node){if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name)){excluded.push({from:node.from,to:node.to});return false;}}});
  const formulas=mathSpans(text,excluded).filter(span=>span.display);
  tree.iterate({enter(node){
    if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;
    const match=node.name.match(/^(?:ATX|Setext)Heading([1-6])$/);if(!match)return;
    if([...excluded,...formulas].some(span=>span.from<=node.from&&span.to>node.from))return false;
    const raw=text.slice(node.from,node.to),title=(node.name.startsWith('Setext')?raw.replace(/\n[ \t]*(?:=+|-+)[ \t]*$/,''):raw.replace(/^#{1,6}[ \t]+/,'').replace(/[ \t]+#+[ \t]*$/,''))
      .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g,'$1').replace(/[*_`~]/g,'').replace(/\\([\\`*{}[\]()#+\-.!_|>])/g,'$1').replace(/\s+/g,' ').trim();
    if(title)headings.push({title,level:Number(match[1]),from:node.from,to:node.to});return false;
  }});
  return headings;
}
export function headingAt(headings,position) {
  let low=0,high=headings.length;
  while(low<high){const mid=(low+high)>>1;if(headings[mid].from<=position)low=mid+1;else high=mid;}
  return Math.max(0,low-1);
}
