import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeVideoCsv} from '../lib/workflow-analytics';

test('video outliers use the supplied sample median, retain zero views and calculate only complete engagement observations',()=>{
  const result=analyzeVideoCsv('title,views,likes,comments\nНула,0,0,0\nРедовно,100,10,2\nУспешно,200,20,4\nИзключение,1200,100,20');
  assert.equal(result.medianViews,150);assert.equal(result.items[0].relativeViews,8);assert.equal(result.items[0].engagementRate,.1);assert.equal(result.items.at(-1)!.engagementRate,null);assert.match(result.summary,/непроверен произход/);
});
test('quoted Bulgarian titles, BOM, semicolon and odd median work without evaluating source links',()=>{
  const result=analyzeVideoCsv('\uFEFFзаглавие;гледания;линк\n"Хляб; с квас";10;https://example.test/a\nВторо;20;\nТрето;90;');
  assert.equal(result.medianViews,20);assert.equal(result.items[0].relativeViews,4.5);assert.equal(result.items[2].title,'Хляб; с квас');assert.equal(result.items[0].engagementRate,null);
});
test('zero median does not invent an infinite performance multiplier',()=>{const result=analyzeVideoCsv('title,views\nA,0\nB,0\nC,100');assert.equal(result.medianViews,0);assert.equal(result.items[0].relativeViews,null);assert.match(result.summary,/няма ненулева база/);});
test('malformed, ambiguous and oversized counts/rows/links receive actionable errors',()=>{
  for(const input of ['title,views\nA,1\nB,2','title,views\nA,1K\nB,2\nC,3','title,views\nA,-1\nB,2\nC,3','title,views\n"A,1\nB,2\nC,3','title,views,url\nA,1,javascript:alert(1)\nB,2,\nC,3,','title,views,views\nA,1,1\nB,2,2\nC,3,3'])assert.throws(()=>analyzeVideoCsv(input));
});
