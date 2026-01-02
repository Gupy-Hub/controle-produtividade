// js/config.js
console.log("⚙️ A iniciar configurações...");

// --- CREDENCIAIS DO SUPABASE ---
// Nota de Segurança: Estas chaves são visíveis no navegador (Cliente).
// A segurança REAL deve ser feita nas "Policies (RLS)" dentro do painel do Supabase.
const SB_URL = "https://btzdlrjqdzisvyskskeb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emRscmpxZHppc3Z5c2tza2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzIzNDEsImV4cCI6MjA4MjcwODM0MX0.k49GeqGXUP2c3wR9Jo0vJgTdYl1DZumi7s17sGArIQE";

// Verifica se a biblioteca do Supabase foi carregada pelo HTML
if (typeof supabase === 'undefined') {
    const erroMsg = "ERRO CRÍTICO: A biblioteca do Supabase não foi carregada. Verifique os scripts no HTML.";
    console.error(erroMsg);
    alert(erroMsg);
} else {
    // Cria o cliente Supabase e coloca-o no escopo global (window)
    window._supabase = supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Supabase conectado com sucesso!");
}