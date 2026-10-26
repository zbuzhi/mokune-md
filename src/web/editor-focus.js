import {isComposing} from './composition.js';
// Dialog focus restoration may leave the browser caret outside contenteditable
// even when CodeMirror still caches the previous DOM selection.
export function restoreEditorFocus(view){
 if(!view?.dom.isConnected||isComposing(view))return;
 view.focus();if(view.state.readOnly)return;
 const {anchor,head}=view.state.selection.main,a=view.domAtPos(anchor),h=view.domAtPos(head),selection=view.contentDOM.ownerDocument.getSelection();
 selection?.setBaseAndExtent(a.node,a.offset,h.node,h.offset);
}
