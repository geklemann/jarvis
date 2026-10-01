# Grava uma credencial do Jarvis no Supabase (usado pelas funções) e, se possível, no GitHub.
# Uso: powershell -ExecutionPolicy Bypass -File "...\ops\gravar-segredo.ps1" BLING_CLIENT_SECRET
# Copie a credencial (Ctrl+C) e rode o comando; o valor é lido da área de transferência e não aparece na tela.
param([Parameter(Mandatory = $true)][string]$Nome)

# Tamanhos esperados para detectar cópia errada (mínimo, máximo).
$regras = @{
  'BLING_CLIENT_ID' = @(30, 60); 'BLING_CLIENT_SECRET' = @(30, 120)
  'ML_CLIENT_ID' = @(8, 30); 'ML_CLIENT_SECRET' = @(20, 60)
  'SHOPEE_PARTNER_ID' = @(4, 12); 'SHOPEE_PARTNER_KEY' = @(30, 100)
  'MAGALU_CLIENT_ID' = @(10, 80); 'MAGALU_CLIENT_SECRET' = @(10, 120)
  'ANTHROPIC_API_KEY' = @(40, 200); 'CNPJA_API_KEY' = @(20, 200); 'FOCUS_NFE_TOKEN_HOMOLOGACAO' = @(20, 100); 'FOCUS_NFE_TOKEN' = @(20, 100)
  # Alertas e relatório por e-mail (Resend) e WhatsApp (Meta), e cobrança da assinatura (Asaas).
  'RESEND_API_KEY' = @(20, 100); 'ALERTAS_REMETENTE' = @(5, 120)
  # Contas a pagar por e-mail: chave do Resend com acesso ao recebimento, segredo do webhook e o domínio de recebimento.
  'RESEND_RECEBER_KEY' = @(20, 100); 'RESEND_WEBHOOK_SECRET' = @(20, 120); 'CONTAS_EMAIL_DOMINIO' = @(5, 80)
  'WHATSAPP_TOKEN' = @(50, 800); 'WHATSAPP_PHONE_ID' = @(8, 30); 'WHATSAPP_TEMPLATE' = @(3, 80)
  'ASAAS_API_KEY' = @(30, 400); 'ASAAS_WEBHOOK_TOKEN' = @(16, 200); 'ASAAS_AMBIENTE' = @(7, 8)
}
if (-not $regras.ContainsKey($Nome)) { Write-Host "Nome inválido. Use um destes: $($regras.Keys -join ', ')"; exit 1 }

# Lê da área de transferência: copie a credencial na plataforma e rode o comando (não precisa colar nada).
# Se a área de transferência tiver outra coisa, o script pede para colar o valor (digitação escondida).
$valor = (Get-Clipboard | Out-String).Trim()
$min, $max = $regras[$Nome]
$invalido = { param($v) $v.Length -lt $min -or $v.Length -gt $max -or $v -match '\s' }
if (& $invalido $valor) {
  # A área de transferência tinha outra coisa (ex.: o próprio comando). Pede para colar aqui, sem mostrar na tela.
  Write-Host "A área de transferência não tem um $Nome válido."
  $seguro = Read-Host "Cole o valor aqui (Ctrl+V, depois Enter — não aparece na tela)" -AsSecureString
  $valor = ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))).Trim()
  if (& $invalido $valor) {
    Write-Host "O valor tem $($valor.Length) caracteres, mas $Nome costuma ter entre $min e $max, sem espaços. Confira e tente de novo."
    exit 1
  }
}

& 'C:\Users\guilherme.klemann\.tools\supabase.exe' secrets set --project-ref olxapwaxmzqclitlylzv "$Nome=$valor" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar no Supabase. Avise o Claude.'; exit 1 }
Write-Host "OK: $Nome gravado no servidor ($($valor.Length) caracteres)."

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) { $valor | gh secret set $Nome -R guilhermek-maker/ecombalance 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host 'Cópia também guardada no GitHub.' } }
$valor = $null
Set-Clipboard -Value " "
Write-Host "Área de transferência limpa."