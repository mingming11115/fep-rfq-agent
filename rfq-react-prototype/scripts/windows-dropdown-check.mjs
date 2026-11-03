import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, createServer, preview} from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const results = process.env.RFQ_DROPDOWN_RESULTS || path.join(os.tmpdir(),'rfq-dropdown-results');
const toolsRequire = createRequire(path.join(process.env.RFQ_BROWSER_TOOLS,'package.json'));
const {chromium} = toolsRequire('playwright');
await mkdir(results,{recursive:true});
const report = {platform:os.platform(), release:os.release(), arch:os.arch(), node:process.version, scenarios:[]};
const temporary = await mkdtemp(path.join(os.tmpdir(),'rfq-dropdown-build-'));
const dist = path.join(temporary,'dist');
const dev = await createServer({root, server:{host:'127.0.0.1',port:5173,strictPort:true}, logLevel:'warn'});
let production;

function recordEvents() {
  window.__rfqDropdownEvents = [];
  const describe = node => node instanceof Element ? `${node.tagName}.${node.className?.baseVal ?? node.className ?? ''}[aria-label=${node.getAttribute('aria-label') || ''}]` : String(node);
  const record = item => {window.__rfqDropdownEvents.push({time:performance.now(), ...item});};
  for(const type of ['pointerdown','mousedown','mouseup','click','focusin','focusout','keydown']) {
    document.addEventListener(type,event=>record({type, target:describe(event.target), relatedTarget:describe(event.relatedTarget), key:event.key, active:describe(document.activeElement)}),true);
  }
  new MutationObserver(changes=>{
    for(const change of changes) if(change.type==='attributes' && change.attributeName==='aria-expanded') {
      record({type:'expanded', target:describe(change.target), open:change.target.getAttribute('aria-expanded')});
    }
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['aria-expanded']});
}

async function scenario(base, mode, headless) {
  const name = `${mode}-${headless?'headless':'headed'}`;
  const directory = path.join(results,name); await mkdir(directory,{recursive:true});
  const result = {name, passed:false}; report.scenarios.push(result);
  const browser = await chromium.launch({channel:'chrome',headless});
  result.browser = browser.version();
  const context = await browser.newContext({viewport:{width:1366,height:768},locale:'zh-CN',recordVideo:{dir:directory}});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.addInitScript(recordEvents);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const consoleEvents=[];
  page.on('console',message=>consoleEvents.push({type:message.type(),text:message.text()}));
  page.on('pageerror',error=>consoleEvents.push({type:'pageerror',text:error.stack}));
  const input = label => page.getByRole('combobox',{name:label,exact:true});
  const open = async label => {
    const field = input(label);
    const wrapper = page.locator('.ant-select').filter({has:field});
    await wrapper.locator('.ant-select-selector').click({delay:80});
    await page.waitForTimeout(800);
    assert.equal(await field.getAttribute('aria-expanded'),'true',`${name}: ${label} must remain open after a full click`);
    assert.equal(await page.locator('.ant-select-dropdown:visible').count(),1,`${name}: ${label} popup must remain visible`);
  };
  const choose = async (label,text) => {
    await open(label);
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:text}).click({delay:80});
    await page.waitForTimeout(100);
    assert.equal(await input(label).getAttribute('aria-expanded'),'false',`${name}: ${label} closes after selecting`);
  };
  try {
    await page.goto(`${base}/windows-dropdown-check.html?mode=controls`);
    result.userAgent = await page.evaluate(()=>navigator.userAgent);
    for(const label of ['基础选择框','通用选择框','选择确认人员']) {
      for(let pass=0;pass<3;pass++) {
        await open(label);
        if(pass===0) await page.screenshot({path:path.join(directory,`${label}.png`)});
        await input(label).press('Escape');
        assert.equal(await input(label).getAttribute('aria-expanded'),'false');
      }
    }
    await writeFile(path.join(directory,'controls-events.json'),JSON.stringify(await page.evaluate(()=>window.__rfqDropdownEvents),null,2));
    await page.goto(`${base}/windows-dropdown-check.html`);
    await page.getByRole('button',{name:'新增标准回复',exact:true}).click();
    await page.getByRole('textbox',{name:'回复标题',exact:true}).fill('Windows 下拉测试');
    await page.getByRole('textbox',{name:'客户要求',exact:true}).fill('测试客户要求');
    await page.getByRole('textbox',{name:'标准回复',exact:true}).fill('测试标准回复');
    await choose('来源类型','历史文档');
    await choose('选择历史文档','测试历史文档.pdf');
    await choose('来源类型','专业人员确认');
    await choose('选择确认人员','测试工程师');
    await choose('来源类型','企业标准口径');
    await page.getByRole('textbox',{name:'口径说明',exact:true}).fill('Windows 口径验证');
    await open('来源类型');
    await page.screenshot({path:path.join(directory,'source-type-open.png')});
    await input('来源类型').press('Escape');
    await page.getByRole('button',{name:'保存草稿',exact:true}).click();
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A')));
    assert.equal(saved.length,1);assert.equal(saved[0].sourceType,'enterprise-standard');
    assert.equal(saved[0].sourceStandardText,'Windows 口径验证');
    result.passed = true;
  } catch(error) {
    result.error = error.stack;
    await page.screenshot({path:path.join(directory,'failure.png')}).catch(()=>{});
  } finally {
    await writeFile(path.join(directory,'events.json'),JSON.stringify(await page.evaluate(()=>window.__rfqDropdownEvents).catch(()=>[]),null,2));
    await writeFile(path.join(directory,'console.json'),JSON.stringify(consoleEvents,null,2));
    await context.tracing.stop({path:path.join(directory,'trace.zip')});
    await context.close();await browser.close();
    console.log(JSON.stringify(result));
  }
}

try {
  await dev.listen();
  await build({root,logLevel:'warn',build:{outDir:dist,emptyOutDir:true,rollupOptions:{input:path.join(root,'windows-dropdown-check.html')}}});
  production = await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port:5174,strictPort:true},logLevel:'warn'});
  for(const [mode,base] of [['dev','http://127.0.0.1:5173'],['production','http://127.0.0.1:5174']]) {
    for(const headless of [false,true]) await scenario(base,mode,headless);
  }
} catch(error) {
  report.error = error.stack;
} finally {
  await dev.close();await production?.close();
  await writeFile(path.join(results,'report.json'),JSON.stringify(report,null,2));
}
if(report.error || report.scenarios.length!==4 || report.scenarios.some(result=>!result.passed)) process.exitCode=1;
