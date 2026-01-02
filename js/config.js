// js/config.js
console.log("Iniciando configuração do Supabase...");

// --- CREDENCIAIS DO SUPABASE ---
const SB_URL = "https://btzdlrjqdzisvyskskeb.supabase.co"; // URL correta baseada nos seus arquivos
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emRscmpxZHppc3Z5c2tza2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzIzNDEsImV4cCI6MjA4MjcwODM0MX0.k49GeqGXUP2c3wR9Jo0vJgTdYl1DZumi7s17sGArIQE";

// Verifica se a biblioteca do Supabase foi carregada no HTML
if (typeof supabase === 'undefined') {
    console.error("ERRO CRÍTICO: A biblioteca do Supabase (CDN) não foi carregada antes do config.js!");
    alert("Erro de sistema: Biblioteca não carregada.");
} else {
    // Cria o cliente globalmente na janela do navegador
    window._supabase = supabase.createClient(SB_URL, SB_KEY);
    console.log("Supabase conectado com sucesso!");
}