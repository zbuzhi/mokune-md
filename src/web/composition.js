import {StateEffect, StateField} from '@codemirror/state';
import {ViewPlugin} from '@codemirror/view';

export const setComposing = StateEffect.define();
export const compositionState = StateField.define({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setComposing)) value = effect.value;
    return value;
  }
});
export const isComposing = view => !!view && (view.compositionStarted || view.state.field(compositionState, false) === true);

// A previous compositionend must never release a newer composition. Timers
// belong to this editor instance, so loading another document cancels them.
export function compositionGuard(onChange) {
  return [compositionState, ViewPlugin.fromClass(class {
    constructor(view) {
      this.generation = 0; this.timer = null; this.active = false;
      // WebKit can retarget compositionend to the newly focused table widget.
      // Widget ignoreEvent prevents CodeMirror's normal bubbling handlers from
      // seeing it. Capture the lifecycle, and forward only that editor-owned
      // end event to the editable root so both guards finish together.
      this.onStart = event => {
        if (event.target.closest?.('input,textarea,[contenteditable="false"]')) return;
        this.start(view);
      };
      this.onEnd = event => {
        if (!this.active) return;
        if (event.target !== view.contentDOM && event.target.closest?.('[contenteditable="false"]') && !event.target.closest?.('input,textarea')) {
          view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true,data:event.data || ''}));
          return;
        }
        this.end(view);
      };
      view.contentDOM.addEventListener('compositionstart', this.onStart, true);
      view.contentDOM.addEventListener('compositionend', this.onEnd, true);
      this.view = view;
    }
    start(view) {
      clearTimeout(this.timer); this.generation++; this.active = true;
      if (!view.state.field(compositionState)) view.dispatch({effects:setComposing.of(true)});
      onChange(true, view);
    }
    end(view) {
      const generation = this.generation;
      clearTimeout(this.timer);
      const settle = () => {
        if (generation !== this.generation || !view.dom.isConnected) return;
        if (view.compositionStarted) { this.timer = setTimeout(settle, 20); return; }
        this.active = false;
        view.dispatch({effects:setComposing.of(false)});
        onChange(false, view);
      };
      this.timer = setTimeout(settle, 40);
    }
    destroy() {
      clearTimeout(this.timer); this.generation++;
      this.view.contentDOM.removeEventListener('compositionstart', this.onStart, true);
      this.view.contentDOM.removeEventListener('compositionend', this.onEnd, true);
    }
  })];
}
