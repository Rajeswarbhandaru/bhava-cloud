# Deploy-ToRender.ps1
# Bhāva Tech — Push cloud dashboard + server changes to GitHub → auto-deploys on Render
# Run from E:\bhaavajaalam-main\ or any folder where you have the bhava-cloud repo
#
# PREREQUISITES:
#   - gh CLI installed and authenticated (gh auth login)
#   - bhava-cloud repo cloned locally (or copy files into it)
#
# USAGE:
#   .\Deploy-ToRender.ps1 -RepoPath "C:\path\to\bhava-cloud"

param(
    [string]$RepoPath = "C:\bhava-cloud"
)

Write-Host "`n=== Bhāva Cloud — Deploy to Render ===" -ForegroundColor Cyan

# 1. Navigate to repo
if (-not (Test-Path $RepoPath)) {
    Write-Host "ERROR: Repo path not found: $RepoPath" -ForegroundColor Red
    Write-Host "Clone the repo first:  gh repo clone Rajeswarbhandaru/bhava-cloud $RepoPath"
    exit 1
}
Set-Location $RepoPath

# 2. Show status
Write-Host "`n[1] Git status..." -ForegroundColor Yellow
git status

# 3. Stage all changes
Write-Host "`n[2] Staging all changes..." -ForegroundColor Yellow
git add -A

# 4. Commit
$msg = "Deploy: cloud dashboard + static serving $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "`n[3] Committing: $msg" -ForegroundColor Yellow
git commit -m $msg

# 5. Push
Write-Host "`n[4] Pushing to GitHub (main)..." -ForegroundColor Yellow
git push origin main

Write-Host "`n=== Push complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Render will auto-deploy in ~2 minutes." -ForegroundColor Cyan
Write-Host "Watch progress: https://dashboard.render.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "After deploy completes, update Render env vars:" -ForegroundColor Yellow
Write-Host "  FRONTEND_URL  = https://bhava-cloud.onrender.com/bhava-teacher-dashboard.html"
Write-Host "  GOOGLE_REDIRECT_URI = https://bhava-cloud.onrender.com/auth/google/callback"
Write-Host ""
Write-Host "Dashboard URL (share with teacher):" -ForegroundColor Green
Write-Host "  https://bhava-cloud.onrender.com/bhava-teacher-dashboard.html" -ForegroundColor White
