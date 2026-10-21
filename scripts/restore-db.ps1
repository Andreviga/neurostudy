# Restaura o banco NeuroStudy a partir do dump no OneDrive (SUBSTITUI o banco local)
$dump = "D:\OneDrive\FIAP\NeuroStudy-Sync\neurostudy.dump"
if (-not (Test-Path $dump)) { Write-Error "Dump não encontrado em $dump — rode backup-db.ps1 na outra máquina."; exit 1 }
Write-Host "Restaurando de $dump ($( (Get-Item $dump).LastWriteTime ))..."
docker cp $dump neurostudy-db:/tmp/neurostudy.dump
docker exec neurostudy-db pg_restore -U postgres -d neurostudy --clean --if-exists /tmp/neurostudy.dump
if ($LASTEXITCODE -ne 0) { Write-Warning "pg_restore reportou avisos (normal com --clean na primeira vez)." }
docker exec neurostudy-db psql -U postgres -d neurostudy -t -c "SELECT COUNT(*) || ' topicos' FROM topics;"
Write-Host "Restauração concluída."
