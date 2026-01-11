const Sistema = {
    supabase: null,
    usuarioLogado: null,

    inicializar: async function(requerLogin = true) {
        // CORREÇÃO: Padrão Singleton. Se já existe, não recria.
        if (!Sistema.supabase) {
            if (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_KEY) {
                Sistema.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
                console.log("Sistema: Conectado ao Supabase.");
            } else {
                console.error("Sistema: Biblioteca Supabase ou chaves não encontradas.");
            }
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
    // Inicializa a conexão assim que a página carrega
    Sistema.inicializar(false);
});