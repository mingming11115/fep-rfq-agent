import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApprovalLineGeometry} from './approvalChartGeometry.js';

test('a missing interval breaks a series while a genuine zero remains on the baseline',()=>{
 const layout=buildApprovalLineGeometry([{averageHours:0,previousAverageHours:null},{averageHours:null,previousAverageHours:8},{averageHours:4,previousAverageHours:null}]);
 assert.ok(layout);
 assert.deepEqual(layout.series.current.map(segment=>segment.length),[1,1]);
 assert.deepEqual(layout.series.previous.map(segment=>segment.length),[1]);
 assert.equal(layout.points[0].currentY,layout.plot.bottom);
 assert.equal(layout.points[1].currentY,null);
 assert.ok(layout.points[2].currentY<layout.plot.bottom);
 assert.ok(layout.maxValue>=8);
});

test('one data point is centered and an all-zero series still has a finite positive axis',()=>{
 const layout=buildApprovalLineGeometry([{averageHours:0,previousAverageHours:0}]);
 assert.ok(layout);
 assert.equal(layout.points[0].x,(layout.plot.left+layout.plot.right)/2);
 assert.ok(layout.maxValue>0);
 assert.equal(layout.points[0].previousY,layout.plot.bottom);
 assert.ok(layout.ticks.every(tick=>Number.isFinite(tick.y)));
});

test('empty data has usable axes and no invented line segments',()=>{
 const layout=buildApprovalLineGeometry([]);
 assert.ok(layout);
 assert.deepEqual(layout.series,{current:[],previous:[]});
 assert.deepEqual(layout.points,[]);
 assert.ok(layout.ticks.length>=2);
});
