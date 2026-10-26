import {inlineStyles} from './inline-style.mjs';
import {documentExtensions,extensionRanges} from './extended-markdown.mjs';
import {StateEffect} from '@codemirror/state';
import {Decoration, ViewPlugin} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isComposing, setComposing} from './composition.js';

const refresh = StateEffect.define();
const markerWidths=new Map();
function markerWidth(prefix){if(!markerWidths.has(prefix)){const context=document.createElement('canvas').getContext('2d');context.font='10px Menlo,monospace';markerWidths.set(prefix,context.measureText(prefix).width);}return markerWidths.get(prefix);}
const inCode = (state,pos) => {
  let node=syntaxTree(state).resolveInner(pos,1);
  while(node) {if(node.name==='FencedCode'||node.name==='CodeBlock') return node;node=node.parent;}
  return false;
};

function decorations(view) {
  const model=documentExtensions(view.state.doc),ranges=[],seen=new Set(),masked=extensionRanges(model);
  const add=(from,to,cls)=>{if(to>from) ranges.push(Decoration.mark({class:cls}).range(from,to));};
  for(const {from,to} of view.visibleRanges) {
    for(let pos=view.state.doc.lineAt(from).from;pos<=to;) {
      const line=view.state.doc.lineAt(pos);
      if(seen.has(line.number)) {pos=line.to+1;continue;}
      seen.add(line.number);
      if(masked.some(r=>line.from>=r.from&&line.from<=r.to)){ranges.push(Decoration.line({class:'md-extension-source'}).range(line.from));if(line.to===view.state.doc.length)break;pos=line.to+1;continue;}
      const text=line.text;
      const active=view.state.selection.ranges.some(r=>r.from<=line.to&&r.to>=line.from);
      const marker=active?'md-marker-active':'md-marker';
      const code=inCode(view.state,line.from)||inCode(view.state,Math.max(line.from,line.to-1));
      const classes=[];let lineStyle='';
      if(code) {
        classes.push('md-code');
        if(line.from===view.state.doc.lineAt(code.from).from)classes.push('md-code-first');
        if(line.to===view.state.doc.lineAt(code.to).to)classes.push('md-code-last');
        const fence=code.getChildren('CodeMark').find(mark=>view.state.doc.lineAt(mark.from).number===line.number);
        if(fence) {
          classes.push('md-fence');
          add(fence.from,line.to,marker);
        }
      } else {
        const heading=text.match(/^( {0,3}#{1,6})[ \t]+/);
        if(heading) {classes.push(`md-h${heading[1].trim().length}`,'md-heading');lineStyle=`--heading-prefix:${markerWidth(heading[0])}px`;add(line.from,line.from+heading[0].length,marker+' md-heading-prefix');}
        const quote=text.match(/^(\s*>\s?)+/);
        if(quote) {classes.push('md-quote');add(line.from,line.from+quote[0].length,marker);}
        const callout=model.callouts.find(c=>line.number>c.startLine&&line.number<=c.endLine);
        if(callout){
          classes.push('md-callout',`callout-${callout.type.toLowerCase()}`);
          if(line.number===callout.startLine+1){
            classes.push('callout-title');
            const label=text.match(/^ {0,3}>[ \t]*(\[!)(\w+)(\])/);
            if(label){const start=line.from+label[0].indexOf('[!');add(start,start+2,marker);add(start+2,start+2+label[2].length,'md-callout-label');add(start+2+label[2].length,start+3+label[2].length,marker);}
          }
          if(line.number===callout.endLine)classes.push('md-callout-last');
        }

      }
      if(active) classes.push('md-active-block');
      if(classes.length) ranges.push(Decoration.line({class:classes.join(' '),attributes:lineStyle?{style:lineStyle}:{}}).range(line.from));
      if(line.to===view.state.doc.length) break;
      pos=line.to+1;
    }
  }
  // Syntax nodes handle nested emphasis/code, multi-backtick spans, lists and
  // Setext headings without changing document text or DOM character widths.
  const tree=syntaxTree(view.state),painted=new Set();
  for(const visible of view.visibleRanges){
    for(const span of inlineStyles(tree,visible.from,visible.to)){
      if(masked.some(r=>span.from>=r.from&&span.from<=r.to))continue;
      const key=span.from+':'+span.to+':'+span.role;if(painted.has(key))continue;painted.add(key);
      const active=view.state.selection.ranges.some(r=>r.from<=view.state.doc.lineAt(span.to).to&&r.to>=view.state.doc.lineAt(span.from).from);
      add(span.from,span.to,span.role==='marker'?(active?'md-marker-active':'md-marker'):'md-'+span.role);
    }
    tree.iterate({from:visible.from,to:visible.to,enter(node){
      if(masked.some(r=>node.from>=r.from&&node.from<=r.to))return false;
      if(['FencedCode','CodeBlock','Table','Image','HTMLBlock','LinkReference'].includes(node.name))return false;
      if(node.name==='ListMark'){
        const key=node.from+':list';if(painted.has(key))return;painted.add(key);
        const active=view.state.selection.ranges.some(r=>r.from<=view.state.doc.lineAt(node.to).to&&r.to>=view.state.doc.lineAt(node.from).from);
        const bullet=/^[-+*]$/.test(view.state.sliceDoc(node.from,node.to));
        add(node.from,node.to,'md-list-marker'+(bullet&&!active?' md-list-bullet':''));
      }
      if(/^SetextHeading[12]$/.test(node.name)){
        const mark=node.node.getChild('HeaderMark');if(!mark)return;
        for(let n=view.state.doc.lineAt(node.from).number;n<view.state.doc.lineAt(mark.from).number;n++){
          const line=view.state.doc.line(n),key=line.from+':setext';if(painted.has(key))continue;painted.add(key);
          ranges.push(Decoration.line({class:'md-heading md-h'+node.name.at(-1)}).range(line.from));
        }
        const active=view.state.selection.ranges.some(r=>r.from<=node.to&&r.to>=node.from);
        add(mark.from,mark.to,active?'md-marker-active':'md-marker');
      }
    }});
  }
  return Decoration.set(ranges,true);
}

export const livePreview=ViewPlugin.fromClass(class {
  constructor(view) {this.decorations=decorations(view);}
  update(update) {
    if(isComposing(update.view)) {this.decorations=this.decorations.map(update.changes);return;}
    if(update.docChanged||update.selectionSet||update.viewportChanged||update.transactions.some(t=>t.effects.some(e=>e.is(refresh)||e.is(setComposing)))||syntaxTree(update.startState)!==syntaxTree(update.state)) this.decorations=decorations(update.view);
  }
}, {
  decorations:value=>value.decorations,
});
