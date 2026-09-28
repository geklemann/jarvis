// URL e chave pública (anon) do Supabase. Vazio = modo local (dados só neste navegador).
// A chave anon é pública por natureza; a proteção dos dados vem do login e do RLS. Veja docs/CONFIGURAR.md, passo 5.
window.CONCILIA_CONFIG = {
  supabaseUrl: 'https://olxapwaxmzqclitlylzv.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seGFwd2F4bXpxY2xpdGx5bHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMjgyMDcsImV4cCI6MjEwNTgwNDIwN30.0M3pUvy6MdzniLyxFgMsUM44h-_K2aOTNygI-pkUTq8',
  // Chave pública dos alertas no celular (Web Push). A privada fica só no servidor.
  vapidPublicKey: 'BF6esrL-K7pfGkNuGqQiYUkJaC39e8tkIQOfUwzNpGAhLtE9viMi_BwWSEOhTAXRnPyRnziHXSvtFcM_W9_55G8'
};
