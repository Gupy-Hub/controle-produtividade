/* ARQUIVO: js/sistema.js
   DESCRIÇÃO: Núcleo do Sistema (Configurações Globais e Supabase)
   ATUALIZAÇÃO: Removido redirecionamento forçado de Admin
*/

const Sistema = {
    supabase: null,
    usuario: null,

    init: function() {
        console.log("⚙️ Sistema: Inicializando...");
        
        // 1. Inicializa Supabase
        if (typeof supabase !== 'undefined') {
            this.supabase = supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_KEY);
        } else {
            console.error("❌ Supabase SDK não encontrado!");
            return;
        }

        // 2. Verifica Sessão Globalmente
        this.verificarSessao();
    },

    verificarSessao: async function() {
        // Verifica se estamos na tela de login para não criar loop
        const isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname === '/';

        const { data: { session } } = await this.supabase.auth.getSession();

        if (session) {
            // Usuário Logado
            this.usuario = session.user;
            
            // Busca dados complementares (Admin/Gestor) mas NÃO REDIRECIONA AUTOMATICAMENTE
            const { data: perfil } = await this.supabase
                .from('usuarios')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (perfil) {
                this.usuario = { ...session.user, ...perfil }; // Mescla dados
            }

            // Se estiver na tela de login e já estiver logado, aí sim redireciona
            if (isLoginPage) {
                console.log("🔄 Usuário já logado na tela de login. Redirecionando...");
                // Aqui decidimos para onde ir APENAS se estiver no login
                if (this.usuario.admin || this.usuario.gestor) {
                    window.location.href = 'gestao.html';
                } else {
                    window.location.href = 'minha_area.html';
                }
            }
        } else {
            // Usuário Não Logado
            if (!isLoginPage) {
                console.warn("⛔ Acesso restrito. Redirecionando para login.");
                window.location.href = 'index.html';
            }
        }
    },

    // Funções Utilitárias Globais
    logout: async function() {
        await this.supabase.auth.signOut();
        window.location.href = 'index.html';
    },

    toast: function(msg, tipo = 'info') {
        // Exemplo simples de toast
        const div = document.createElement('div');
        div.className = `fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg text-white font-bold z-50 animate-bounce ${tipo === 'erro' ? 'bg-red-500' : 'bg-blue-500'}`;
        div.innerText = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }
};

// Auto-inicia ao carregar
document.addEventListener('DOMContentLoaded', () => {
    Sistema.init();
});