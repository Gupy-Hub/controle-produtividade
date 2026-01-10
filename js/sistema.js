const Sistema = {
    supabase: null,
    usuarioLogado: null,

    inicializar: async function(requerLogin = true) {
        // CORREÇÃO: Só cria o cliente se ele ainda não existir (Singleton)
        if (!Sistema.supabase && window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Sistema.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        }

        const sessao = localStorage.getItem('usuario_logado');
        if (sessao) {
            Sistema.usuarioLogado = JSON.parse(sessao);
        } else if (requerLogin && !window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    },

    // --- FUNÇÃO DE CRIPTOGRAFIA (SHA-256) ---
    gerarHash: async function(texto) {
        const msgBuffer = new TextEncoder().encode(texto);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    sair: function() {
        if(confirm("Deseja realmente sair?")) {
            localStorage.removeItem('usuario_logado');
            window.location.href = 'index.html';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Tenta inicializar sem forçar login imediato ao carregar scripts
    Sistema.inicializar(false);
});