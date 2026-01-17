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
            // Verifica permissão assim que carrega o usuário
            Sistema.verificarAcessoPagina(); 
        } else if (requerLogin && !window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    },

    // --- NOVO: CONTROLE DE ACESSO (ACL) ---
    verificarAcessoPagina: function() {
        const user = Sistema.usuarioLogado;
        if (!user) return;

        const path = window.location.pathname;
        
        // Definição de Perfis com Acesso Total
        const isAdmin = ['GESTORA', 'AUDITORA', 'ADMIN'].includes((user.funcao || '').toUpperCase()) || user.perfil === 'admin' || user.id == 1;

        // Páginas Restritas (Apenas Gestão/Auditoria)
        // Se a página atual for uma dessas e o usuário NÃO for admin -> Bloqueia
        const paginasRestritas = ['gestao.html', 'produtividade.html'];
        
        const tentandoAcessarRestrita = paginasRestritas.some(p => path.includes(p));

        if (tentandoAcessarRestrita && !isAdmin) {
            console.warn("Acesso negado. Redirecionando...");
            window.location.href = 'minha_area.html'; // Redireciona para área segura
        }
    },

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
    // Passa true para exigir login em todas as páginas exceto index
    Sistema.inicializar(true); 
});