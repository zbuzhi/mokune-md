import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {compositionState,setComposing} from './composition.js';
let choose;export function configureCodeLanguage(callback){choose=callback;}
class LanguageWidget extends WidgetType{
 constructor(from,language,readOnly){super();Object.assign(this,{from,language,readOnly});}
 eq(other){return this.from===other.from&&this.language===other.language&&this.readOnly===other.readOnly;}
 toDOM(view){const root=document.createElement('div');root.className='code-language-bar';root.contentEditable='false';const button=document.createElement('button');button.textContent=(this.language||'选择语言')+' ▾';button.setAttribute('aria-label','选择代码语言');button.disabled=this.readOnly;button.onclick=e=>{e.preventDefault();choose?.(view,this.from);};root.append(button);return root;}
 ignoreEvent(){return true;}
}
function build(state){const ranges=[];syntaxTree(state).iterate({enter(node){if(node.name!=='FencedCode')return;const info=node.node.getChild('CodeInfo'),language=info?state.sliceDoc(info.from,info.to):'';ranges.push(Decoration.widget({widget:new LanguageWidget(node.from,language,state.readOnly),block:true,side:-1}).range(state.doc.lineAt(node.from).from));return false;}});return Decoration.set(ranges,true);}
export const codeLanguage=StateField.define({create:build,update(value,tr){if(tr.state.field(compositionState,false))return value.map(tr.changes);return tr.docChanged||tr.startState.readOnly!==tr.state.readOnly||syntaxTree(tr.startState)!==syntaxTree(tr.state)||tr.effects.some(e=>e.is(setComposing))?build(tr.state):value.map(tr.changes);},provide:field=>EditorView.decorations.from(field)});
