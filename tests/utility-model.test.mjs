import {test} from 'node:test';import assert from 'node:assert/strict';import {rankFiles} from '../src/web/utility-model.mjs';
test('quick open prioritizes file names, supports Chinese paths and fuzzy matches',()=>{const files=[{name:'说明.md',path:'docs/说明.md'},{name:'readme.md',path:'readme.md'},{name:'other.md',path:'readme/other.md'}];assert.equal(rankFiles(files,'readme')[0].name,'readme.md');assert.equal(rankFiles(files,'说明')[0].path,'docs/说明.md');assert.equal(rankFiles(files,'rdm')[0].name,'readme.md');assert.equal(rankFiles(files,'不存在').length,0);assert.equal(rankFiles(files,'').length,3);});

import {parseLocation} from '../src/web/utility-model.mjs';
test('goto validates positive UTF-16 line/column positions and clamps boundaries',()=>{assert.deepEqual(parseLocation('2:3',[10,5]),{line:2,column:3});assert.deepEqual(parseLocation('99:99',[10,5]),{line:2,column:6});for(const bad of ['0','2:0','-1','a','1:2:3','999999999999999999999'])assert.equal(parseLocation(bad,[2]),null);});
