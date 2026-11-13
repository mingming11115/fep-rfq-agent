import test from 'node:test';
import assert from 'node:assert/strict';
import { playContentMotion } from './contentMotion.js';

function surface() {
  const animations=[];
  return {animations, animate(frames,options) {
    let resolve;
    const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(r=>{resolve=r;}),finish:()=>resolve()};
    animations.push(animation);return animation;
  }};
}
test('reduced motion and unsupported surfaces never block a content change',()=>{
  const target=surface();
  assert.equal(playContentMotion(target,{reducedMotion:true}),null);
  assert.equal(target.animations.length,0);
  assert.equal(playContentMotion(null),null);
  assert.equal(playContentMotion({}),null);
});
test('content transitions play by default when the system requests reduced motion', (t) => {
  const matchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' });
  t.after(() => {
    if (matchMedia === undefined) { delete globalThis.matchMedia; }
    else { globalThis.matchMedia = matchMedia; }
  });

  const target = surface();
  const animation = playContentMotion(target, { kind: 'tab' });
  assert.equal(animation?.options.duration, 150);
});
test('a rapid second switch cancels the first transition on that surface',async()=>{
  const target=surface();
  const first=playContentMotion(target,{kind:'tab',direction:1,reducedMotion:false});
  const next=playContentMotion(target,{kind:'tab',direction:-1,reducedMotion:false});
  assert.equal(first.cancelled,true);
  first.finish();await first.finished;await Promise.resolve();
  const last=playContentMotion(target,{kind:'view',reducedMotion:false});
  assert.equal(next.cancelled,true);
  assert.equal(last.cancelled,false);
});
test('confirmation finishes immediately when reduced motion is enabled',()=>{
  const target=surface();
  assert.equal(playContentMotion(target,{kind:'card-out',reducedMotion:true}),null);
  assert.equal(playContentMotion(target,{kind:'card-in',reducedMotion:true}),null);
  assert.equal(target.animations.length,0);
});
