# Cria a aplicação do Jarvis na Magalu (ID Magalu) e grava as credenciais no servidor, sem mostrar o segredo.
# Uso: powershell -ExecutionPolicy Bypass -File "...\ops\configurar-magalu.ps1"
# 1) baixa a ferramenta oficial idm (github.com/luizalabs/id-magalu-cli), se ainda não tiver;
# 2) abre o login do ID Magalu no navegador (use o login da loja e aceite "Criar/Atualizar client");
# 3) confere os escopos disponíveis, cria a aplicação e grava MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET no Supabase.
# O Client Secret nunca é impresso: vai direto para os segredos do servidor.
$ErrorActionPreference = 'Continue'
$sb = 'C:\Users\guilherme.klemann\.tools\supabase.exe'
$ref = 'olxapwaxmzqclitlylzv'
$dir = Join-Path $env:LOCALAPPDATA 'Jarvis'
$idm = Join-Path $dir 'idm.exe'
$escopos = 'open:order-order-seller:read open:order-delivery-seller:read open:order-invoice-seller:read open:order-financial-report-seller:read'
$redirect = 'https://olxapwaxmzqclitlylzv.supabase.co/functions/v1/oauth-callback'

# 1. Ferramenta oficial
if (-not (Test-Path $idm)) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  Write-Host 'Baixando a ferramenta oficial do ID Magalu (idm 1.1.0, 13 MB)...'
  Invoke-WebRequest -UseBasicParsing -UseDefaultCredentials -ProxyUseDefaultCredentials 'https://github.com/luizalabs/id-magalu-cli/releases/download/1.1.0/idm-windows-1.1.0.exe' -OutFile $idm
  if ((Get-Item $idm).Length -ne 13193728) { Remove-Item $idm; Write-Host 'Download incompleto. Rode de novo.'; exit 1 }
}

# 2. Login (abre o navegador)
Write-Host ''
Write-Host 'Vai abrir o login do ID Magalu no navegador. Entre com o login da loja e ACEITE as permissoes de criar/atualizar client.'
$sessao = (& $idm client list 2>&1 | Out-String)
if ($sessao -match 'No clients found|CLIENT|│') { Write-Host 'Sessao do ID Magalu ja ativa: login nao e necessario.' }
else {
  & $idm login
  if ($LASTEXITCODE -ne 0) { Write-Host 'Login nao concluido. Rode de novo.'; exit 1 }
}

# 3. Escopos disponíveis (lista pública, sem segredo) - fica salva para conferência
$lista = (& $idm scope list 2>&1 | Out-String)
$lista | Out-File -Encoding utf8 (Join-Path $dir 'magalu-escopos.txt')
$faltam = @($escopos.Split(' ') | Where-Object { $lista -notmatch [regex]::Escape($_) })
if ($faltam.Count) {
  Write-Host "Escopos nao encontrados na lista da Magalu: $($faltam -join ', ')"
  Write-Host "A lista completa ficou em $dir\magalu-escopos.txt. Avise o Claude para ajustar."
  exit 1
}

# 4. Cria a aplicação e grava as credenciais sem exibir o segredo
$saida = (& $idm client create `
  --name "Jarvis Compra Store" `
  --description "Sistema interno da Compra Store: conciliacao de pedidos, comissoes e fretes." `
  --terms-of-use "https://ecombalance.com.br/termos.html" `
  --privacy-term "https://ecombalance.com.br/privacidade.html" `
  --redirect-uris $redirect `
  --audience "https://api.magalu.com https://services.magalu.com" `
  --scopes $escopos `
  --scopes-default $escopos 2>&1 | Out-String)
$id = [regex]::Match($saida, '(?i)client[\s_-]*id\W+([A-Za-z0-9._-]{8,})').Groups[1].Value
$segredo = [regex]::Match($saida, '(?i)client[\s_-]*secret\W+([A-Za-z0-9._~+/=-]{8,})').Groups[1].Value
if (-not $id -or -not $segredo) {
  # Mostra a resposta com qualquer sequência longa mascarada, para diagnóstico sem expor segredo.
  Write-Host 'Nao consegui ler o Client ID/Secret da resposta. Resposta (valores longos mascarados):'
  Write-Host ([regex]::Replace($saida, '[A-Za-z0-9._~+/=-]{20,}', '****'))
  exit 1
}
& $sb secrets set --project-ref $ref "MAGALU_CLIENT_ID=$id" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar MAGALU_CLIENT_ID.'; exit 1 }
& $sb secrets set --project-ref $ref "MAGALU_CLIENT_SECRET=$segredo" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar MAGALU_CLIENT_SECRET.'; exit 1 }
$segredo = $null; $saida = $null
Write-Host "OK: aplicacao criada (Client ID $id) e credenciais gravadas no servidor."
Write-Host 'Agora: Jarvis > Integracoes > Magalu > Conectar.'
