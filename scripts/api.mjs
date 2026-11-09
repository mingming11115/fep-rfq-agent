import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const goals={dev:['spring-boot:run'],test:['test'],build:['verify']};
const args=goals[process.argv[2]];
if(!args)throw new Error('Usage: node scripts/api.mjs dev|test|build');
const tools=path.join(os.homedir(),'.rfq-tools');
const localMaven=path.join(tools,'apache-maven-3.9.16','bin',process.platform==='win32'?'mvn.cmd':'mvn');
const executable=process.env.MVN_CMD||(existsSync(localMaven)?localMaven:process.platform==='win32'?'mvn.cmd':'mvn');
const env={...process.env};
if(process.argv[2]==='dev')env.SERVER_PORT||='48084';
const localJava=path.join(tools,'jdk-17.0.20.1+1');
if(!env.JAVA_HOME&&existsSync(localJava))env.JAVA_HOME=localJava;
if(env.JAVA_HOME)env.PATH=path.join(env.JAVA_HOME,'bin')+path.delimiter+env.PATH;
if(/["\r\n]/.test(executable))throw new Error('MVN_CMD must be an unquoted executable path.');
const options={cwd:path.join(root,'apps/api'),env,stdio:'inherit',windowsHide:true};
const child=process.platform==='win32'
 ?spawn(env.ComSpec||'cmd.exe',['/d','/s','/c',`""${executable}" ${args.join(' ')}"`],{...options,windowsVerbatimArguments:true})
 :spawn(executable,args,options);
child.on('error',error=>{console.error(`Cannot run Maven: ${error.message}. Install Java 17/Maven and set JAVA_HOME, PATH or MVN_CMD.`);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
