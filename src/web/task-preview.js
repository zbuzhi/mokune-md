import {documentExtensions,extensionRanges} from './extended-markdown.mjs';
import {Decoration,ViewPlugin,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
import {isComposing,setComposing} from './composition.js';
import {taskAt} from './task-model.mjs';
function toggle(view,from){if(isComposing(view)||view.state.readOnly)return false;const marker=view.state.sliceDoc(from,from+3);if(!/^\[[ xX]\]$/.test(marker))return false;view.dispatch({changes:{from:from+1,to:from+2,insert:marker[1]===' '?'x':' '},annotations:isolateHistory.of('full')});return true;}
export function toggleCurrentTask(view){if(!view)return false;const task=taskAt(view.state.doc.toString(),view.state.selection.main.head);return task?toggle(view,task.from):false;}
class TaskCheckbox extends WidgetType{
 constructor(from,checked,title,disabled){super();Object.assign(this,{from,checked,title,disabled});}
 eq(other){return this.from===other.from&&this.checked===other.checked&&this.title===other.title&&this.disabled===other.disabled;}
 toDOM(view){const button=document.createElement('button');button.type='button';button.className='md-task-checkbox';button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(this.checked));button.setAttribute('aria-label',(this.checked?'标为未完成：':'标为完成：')+this.title);button.disabled=this.disabled;button.title='切换完成状态 · ⌘Enter';button.textContent=this.checked?'✓':'';button.onpointerdown=event=>event.preventDefault();button.onclick=event=>{event.preventDefault();toggle(view,this.from);};return button;}
 ignoreEvent(){return true;}
}
function decorations(view){const ranges=[],masked=extensionRanges(documentExtensions(view.state.doc));for(const visible of view.visibleRanges)syntaxTree(view.state).iterate({from:visible.from,to:visible.to,enter(node){if(masked.some(r=>node.from>=r.from&&node.from<=r.to))return false;if(node.name!=='TaskMarker')return;const line=view.state.doc.lineAt(node.from),active=view.state.selection.ranges.some(r=>r.from<=line.to&&r.to>=line.from);if(active)return;const checked=/[xX]/.test(view.state.sliceDoc(node.from,node.to)),title=view.state.sliceDoc(node.to,line.to).trim();ranges.push(Decoration.replace({widget:new TaskCheckbox(node.from,checked,title,view.state.readOnly)}).range(node.from,node.to));if(checked&&node.to<line.to)ranges.push(Decoration.mark({class:'md-task-complete'}).range(node.to,line.to));}});return Decoration.set(ranges,true);}
export const taskPreview=ViewPlugin.fromClass(class{constructor(view){this.decorations=decorations(view)}update(update){if(isComposing(update.view)){this.decorations=this.decorations.map(update.changes);return;}if(update.docChanged||update.selectionSet||update.viewportChanged||update.startState.readOnly!==update.state.readOnly||syntaxTree(update.startState)!==syntaxTree(update.state)||update.transactions.some(t=>t.effects.some(e=>e.is(setComposing))))this.decorations=decorations(update.view);}}, {decorations:plugin=>plugin.decorations});
