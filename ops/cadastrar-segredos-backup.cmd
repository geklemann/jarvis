@echo off
chcp 65001 >nul
rem Cadastra os 4 segredos do backup no GitHub (repositorio geklemann/jarvis). Nada aparece na tela.
echo.
echo   Backup do Jarvis: cadastrar os segredos no GitHub
echo   Cole cada valor quando pedir e aperte Enter (o que voce cola nao aparece).
echo.
echo   1/4  Token do Supabase para o backup (supabase.com/dashboard/account/tokens)
gh secret set SUPABASE_BACKUP_TOKEN --repo geklemann/jarvis
echo.
echo   2/4  Access Key ID do token do R2
gh secret set R2_ACCESS_KEY_ID --repo geklemann/jarvis
echo.
echo   3/4  Secret Access Key do token do R2
gh secret set R2_SECRET_ACCESS_KEY --repo geklemann/jarvis
echo.
echo   4/4  Frase do backup (a mesma que voce guardou no gerenciador de senhas)
gh secret set BACKUP_PASSPHRASE --repo geklemann/jarvis
echo.
echo   Pronto. Para testar agora: GitHub, Actions, "Backup (Supabase -> Cloudflare R2)", Run workflow.
echo.
pause
