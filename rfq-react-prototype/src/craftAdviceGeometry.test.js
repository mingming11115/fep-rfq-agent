import test from 'node:test';
import assert from 'node:assert/strict';
import {adviceGeometry} from './craftAdviceGeometry.js';
test('advice links use clipped native source coordinates and the actual card position',()=>{
  const geometry={selectedId:'R',status:'matched',clip:{x:0,y:20,w:100,h:100},ranges:[{x:10,y:10,w:30,h:20}]};
  const result=adviceGeometry({geometry,activeId:'R',frame:{left:10,top:30},stage:{left:0,top:0},card:{left:200,top:50,width:100,height:80}});
  assert.deepEqual(result.rects,[{x:20,y:50,w:30,h:10}]);
  assert.match(result.path,/M 50 50.*200/);
  assert.deepEqual(adviceGeometry({geometry:{...geometry,selectedId:'other'},activeId:'R'}).rects,[]);
  assert.deepEqual(adviceGeometry({geometry:{...geometry,status:'ambiguous'},activeId:'R'}).rects,[]);
  assert.deepEqual(adviceGeometry({geometry:{...geometry,ranges:[{x:10,y:300,w:30,h:20}]},activeId:'R',frame:{left:0,top:0},stage:{left:0,top:0}}).rects,[]);
});
