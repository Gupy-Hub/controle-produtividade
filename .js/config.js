// js/config.js
// --- CREDENCIAIS DO SUPABASE (NOVO PROJETO) ---

const SB_URL = "https://btzdlrjqdzisvyskskeb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emRscmpxZHppc3Z5c2tza2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzIzNDEsImV4cCI6MjA4MjcwODM0MX0.k49GeqGXUP2c3wR9Jo0vJgTdYl1DZumi7s17sGArIQE";

// Cria o cliente globalmente
const _supabase = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;

if (!_supabase) {
    console.error("ERRO CRÍTICO: Supabase não carregou. Verifique se o script do CDN foi incluído antes do config.js");
} else {
    // console.log("Supabase conectado:", SB_URL); // Descomente para debug
}