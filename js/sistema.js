// Define o namespace globalmente IMEDIATAMENTE
window.Sistema = window.Sistema || {
    supabase: null,
    usuarioLogado: null,

    inicializar: async function(requerLogin = true) {
        console.log("Sistema: Inicializando...");

        // 1. Conecta ao Supabase
        if (!this.supabase) {
            try {
                if (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_KEY) {
                    this.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
                    console.log("Sistema: Conectado ao Supabase.");
                } else {
                    console.error("Sistema: Biblioteca Supabase ou chaves (config.js) não encontradas.");
                }
            } catch (e) {
                console.error("Sistema: Erro fatal na conexão:", e);
            }
        }

        // 2. Verifica Sessão
        const sessao = localStorage.getItem('usuario_logado');
        if (sessao) {
            this.usuarioLogado = JSON.parse(sessao);
        } else if (requerLogin && !window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    },

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

// Auto-inicialização segura
document.addEventListener('DOMContentLoaded', () => {
    Sistema.inicializar(false);
});