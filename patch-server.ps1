# Patch server.js to add express.static for the public/ folder
$file = "E:\bhava-cloud\server.js"
$content = Get-Content $file -Raw

$oldLine = "app.use('/admin',     routesAdmin);"
$newBlock = @"
app.use('/admin',     routesAdmin);

// -- Static files (teacher dashboard HTML) --
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
"@

if ($content -match [regex]::Escape("express.static")) {
    Write-Host "server.js already has express.static -- no patch needed." -ForegroundColor Green
} elseif ($content -match [regex]::Escape($oldLine)) {
    $content = $content.Replace($oldLine, $newBlock)
    Set-Content $file $content -NoNewline
    Write-Host "Patched server.js successfully." -ForegroundColor Green
} else {
    Write-Host "ERROR: Could not find insertion point in server.js" -ForegroundColor Red
}
