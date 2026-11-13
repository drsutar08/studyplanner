# Opens a feature guide in Word, refreshes its contents page (and other fields), then saves it and exports a PDF
# next to it. Works on a copy so a Word that's already open doesn't lock the original. Word sometimes drops the
# first connection while it is still starting ("disconnected from its clients"), so it waits and tries up to 3 times.
#   powershell -File scripts/guide-to-pdf.ps1 docs/feature-guide/Study-Planner-Feature-Guide.docx
param([Parameter(Mandatory = $true)][string]$Docx)

$ErrorActionPreference = 'Stop'
$src = (Resolve-Path $Docx).Path
$pdf = [System.IO.Path]::ChangeExtension($src, '.pdf')

for ($try = 1; $try -le 3; $try++) {
  $tmp = Join-Path $env:TEMP ("guide-" + [guid]::NewGuid().ToString('N') + '.docx')
  Copy-Item $src $tmp
  $word = $null
  try {
    $word = New-Object -ComObject Word.Application
    Start-Sleep -Seconds 3 # let Word finish starting before it gets work
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($tmp, $false, $false)
    foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
    $doc.Fields.Update() | Out-Null
    $doc.Save()
    $doc.ExportAsFixedFormat($pdf, 17) # 17 = PDF
    # (asking Word for the page count here makes it drop the connection on big guides: the PDF says how many)
    try { $doc.Close($false) } catch { }
    Copy-Item $tmp $src -Force # saved above, with the refreshed contents page
    "$([System.IO.Path]::GetFileName($src)): contents refreshed, PDF saved"
    break
  }
  catch {
    "try $try failed: $($_.Exception.Message)"
    if ($try -eq 3) { throw }
  }
  finally {
    if ($word) {
      try { $word.Quit() } catch { }
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}
