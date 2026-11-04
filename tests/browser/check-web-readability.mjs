import { chromium } from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.local/artifacts/browser/web-readability';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
await page.addInitScript(()=>localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'layout-preview',user:{id:'layout-preview'}})));
await page.route('**/api/**',r=>r.abort());
const results=[];
for(const width of [1920,1440,1280,1024]){
 await page.setViewportSize({width,height:900});
 for(const route of ['dashboard','projects','response','reviews','knowledge','history']){
  await page.goto('http://127.0.0.1:5173/#/'+route);await page.waitForTimeout(700);
  const metrics=await page.evaluate(()=>({title:document.body.innerText.slice(0,100),overflow:document.documentElement.scrollWidth>innerWidth,offscreen:[...document.querySelectorAll('button,input,textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+2||r.left< -2)}).map(el=>({text:el.textContent.slice(0,40),class:el.className})).slice(0,8)}));
  results.push({width,route,...metrics});
  await page.screenshot({path:`${out}/${route}-${width}.png`});
 }
}
writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();
