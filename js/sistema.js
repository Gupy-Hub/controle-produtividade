const Sistema = {
    supabase: null,
    usuarioLogado: null,

    inicializar: async function(requerLogin = true) {
        if (!Sistema.supabase) {
            if (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_KEY) {
                Sistema.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
                console.log("Sistema: Conectado ao Supabase.");
            } else {
                console.error("Sistema: Biblioteca Supabase ou chaves não encontradas.");
                alert("Erro crítico: Sistema não conectado ao banco de dados.");
                return;
            }
        }

        const sessao = localStorage.getItem('usuario_logado');
        if (sessao) {
            Sistema.usuarioLogado = JSON.parse(sessao);
        } else if (requerLogin && !window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    },

    // --- FUNÇÃO DE SEGURANÇA (NOVA) ---
    // Transforma caracteres perigosos em texto inofensivo
    escapar: function(texto) {
        if (texto === null || texto === undefined) return '';
        return texto.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    sair: function() {
        if(confirm("Deseja realmente sair?")) {
            localStorage.removeItem('usuario_logado');
            window.location.href = 'index.html';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Sistema.inicializar(false);
});