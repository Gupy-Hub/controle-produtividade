// js/config.js
console.log("⚙️ A iniciar configurações...");

const SB_URL = "https://btzdlrjqdzisvyskskeb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emRscmpxZHppc3Z5c2tza2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzIzNDEsImV4cCI6MjA4MjcwODM0MX0.k49GeqGXUP2c3wR9Jo0vJgTdYl1DZumi7s17sGArIQE";

if (typeof supabase === 'undefined') {
    alert("ERRO CRÍTICO: Supabase não carregou no HTML.");
} else {
    window._supabase = supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Supabase conectado.");
}