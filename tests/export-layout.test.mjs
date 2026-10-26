import test from 'node:test';
import assert from 'node:assert/strict';
import {exportLayout,exportPageCSS} from '../src/web/export-layout.mjs';
test('export layout defaults to A4 and validates enumerated paper/orientation/margin',()=>{assert.deepEqual(exportLayout(),{paper:'a4',orientation:'portrait',margin:14});assert.deepEqual(exportLayout({exportPaper:'letter',exportOrientation:'landscape',exportMargin:25}),{paper:'letter',orientation:'landscape',margin:25});assert.deepEqual(exportLayout({exportPaper:'bad;',exportOrientation:'bad;',exportMargin:900}),exportLayout());assert.ok(exportPageCSS(exportLayout({exportPaper:'letter',exportOrientation:'landscape',exportMargin:20})).startsWith('@page{size:Letter landscape;margin:20mm}'));});
