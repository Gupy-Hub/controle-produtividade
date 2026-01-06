const Sistema = {
    supabase: null,
    usuarioLogado: null,

    // Inicializa conexão e verifica sessão
    inicializar: async function(requerLogin = true) {
        // 1. Conexão Supabase Global
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Sistema.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = Sistema.supabase; // Disponibiliza para outros scripts legados
        } else {
            console.error("Configuração do Supabase ausente (js/config.js).");
        }

        // 2. Verifica Usuário Logado
        const sessao = localStorage.getItem('usuario_logado');
        if (sessao) {
            Sistema.usuarioLogado = JSON.parse(sessao);
        } else if (requerLogin && !window.location.pathname.includes('index.html')) {
            // Se não estiver logado e não for a tela de login, redireciona
            window.location.href = 'index.html';
        }
    },

    // --- Utilitários Globais ---

    // Formata Data (YYYY-MM-DD -> DD/MM/YYYY)
    formatarData: function(dataString) {
        if (!dataString) return '-';
        return dataString.split('-').reverse().join('/');
    },

    // Formata Moeda/Número
    formatarNumero: function(valor) {
        return parseFloat(valor).toLocaleString('pt-BR');
    },

    // Logout Global
    sair: function() {
        if(confirm("Deseja realmente sair?")) {
            localStorage.removeItem('usuario_logado');
            window.location.href = 'index.html';
        }
    },

    // Verifica permissão (Ex: Apenas Gestora/Auditora acessam Gestão)
    verificarPermissao: function(cargosPermitidos) {
        if (!Sistema.usuarioLogado) return false;
        return cargosPermitidos.includes(Sistema.usuarioLogado.funcao);
    }
};

// Auto-inicialização básica ao carregar o script
document.addEventListener('DOMContentLoaded', () => {
    // Não força login imediato aqui para não travar scripts específicos que carregam depois
    // Mas prepara a instância
    if(!Sistema.supabase) Sistema.inicializar(false);
});