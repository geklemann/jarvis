# Grava o certificado e-CNPJ A1 (arquivo .pfx) e a senha nos segredos do servidor, para a GNRE pelo webservice.
# Uso: powershell -ExecutionPolicy Bypass -File "...\ops\gravar-certificado-gnre.ps1"
# Uma janela pede o arquivo .pfx; a senha é digitada escondida. Nada aparece na tela, no código ou no banco.
# Para trocar de ambiente depois de testar: acrescente -Producao (grava GNRE_AMBIENTE=producao).
param([switch]$Producao)
$sb = 'C:\Users\guilherme.klemann\.tools\supabase.exe'
$ref = 'olxapwaxmzqclitlylzv'

if ($Producao) {
  & $sb secrets set --project-ref $ref "GNRE_AMBIENTE=producao" | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar no Supabase.'; exit 1 }
  Write-Host 'OK: GNRE em PRODUÇÃO. As próximas guias enviadas têm valor de pagamento.'
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = 'Escolha o certificado A1 da empresa (.pfx)'
$dlg.Filter = 'Certificado A1 (*.pfx;*.p12)|*.pfx;*.p12'
if ($dlg.ShowDialog() -ne 'OK') { Write-Host 'Cancelado.'; exit 1 }
$bytes = [IO.File]::ReadAllBytes($dlg.FileName)
if ($bytes.Length -lt 1000 -or $bytes.Length -gt 20000) { Write-Host "O arquivo tem $($bytes.Length) bytes; um .pfx costuma ter entre 2 e 10 KB. Confira."; exit 1 }

$seguro = Read-Host 'Senha do certificado (não aparece na tela)' -AsSecureString
$senha = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
# Confere a senha abrindo o certificado aqui mesmo, antes de gravar.
try {
  $c = New-Object Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @($bytes, $senha)
  Write-Host "Certificado: $($c.Subject) · válido até $($c.NotAfter.ToString('dd/MM/yyyy'))"
  if ($c.NotAfter -lt (Get-Date)) { Write-Host 'Este certificado está VENCIDO.'; exit 1 }
} catch { Write-Host 'Senha incorreta ou arquivo inválido.'; exit 1 }

$b64 = [Convert]::ToBase64String($bytes)
& $sb secrets set --project-ref $ref "GNRE_CERT_PFX=$b64" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar o certificado no Supabase.'; exit 1 }
& $sb secrets set --project-ref $ref "GNRE_CERT_SENHA=$senha" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar a senha no Supabase.'; exit 1 }
$senha = $null; $b64 = $null; $bytes = $null
Write-Host 'OK: certificado e senha gravados no servidor (ambiente de homologação da GNRE).'
Write-Host 'Teste em Fiscal > DIFAL e GNRE > Configuração. Depois de validar: rode de novo com -Producao.'
