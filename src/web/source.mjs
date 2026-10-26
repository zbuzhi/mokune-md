import { StateField, StateEffect } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';

export function decodeSource(raw) {
  const bom = raw.startsWith('\uFEFF');
  const body = bom ? raw.slice(1) : raw;
  const eols = body.match(/\r\n|\r|\n/g) || [];
  const counts = new Map();
  for (const eol of eols) counts.set(eol, (counts.get(eol) || 0) + 1);
  const preferred = [...counts].sort((a,b) => b[1]-a[1])[0]?.[0] || '\n';
  return {text:body.replace(/\r\n|\r/g,'\n'),bom,eols,preferred};
}

export function encodeSource(text, metadata) {
  const lines = text.split('\n');
  let raw = metadata.bom ? '\uFEFF' : '';
  for (let i=0;i<lines.length;i++) raw += lines[i] + (i<lines.length-1 ? metadata.eols[i] || metadata.preferred : '');
  return raw;
}

export const restoreEols = StateEffect.define();
export function sourceExtensions(metadata) {
  const field = StateField.define({
    create:()=>metadata,
    update(value,tr) {
      let restored;
      for(const effect of tr.effects) if(effect.is(restoreEols)) restored=effect.value;
      // History groups inverse effects newest first, so the final value is the
      // original metadata before the entire grouped edit.
      if(restored) return restored;
      if(!tr.docChanged) return value;
      const edits=[];
      tr.changes.iterChanges((from,to,_fb,_tb,inserted)=>{
        const start=tr.startState.doc.lineAt(from).number-1;
        const end=tr.startState.doc.lineAt(to).number-1;
        if(end!==start || inserted.lines>1) edits.push({start,end,count:inserted.lines-1});
      });
      if(!edits.length) return value;
      const eols=value.eols.slice();
      for(const {start,end,count} of edits.reverse()) eols.splice(start,end-start,...Array(count).fill(value.preferred));
      return {...value,eols};
    }
  });
  return {field,extensions:[field,invertedEffects.of(tr=>{
    const before=tr.startState.field(field),after=tr.state.field(field);
    return before===after ? [] : [restoreEols.of(before)];
  })]};
}
