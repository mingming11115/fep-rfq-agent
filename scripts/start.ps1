param([switch]$DatabaseOnly)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskTools=Join-Path $env:USERPROFILE '.rfq-tools'
$taskRuntime=Join-Path $taskRoot '.local\dual-data-demo'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
function Test-DemoPort([int]$Port){
 $taskTcp=New-Object System.Net.Sockets.TcpClient
 try{$taskTcp.Connect('127.0.0.1',$Port);return $true}catch{return $false}finally{$taskTcp.Dispose()}
}
function Wait-DemoPort([int]$Port){
 for($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++){
  if(Test-DemoPort $Port){return}
  Start-Sleep -Milliseconds 500
 }
 throw "Service did not start on port $Port. Check $taskRuntime."
}
# Reuse the configured local database. Never initialize or replace a data directory.
if(!$env:RFQ_DB_URL -and !(Test-DemoPort 3306)){
 $taskMysqlHome=if($env:MYSQL_HOME){$env:MYSQL_HOME}else{Join-Path $taskTools 'mysql'}
 $taskMysqld=Join-Path $taskMysqlHome 'bin\mysqld.exe'
 $taskConfig=if($env:MYSQL_CONFIG){$env:MYSQL_CONFIG}else{Join-Path $taskTools 'mysql-my.ini'}
 if(!(Test-Path -LiteralPath $taskMysqld) -or !(Test-Path -LiteralPath $taskConfig)){
  throw 'Start your configured MySQL first, or set MYSQL_HOME and MYSQL_CONFIG. No database will be initialized by this script.'
 }
 Start-Process -FilePath $taskMysqld -ArgumentList "--defaults-file=`"$taskConfig`"" -WindowStyle Hidden | Out-Null
 Wait-DemoPort 3306
}
Write-Output 'Using configured MySQL (default 127.0.0.1:3306 / rfq).'
if($DatabaseOnly){exit 0}
$taskNpm=(Get-Command npm.cmd -ErrorAction Stop).Source
function Start-DemoNpm([string]$Script,[string]$Label,[int]$Port){
 if(Test-DemoPort $Port){Write-Output "$Label already listening on $Port; verify it is the intended entry.";return}
 $taskArgs='/d /s /c ""'+$taskNpm+'" run '+$Script+'"'
 Start-Process -FilePath $env:ComSpec -ArgumentList $taskArgs -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRuntime "$Label.log") -RedirectStandardError (Join-Path $taskRuntime "$Label.err.log") | Out-Null
 Wait-DemoPort $Port
}
Start-DemoNpm 'dev:api' 'api' 48084
Start-DemoNpm 'dev' 'web' 5173
Write-Output 'RFQ workspace: http://127.0.0.1:5173'
