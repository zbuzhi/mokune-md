import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeIndex} from '../src/web/range-index.mjs';
test('interval queries match half-open overlap across nested, adjacent and unsorted exclusions',()=>{
 const ranges=[{from:8,to:12},{from:0,to:3},{from:2,to:5},{from:5,to:7},{from:10,to:11}],original=JSON.stringify(ranges),overlap=rangeIndex(ranges);
 for(let from=-1;from<15;from++)for(let to=from+1;to<16;to++)assert.equal(overlap(from,to),ranges.some(r=>r.from<to&&r.to>from),`${from}:${to}`);
 assert.equal(overlap(5,5),false);assert.equal(overlap(7,8),false);assert.equal(JSON.stringify(ranges),original);
});
