$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path -LiteralPath $bundledNode) {
  $node = $bundledNode
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
  $node = "node"
} else {
  throw "Node.js не найден. Установите Node.js 20+ или запустите проект из Codex Runtime."
}

Set-Location -LiteralPath $projectRoot
& $node "src\server.js"
