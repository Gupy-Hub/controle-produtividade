// js/config.js
// Aqui colocamos as chaves do Supabase uma única vez

// Importando a biblioteca do Supabase via CDN (global)
const SB_URL = "https://glqrpsyjwozvislyxapj.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscXJwc3lqd296dmlzbHl4YXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNTQyOTgsImV4cCI6MjA4MTgzMDI5OH0.etzcmIHgPcGC12HwZPTU2u0DLtJdF3XTBSYW38O7S-w";

// Verifica se a biblioteca foi carregada antes de criar o cliente
const _supabase = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;

if (!_supabase) {
    console.error("Supabase não foi carregado corretamente.");
}