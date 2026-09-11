#Requires -Version 5.1
<#
  云迹(yunji-web) · Win11 开发环境一键准备脚本
  步骤：
    1) 安装 mise（优先 winget，失败回退官网脚本）
    2) 安装 node 24.13.0 并设为全局（与开发机一致；DSH 的 sharp 原生模块绑定该 Node ABI）
    3) 全局安装 @deepseek-ai/dsh@0.1.1-rc.2
  用法（普通用户即可，无需管理员）：
    powershell -ExecutionPolicy Bypass -File scripts\setup-dsh-win11.ps1
#>
$ErrorActionPreference = "Stop"

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host "==== 1/3 安装 mise ===="
Refresh-Path
if (Get-Command mise -ErrorAction SilentlyContinue) {
  Write-Host "mise 已存在，跳过安装"
} else {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "通过 winget 安装 mise ..."
    winget install jdx.mise --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw "winget 安装 mise 失败 (exit $LASTEXITCODE)" }
  } else {
    Write-Host "未找到 winget，改用官网脚本安装 ..."
    Invoke-RestMethod -Uri "https://mise.run" | Invoke-Expression
  }
  Refresh-Path
  # winget / 官网脚本可能写入不同目录，逐一尝试加入 PATH
  foreach ($c in @("$env:USERPROFILE\.local\bin", "$env:LOCALAPPDATA\mise", "$env:LOCALAPPDATA\Programs\mise\bin")) {
    if (Test-Path (Join-Path $c "mise.exe")) { $env:Path = $c + ";" + $env:Path; break }
  }
}
if (-not (Get-Command mise -ErrorAction SilentlyContinue)) {
  throw "mise 仍未就绪：请【新开一个终端】后重跑本脚本，或手动执行 winget install jdx.mise"
}
Write-Host "mise 版本: $(mise --version)"

Write-Host "==== 2/3 安装 node 24.13.0 并设为全局 ===="
mise install node@24.13.0
if ($LASTEXITCODE -ne 0) { throw "node 24.13.0 安装失败" }
mise use -g node@24.13.0
Write-Host "node: $(mise exec node@24.13.0 -- node --version)   npm: $(mise exec node@24.13.0 -- npm --version)"

Write-Host "==== 3/3 全局安装 DSH ===="
mise exec node@24.13.0 -- npm install -g @deepseek-ai/dsh@0.1.1-rc.2
if ($LASTEXITCODE -ne 0) { throw "DSH 安装失败" }
mise exec node@24.13.0 -- npm ls -g @deepseek-ai/dsh --depth=0

Write-Host ""
Write-Host "==== 完成 ✔ 后续 4 步 ===="
Write-Host "1) 新开一个终端（让 PATH 生效）"
Write-Host "2) 把 mise 挂进 PowerShell 配置（一次性；否则新终端里 node/npm/dsh 不生效）："
Write-Host "   在 `$PROFILE 末尾加一行（二选一）："
Write-Host "     Windows PowerShell 5.1： mise activate powershell | Out-String | Invoke-Expression"
Write-Host "     PowerShell 7 (pwsh)：     mise activate pwsh | Out-String | Invoke-Expression"
Write-Host "   没有 `$PROFILE 就先执行： New-Item -Path `$PROFILE -Force"
Write-Host "3) 克隆项目并装前端依赖："
Write-Host "   git clone https://github.com/hinotoyk/yunji-web.git"
Write-Host "   cd yunji-web\front; npm ci; npm run dev"
Write-Host "4) 在项目根运行 dsh 开始开发（.mise.toml 已钉 node 24.13.0，进项目自动对齐版本）"
