import test from 'node:test';import assert from 'node:assert/strict';import {resourceReferences,resourceTarget,classifyResources,attachmentMarkdown} from '../src/web/resource-model.mjs';
test('reference scanner resolves images, definitions and HTML while excluding code and metadata',()=>{
 const raw='---\nname: "![隐藏](bad.png)"\n---\n\n![图](assets/a.png)\n[附件](assets/a.pdf)\n![另图][pic]\n\n[pic]: assets/b.png "题"\n\n<img src="assets/c.png">\n`![代码](bad.png)`\n\n```md\n[x](bad.pdf)\n```';
 const refs=resourceReferences(raw).map(x=>x.reference);assert.ok(refs.includes('assets/a.png'));assert.ok(refs.includes('assets/a.pdf'));assert.ok(refs.includes('assets/b.png'));assert.ok(refs.includes('assets/c.png'));assert.ok(!refs.includes('bad.png'));assert.ok(!refs.includes('bad.pdf'));
});
test('local resolution decodes once, preserves encoded hashes and ignores remote references',()=>{assert.equal(resourceTarget('../assets/图%20%23.png#x','/demo/notes/a.md'),'/demo/assets/图 #.png');assert.equal(resourceTarget('https://x/a.png','/demo/a.md'),null);assert.equal(resourceTarget('file:///demo/assets/a.png','/demo/a.md'),'/demo/assets/a.png');assert.equal(resourceTarget('file://evil/demo/a.png','/demo/a.md'),null);});
test('unused assets exclude exact references, ambiguous mentions and open files',()=>{
 const inv={root:'/demo',paths:['/demo/assets/a.png'],documents:[{id:'draft',name:'草稿',path:'/demo/a.md',raw:'![图](assets/a.png)\n名字 b.png\n[x](missing.pdf)'}],assets:['a','b','c','d'].map((x,i)=>({path:'/demo/assets/'+x+'.png',name:x+'.png',eligible:true,open:i===3}))};
 const report=classifyResources(inv);assert.deepEqual(report.unused,['/demo/assets/c.png']);assert.equal(report.missing.length,1);assert.equal(report.missing[0].line,3);
});
test('attachment insertion escapes text and rejects foreign source',()=>{assert.equal(attachmentMarkdown('笔记[一].pdf','assets/a.pdf'),'[笔记\\[一\\].pdf](assets/a.pdf)');assert.throws(()=>attachmentMarkdown('a','../secret'));});

test('resource history reads undo and redo without changing the original state',async()=>{
 const {EditorState}=await import('@codemirror/state');const {history,isolateHistory,undo}=await import('@codemirror/commands');const {resourceHistory}=await import('../src/web/resource-model.mjs');
 let state=EditorState.create({doc:'![图](assets/old.png)',extensions:[history()]});state=state.update({changes:{from:state.doc.toString().indexOf('old'),to:state.doc.toString().indexOf('old')+3,insert:'new'},annotations:isolateHistory.of('full')}).state;
 const original=state;const result=resourceHistory([{id:'a',path:'/demo/a.md',name:'a.md',state}]);assert.ok(result.complete);assert.ok(result.documents.some(d=>d.raw.includes('old.png')));assert.equal(state,original);
 undo({state,dispatch:tr=>{state=tr.state;}});const redo=resourceHistory([{id:'a',path:'/demo/a.md',name:'a.md',state}]);assert.ok(redo.documents.some(d=>d.raw.includes('new.png')));
});

test('case-insensitive Mac paths and Unicode normalization protect referenced resources',()=>{
 const inventory={root:'/demo',caseSensitive:false,paths:['/demo/assets/FOO.png','/demo/assets/é.png'],documents:[{name:'a',path:'/demo/a.md',raw:'![图](assets/foo.PNG) ![图](assets/e\u0301.png)'}],assets:[{name:'FOO.png',path:'/demo/assets/FOO.png',eligible:true},{name:'é.png',path:'/demo/assets/é.png',eligible:true}]};
 const result=classifyResources(inventory);assert.deepEqual(result.unused,[]);assert.deepEqual(result.missing,[]);assert.ok(result.assets.every(x=>x.references.length===1));
});
