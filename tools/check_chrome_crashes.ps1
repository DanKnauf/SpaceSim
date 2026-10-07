# List recent crash events (Application Error / .NET Runtime / WER) mentioning chrome
$since = (Get-Date).AddDays(-7)
try {
    $evts = Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$since; ProviderName='Application Error'} -MaxEvents 40 -ErrorAction Stop
} catch { $evts = @() }
$chrome = @($evts | Where-Object { $_.Message -match 'chrome' })
Write-Output ("Total Application-Error events (7d): " + @($evts).Count)
Write-Output ("Chrome-related: " + $chrome.Count)
foreach ($e in $chrome | Select-Object -First 10) {
    Write-Output ("--- " + $e.TimeCreated)
    Write-Output ($e.Message.Substring(0, [Math]::Min(400, $e.Message.Length)))
}
# also check the WER ReportArchive / ReportQueue folders for recent chrome GPU crashes
$wer = "$env:LOCALAPPDATA\CrashDumps"
if (Test-Path $wer) {
    Write-Output "CrashDumps:"
    Get-ChildItem $wer -Filter 'chrome*' | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | ForEach-Object {
        Write-Output ("  " + $_.LastWriteTime + "  " + $_.Name)
    }
}
