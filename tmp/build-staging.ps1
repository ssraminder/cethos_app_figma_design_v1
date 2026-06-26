$ErrorActionPreference = 'Continue'
$STAGE = 'C:\Users\RaminderShah\Cethos-Team-Dropbox-Upload\01_Clients'
$SAVED = 'C:\Users\RaminderShah\.claude\projects\D--cethos-portal-cethos-app-figma-design-v1\d07ed558-b59f-419a-a324-4823752fb648\tool-results\mcp-022e13ac-4c28-4b68-808f-54916af457c5-list_folder-1782485711152.txt'
$LOG = 'C:\Users\RaminderShah\Cethos-Team-Dropbox-Upload\_copy-log.txt'
$TRSB = 'C:\Users\RaminderShah\Dropbox\Projects Folder\TRSB'
$TP = 'C:\Users\RaminderShah\Dropbox\Projects Folder\Transperfect'

# Robust wipe (robocopy empty-mirror handles >260-char Trados package paths
# that Remove-Item chokes on).
if (Test-Path $STAGE) {
  $empty = Join-Path (Split-Path $STAGE) '_empty_tmp'
  New-Item -ItemType Directory -Force $empty | Out-Null
  $null = robocopy $empty $STAGE /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1
  Remove-Item -Recurse -Force -LiteralPath $STAGE -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force -LiteralPath $empty -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force (Split-Path $LOG) | Out-Null
Set-Content -LiteralPath $LOG ''

# ============================================================================
# TRSB — local folders already map cleanly to the generic ISO step folders.
# (Unchanged from the verified version.)
# ============================================================================
function Map-Iso($name) {
  if ($name -in @('from client','From client','From Client')) { return '01_Source\v1' }
  if ($name -in @('translation','Trans','transalation','translation - Copy','Translation')) { return '10_Translation\v1' }
  if ($name -in @('delivery','Deliver','deliverables','Deliverables','Delivery')) { return '30_Final-Deliverable\v1' }
  if ($name -in @('proof','Proof','Reviewed','Reviewed files','QM')) { return '20_QA-Review\v1' }
  if ($name -in @('Internal','internal','File prep','docComp')) { return '02_Reference\v1' }
  return '02_Reference\v1'
}

function Find-Source($srcbase, $code, $prj) {
  $top = Get-ChildItem -LiteralPath $srcbase -Directory -ErrorAction SilentlyContinue
  $m = $top | Where-Object { $_.Name -like "$code (PRJ-*" } | Select-Object -First 1
  if (-not $m) { $m = $top | Where-Object { $_.Name -like "$code (*" } | Select-Object -First 1 }
  if (-not $m) { $m = $top | Where-Object { $_.Name -like "*($prj)" } | Select-Object -First 1 }
  if (-not $m) { $m = $top | Where-Object { $_.Name -eq $code } | Select-Object -First 1 }
  if (-not $m) {
    $m = Get-ChildItem -LiteralPath $srcbase -Directory -Recurse -Depth 1 -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "$code (*" -or $_.Name -eq $code } | Select-Object -First 1
  }
  return $m
}

function Process-Order($client, $rel, $srcbase) {
  $prjfolder = ($rel -split '/')[0]
  $prj = [regex]::Match($prjfolder, 'PRJ-2026-\d+').Value
  $code = $prjfolder -replace '^PRJ-2026-\d+ - ', ''
  $src = Find-Source $srcbase $code $prj
  if (-not $src) { Add-Content -LiteralPath $LOG "NO-SOURCE  $client | code=$code prj=$prj | $rel"; return }
  $dest = Join-Path $STAGE (Join-Path $client ($rel -replace '/', '\'))
  foreach ($item in (Get-ChildItem -LiteralPath $src.FullName -ErrorAction SilentlyContinue)) {
    $iso = Map-Iso $item.Name
    $isodest = Join-Path $dest $iso
    if ($item.PSIsContainer) {
      $target = Join-Path $isodest $item.Name
      $null = robocopy $item.FullName $target /E /NFL /NDL /NJH /NJS /NP /NC /NS /R:1 /W:1
    } else {
      if (-not (Test-Path -LiteralPath $isodest)) { New-Item -ItemType Directory -Force $isodest | Out-Null }
      Copy-Item -LiteralPath $item.FullName -Destination $isodest -Force -ErrorAction SilentlyContinue
    }
  }
  $n = (Get-ChildItem -LiteralPath $dest -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Add-Content -LiteralPath $LOG "OK  $client | $code -> $($src.Name) | $n files"
}

$content = Get-Content -Raw -LiteralPath $SAVED
$trsbOrders = [regex]::Matches($content, '01_Clients/TRSB/([^"/]+/ORD-[^"/]+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
foreach ($rel in $trsbOrders) { Process-Order 'TRSB' $rel $TRSB }

# ============================================================================
# TransPerfect — TP-phase nomenclature, per order.
#
# Each TP local source folder nests one or more dated ROUND subfolders, each
# containing: "from client" (source), "delivery" (final), and a work subfolder
# (translation | postedit | proof | QMed/QM | backtransPE | editing | ...).
# We map each work subfolder to THIS order's actual team-Dropbox step folder
# (work = 10_<TP phase>, final = 30/40_Final-Deliverable), grouping by the
# dated round folder so rounds/languages stay separate and never collide.
#
# 'work' / 'final' below mirror the renamed team-Dropbox skeleton folders.
# Orders 10250/10300/10333 keep the generic 10_Translation pending portal
# confirmation of their TP phase (tracked as a follow-up artifact).
# ============================================================================
function Map-Tp($name, $workFolder, $finalFolder) {
  $n = $name.ToLower()
  if ($n -like 'from client*') { return '01_Source\v1' }
  if ($n -in @('delivery','delilvery','deliverables','deliver')) { return "$finalFolder\v1" }
  if ($n -in @('internal','txlf_updated','file prep','doccomp','reference')) { return '02_Reference\v1' }
  return "$workFolder\v1"   # translation/postedit/proof/qmed/qm/backtranspe/editing/revised/redaction...
}

$tpClient = 'Transperfect Translations Inc.'
$tpOrders = @(
  @{ rel='PRJ-2026-00050 - PR0057749/ORD-2026-10247 - Screenshot Review - en-hi - 2026-05-28'; code='PR0057749'; work='10_Translation'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00054 - PR0056876/ORD-2026-10250 - Editing - en-pa - 2026-05-29'; code='PR0056876'; work='10_Translation'; final='40_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00068 - US2286012/ORD-2026-10268 - Back Translation - bn-en - 2026-06-01'; code='US2286012'; work='10_BackTransPE'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00071 - NL0050905/ORD-2026-10275 - Editing - hi-en - 2026-06-02'; code='NL0050905'; work='10_QM'; final='40_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00072 - US2294973/ORD-2026-10276 - Editing - en-hi - 2026-06-02'; code='US2294973'; work='10_PostEdit'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00075 - G30033201/ORD-2026-10278 - Proofreading - en-hi - 2026-06-02'; code='G30033201'; work='10_Proof'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00076 - G30033202/ORD-2026-10279 - Proofreading - en-hi - 2026-06-02'; code='G30033202'; work='10_Proof'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00093 - US2286721/ORD-2026-10299 - Standard Translation - hi-en - 2026-06-03'; code='US2286721'; work='10_Translation'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00094 - US2286740/ORD-2026-10300 - Editing - hi-en - 2026-06-03'; code='US2286740'; work='10_Translation'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00095 - US2283177/ORD-2026-10301 - Back Translation - ta-en - 2026-06-03'; code='US2283177'; work='10_BackTransPE'; final='40_Final-Deliverable'; lang='taIN' },
  @{ rel='PRJ-2026-00122 - US2291500/ORD-2026-10333 - Screenshot Review - en-hi - 2026-06-11'; code='US2291500'; work='10_Translation'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00136 - US2302311/ORD-2026-10348 - Editing - en-hi - 2026-06-13'; code='US2302311'; work='10_PostEdit'; final='30_Final-Deliverable'; lang=$null },
  @{ rel='PRJ-2026-00095 - US2283177/ORD-2026-10404 - Back Translation - gu-en - 2026-06-23'; code='US2283177'; work='10_BackTransPE'; final='30_Final-Deliverable'; lang='tguN' }
)

foreach ($o in $tpOrders) {
  $prj = [regex]::Match($o.rel, 'PRJ-2026-\d+').Value
  $src = Find-Source $TP $o.code $prj
  if (-not $src) { Add-Content -LiteralPath $LOG "NO-SOURCE  TP | code=$($o.code) | $($o.rel)"; continue }
  $destBase = Join-Path $STAGE (Join-Path $tpClient ($o.rel -replace '/', '\'))
  $rounds = Get-ChildItem -LiteralPath $src.FullName -Directory -ErrorAction SilentlyContinue
  if ($o.lang) { $rounds = $rounds | Where-Object { $_.Name -like "*$($o.lang)*" } }
  foreach ($round in $rounds) {
    foreach ($sub in (Get-ChildItem -LiteralPath $round.FullName -ErrorAction SilentlyContinue)) {
      if ($sub.PSIsContainer) {
        $iso = Map-Tp $sub.Name $o.work $o.final
        $dest = Join-Path $destBase (Join-Path $iso $round.Name)
        $null = robocopy $sub.FullName $dest /E /NFL /NDL /NJH /NJS /NP /NC /NS /R:1 /W:1
      } else {
        $dest = Join-Path $destBase (Join-Path '02_Reference\v1' $round.Name)
        if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
        Copy-Item -LiteralPath $sub.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
      }
    }
  }
  $n = (Get-ChildItem -LiteralPath $destBase -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Add-Content -LiteralPath $LOG "OK  TP | $($o.code) -> $($src.Name) | $n files | work=$($o.work)"
}

# ============================================================================
# Summary
# ============================================================================
$log = Get-Content -LiteralPath $LOG
Write-Output "==== build complete ===="
Write-Output ("OK:        " + ($log | Select-String '^OK').Count)
Write-Output ("NO-SOURCE: " + ($log | Select-String '^NO-SOURCE').Count)
$files = Get-ChildItem -LiteralPath $STAGE -Recurse -File -ErrorAction SilentlyContinue
Write-Output ("staged files: " + $files.Count)
Write-Output ("staged MB:    " + [math]::Round(($files | Measure-Object -Sum Length).Sum/1MB,1))
Write-Output ("staged >1MB:  " + (($files | Where-Object { $_.Length -gt 1MB }).Count))
Write-Output "--- NO-SOURCE ---"
$log | Select-String '^NO-SOURCE' | ForEach-Object { Write-Output $_.Line }
Write-Output "--- TP per-order ---"
$log | Select-String '^OK  TP' | ForEach-Object { Write-Output $_.Line }
