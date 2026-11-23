import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Tokenize quotes/comments as units; braces in quoted values are not blocks.
function blocks(source){
 const tokens=[...source.matchAll(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[{};]|[^\s{};"'#\\]+/g)].filter(m=>!m[0].startsWith('#'));
 let index=0;
 function parse(){const nodes=[];let head=[];while(index<tokens.length){const t=tokens[index++];if(t[0]==='}')return nodes;if(t[0]===';'){nodes.push({head,start:head[0]?.index,end:t.index+1});head=[];}else if(t[0]==='{'){const children=parse();nodes.push({head,children,start:head[0]?.index,end:tokens[index-1].index+1,open:t.index});head=[];}else head.push(t);}if(head.length)throw Error('Incomplete nginx directive');return nodes;}
 return parse();
}
const words=node=>node.head.map(t=>t[0]).join(' ');
export function migrate(source,port,filename){
 if(!/^\d+$/.test(String(port))||port<1||port>65535)throw Error('Invalid web port');
 const edits=[];
 const tree=blocks(source);
 const count=nodes=>nodes.reduce((n,node)=>n+(words(node)==='server'?1:node.children?count(node.children):0),0);
 const singleSite=count(tree)===1;
 function visit(nodes){for(const server of nodes){if(words(server)!=='server'){if(server.children)visit(server.children);continue;}
 const children=server.children||[],body=source.slice(server.start,server.end);
 if(!children.some(n=>/^listen\s+(?:[^\s:]+:)?80(?:\s|$)/.test(words(n))))continue;
 const knownRoot=nodes=>nodes.some(n=>/^(?:root|alias) ["']?\/data\/naura-ai(?:\/|["']?$)/.test(words(n))||(n.children&&knownRoot(n.children)));
 if(!(singleSite&&/rfq/i.test(filename))&&!knownRoot(children)&&!children.some(n=>/^(?:root .*rfq|location .*\/api\/rfq)/i.test(words(n))))continue;
 const marker=`# rfq-container-port ${port} v2`;
 if(body.includes(marker))continue;
 const remove=children.filter(n=>/^location (?:= )?\/(?:\s|$|index\.html(?:\s|$)|assets(?:\/|\s)|craft-editors(?:\/|\s)|api\/(?:rfq|craft|office)(?:\/|\s))/.test(words(n))||/^location \^~ \/(?:assets|craft-editors|api\/(?:rfq|craft|office))\//.test(words(n))||(/^location ~/.test(words(n))&&/js|css|wasm|pdf|docx/.test(words(n))));
 for(const n of remove)edits.push({start:n.start,end:n.end,text:''});
 const routes=['/','^~ /assets/','^~ /craft-editors/','^~ /api/rfq/','^~ /api/craft/','^~ /api/office/'];
 edits.push({start:server.end-1,end:server.end-1,text:`\n    ${marker}\n`+routes.map(route=>`    location ${route} {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_set_header Host $http_host;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 300s;\n    }\n`).join('')});
 }}visit(tree);
 if(!edits.length)return source.includes(`# rfq-container-port ${port}`)?source:null;
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 return source;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dump=readFileSync(0,'utf8'),sections=dump.split(/^# configuration file (.+):\s*$/m);let matched=0;
 for(let i=1;i<sections.length;i+=2){const file=sections[i],source=sections[i+1];const output=migrate(source,process.argv[2],file);if(output!==null){matched++;process.stdout.write(file+'\0'+output+'\0');}}
 if(!matched){console.error('未识别到 HTTP 80 的 RFQ 站点，未修改 nginx');process.exitCode=1;}
}
