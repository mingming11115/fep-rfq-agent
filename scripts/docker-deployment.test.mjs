import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';

const repo=fileURLToPath(new URL('../',import.meta.url));
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const posix=p=>p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase());

async function run(action,scenario='ok'){
  const dir=await mkdtemp(path.join(os.tmpdir(),'rfq-deploy-'));
  const bin=path.join(dir,'bin'),log=path.join(dir,'calls');
  await mkdir(bin);
  const conf=path.join(dir,'rfq.conf');await writeFile(conf,'server { listen 80; server_name rfq.example; root /srv/rfq; }');
  await writeFile(path.join(bin,'nginx'),`#!/usr/bin/env bash
printf 'nginx\\t%s\\n' "$*" >> "$RFQ_TEST_LOG"
if [[ "$1" == -T ]]; then printf '# configuration file %s:\\n' "$RFQ_TEST_CONF"; cat "$RFQ_TEST_CONF"; fi
if [[ "$1" == -t && "$RFQ_TEST_SCENARIO" == bad-nginx ]] && grep -q proxy_pass "$RFQ_TEST_CONF"; then exit 1; fi
`,{mode:0o755});
  await writeFile(path.join(bin,'docker'),`#!/usr/bin/env bash
printf 'docker' >> "$RFQ_TEST_LOG"; printf '\\t%s' "$@" >> "$RFQ_TEST_LOG"; printf '\\n' >> "$RFQ_TEST_LOG"
case "$1 $2" in
  'image inspect')
    [[ "$*" == *rfq-web:* && "$RFQ_TEST_SCENARIO" == missing-web ]] && exit 1
    if [[ "$*" == *--format* ]]; then
      if [[ "$*" == *rfq-web:* && "$RFQ_TEST_SCENARIO" == mismatch ]]; then echo other-release; else echo same-release; fi
    fi ;;
  'ps -a'|'ps --format') printf 'rfq-service\\nrfq-web\\n' ;;
  'container inspect') echo true ;;
  'exec -i') printf '%s\\0%s\\0%s\\0' "$RFQ_TEST_CONF" 'server { listen 80; server_name rfq.example; location / { proxy_pass http://127.0.0.1:48080; } }' 'rfq.example' ;;
  'exec rfq-web') [[ "$RFQ_TEST_SCENARIO" != bad-web ]] ;;
esac
`,{mode:0o755});
  await writeFile(path.join(bin,'curl'),`#!/usr/bin/env bash
printf 'curl' >> "$RFQ_TEST_LOG"; printf '\\t%s' "$@" >> "$RFQ_TEST_LOG"; printf '\\n' >> "$RFQ_TEST_LOG"
if [[ "$RFQ_TEST_SCENARIO" == bad-api ]]; then echo '{"status":"DOWN"}'; exit 22; fi
if [[ "$RFQ_TEST_SCENARIO" == bad-entry && "$*" == *127.0.0.1:80/* ]]; then echo 'old cached homepage'; exit 0; fi
echo '{"status":"UP"}'
`,{mode:0o755});
  await writeFile(path.join(bin,'sleep'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
  try{
    const child=spawnSync(bash,['-c','export PATH="$RFQ_TEST_BIN:$PATH"; bash "$RFQ_TEST_SCRIPT" "$1"', 'rfq-test',action],{
      cwd:repo,encoding:'utf8',timeout:15000,
      env:{...process.env,RFQ_TEST_BIN:posix(bin),RFQ_TEST_LOG:posix(log),RFQ_TEST_SCRIPT:posix(path.join(repo,'apps/observability/docker-rfq.sh')),
        RFQ_NGINX_BACKUP_DIR:posix(path.join(dir,'backups')),RFQ_TEST_CONF:posix(conf),RFQ_TEST_SCENARIO:scenario,RFQ_STARTUP_TIMEOUT:'2',DB_ENV_FILE:posix(path.join(dir,'absent.env')),SKIP_JAEGER:'1',OTEL_ENABLE:'0'},
    });
    const calls=await readFile(log,'utf8').catch(()=> '');
    assert.ifError(child.error);
    assert.ok(calls.length,'test shell did not reach fake Docker: '+child.stderr);
    return {...child,calls,config:await readFile(conf,'utf8')};
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('build packages both images with one shared release label',async()=>{
  const r=await run('build');assert.equal(r.status,0,r.stdout+r.stderr);
  const builds=r.calls.split('\n').filter(line=>line.startsWith('docker\tbuild\t'));
  assert.equal(builds.length,2,'backend and frontend must both be built');
  assert.match(builds[0],/rfq-service:onlyoffice/);assert.match(builds[1],/rfq-web:onlyoffice/);
  const release=line=>line.match(/com\.naura\.rfq\.release=([^\t]+)/)?.[1];
  assert.ok(release(builds[0]));assert.equal(release(builds[0]),release(builds[1]));
  assert.match(builds[1],/apps\/web\/Dockerfile/);
});

for(const scenario of ['missing-web','mismatch'])test(`start refuses ${scenario} before replacing existing containers`,async()=>{
  const r=await run('start',scenario);
  assert.notEqual(r.status,0,r.stdout+r.stderr);
  assert.doesNotMatch(r.calls,/docker\t(?:rm|run)\t/);
});

test('start checks backend and both editor runtimes before reporting ready',async()=>{
  const r=await run('start');assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.calls,/docker\trun\t[^\n]*--name\trfq-service\t/);
  assert.match(r.calls,/docker\trun\t[^\n]*--name\trfq-web\t/);
  assert.match(r.calls,/rfq-office-documents:\/app\/data/);
  assert.match(r.calls,/127\.0\.0\.1:48080:8080/);
  assert.match(r.calls,/curl\t[^\n]*--fail[^\n]*\/actuator\/health/);
  assert.match(r.calls,/docker\texec\trfq-web\t[^\n]*check-rfq-web\.sh\t--full/);
});

for(const scenario of ['bad-api','bad-web'])test(`unhealthy ${scenario} fails startup instead of claiming success`,async()=>{
  const r=await run('start',scenario);
  assert.notEqual(r.status,0,r.stdout+r.stderr);
  assert.doesNotMatch(r.stdout,/前后端已就绪/);
  assert.match(r.calls,/docker\tlogs\t/,'failure must include diagnostic logs');
});

test('stop removes both application containers while retaining document volumes',async()=>{
  const r=await run('stop');assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.calls,/docker\trm\t-f\t[^\n]*rfq-web[^\n]*rfq-service/);
  assert.doesNotMatch(r.calls,/docker\tvolume\t|docker\trm\t[^\n]*\t-v(?:\t|$)/);
});

test('invalid nginx migration restores the original HTTP configuration',async()=>{
 const r=await run('start','bad-nginx');assert.notEqual(r.status,0);
 assert.match(r.config,/root \/srv\/rfq/);assert.doesNotMatch(r.config,/proxy_pass/);
});

test('a host entry still serving old files fails startup and restores nginx',async()=>{
 const r=await run('start','bad-entry');assert.notEqual(r.status,0);
 assert.match(r.config,/root \/srv\/rfq/);assert.doesNotMatch(r.stdout,/前后端已就绪/);
});

test('HTTPS setup can explicitly route all browser requests to the web container',()=>{
  const child=spawnSync(bash,[posix(path.join(repo,'deploy/https/setup-https.sh')),'--dry-run','--container','--web-port','49080','-n','rfq.example'],{cwd:repo,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stdout+child.stderr);
  assert.match(child.stdout,/127\.0\.0\.1:49080/);
  assert.doesNotMatch(child.stdout,/前端目录 .* 不存在/);
});

test('HTTPS setup retains explicit legacy static hosting',()=>{
  const child=spawnSync(bash,[posix(path.join(repo,'deploy/https/setup-https.sh')),'--dry-run','--static','-w','/srv/legacy-web','-n','rfq.example'],{cwd:repo,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stdout+child.stderr);
  assert.match(child.stdout,/\/srv\/legacy-web/);
});
