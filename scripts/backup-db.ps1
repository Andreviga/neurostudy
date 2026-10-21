# Backup do banco NeuroStudy para o OneDrive (rodar antes de trocar de máquina)
$syncDir = "D:\OneDrive\FIAP\NeuroStudy-Sync"
New-Item -ItemType Directory -Force $syncDir | Out-Null
docker exec neurostudy-db pg_dump -U postgres -d neurostudy -F c -f /tmp/neurostudy.dump
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump falhou — o container neurostudy-db está rodando?"; exit 1 }
docker cp neurostudy-db:/tmp/neurostudy.dump "$syncDir\neurostudy.dump"
$f = Get-Item "$syncDir\neurostudy.dump"
Write-Host "Backup OK: $($f.FullName) ($([math]::Round($f.Length/1MB,1)) MB, $($f.LastWriteTime))"
