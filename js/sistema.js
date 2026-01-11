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

    // A função gerarHash foi removida daqui por segurança.
    // A verificação agora ocorre dentro do banco de dados (RPC).

    sair: function() {
        if(confirm("Deseja realmente sair?")) {
            localStorage.removeItem('usuario_logado');
            window.location.href = 'index.html';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a conexão (false = não redireciona se estiver na tela de login)
    Sistema.inicializar(false);
});