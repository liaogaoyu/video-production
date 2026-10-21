param([string]$DraftRoot)
$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$manifest = [IO.File]::ReadAllText((Join-Path $source 'timeline.json'), $utf8) | ConvertFrom-Json
if ($manifest.kind -ne 'storydock-jianying' -or $manifest.id -notmatch '^[0-9A-F-]{36}$') { throw 'Invalid package' }
if (!$DraftRoot) {
  $default = Join-Path $env:LOCALAPPDATA 'JianyingPro\User Data\Projects\com.lveditor.draft'
  Write-Host 'Close Jianying first. Paste the draft root shown in its settings, or press Enter for:'
  Write-Host $default
  $DraftRoot = Read-Host 'Draft root'
  if (!$DraftRoot) { $DraftRoot = $default }
}
if (!(Test-Path -LiteralPath $DraftRoot -PathType Container)) { throw 'Draft root does not exist. Check Jianying settings.' }
$DraftRoot = [IO.Path]::GetFullPath($DraftRoot)
$folder = $manifest.folderName
if (!$folder) { $folder = 'Storydock-' + $manifest.id }
if ($folder -match '[/\\\x00]' -or $folder.StartsWith('.')) { throw 'Unsafe draft folder' }
$dest = Join-Path $DraftRoot $folder
if (Test-Path -LiteralPath $dest) { throw 'Already imported. The existing draft was not changed.' }
foreach ($clip in $manifest.clips) {
  if ($clip.file -match '[/\\\x00]' -or $clip.file.StartsWith('.')) { throw 'Unsafe media name' }
  if (!(Test-Path -LiteralPath (Join-Path $source ('draft\media\' + $clip.file)) -PathType Leaf)) { throw ('Missing media: ' + $clip.file) }
}
function Update-Paths($value) {
  if ($value -is [string]) { return $value.Replace('__STORYDOCK_DRAFT_PATH__', $dest.Replace('\','/')).Replace('__STORYDOCK_DRAFT_ROOT__', $DraftRoot.Replace('\','/')) }
  if ($value -is [System.Management.Automation.PSCustomObject]) {
    foreach ($property in $value.PSObject.Properties) { $property.Value = Update-Paths $property.Value }
    return $value
  }
  if ($value -is [array]) { $items = @(); foreach ($item in $value) { $items += ,(Update-Paths $item) }; return ,$items }
  return $value
}
$documents = @{}
foreach ($name in @('draft_content.json','draft_info.json','draft_meta_info.json')) {
  $doc = Update-Paths ([IO.File]::ReadAllText((Join-Path $source ('draft\' + $name)), $utf8) | ConvertFrom-Json)
  if ($name -ne 'draft_meta_info.json') { $doc.platform.os = 'windows' }
  $documents[$name] = $doc | ConvertTo-Json -Depth 100
}
try {
  [IO.Directory]::CreateDirectory((Join-Path $dest 'media')) | Out-Null
  foreach ($clip in $manifest.clips) { [IO.File]::Copy((Join-Path $source ('draft\media\' + $clip.file)), (Join-Path $dest ('media\' + $clip.file)), $false) }
  foreach ($name in $documents.Keys) { [IO.File]::WriteAllText((Join-Path $dest $name), $documents[$name], $utf8) }
} catch {
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  throw
}
Write-Host ('Imported: ' + $dest)
Write-Host 'Open Jianying again to find the new draft.'
