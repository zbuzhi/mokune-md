import test from 'node:test';
import assert from 'node:assert/strict';
import {headingAnchors,anchorPosition} from '../src/web/link-model.mjs';
test('headings have collision-free IDs shared by editor navigation and export',()=>{
 const text='# 中文 标题\n\n# Same\n\n# Same\n\n# Same-1\n\n# **粗体** `code`\n\n```md\n# excluded\n```';
 const anchors=headingAnchors(text);assert.deepEqual(anchors.map(h=>h.id),['中文-标题','same','same-1','same-1-1','粗体-code']);
 for(const h of anchors)assert.equal(anchorPosition(text,'#'+encodeURIComponent(h.id)),h.from);
 assert.equal(anchorPosition(text,'#missing'),null);assert.equal(anchorPosition(text,'#bad%XX'),null);
});
