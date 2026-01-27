// ARQUIVO: js/sistema.js - ATUALIZAÇÃO
const Sistema = {
    supabaseUrl: CONFIG.SUPABASE_URL,
    supabaseKey: CONFIG.SUPABASE_ANON_KEY,
    supabase: null,

    init: function() {
        if (!this.supabaseUrl || !this.supabaseKey) {
            console.error("Configurações do Supabase não encontradas!");
            return;
        }
        this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log("Sistema: Conectado ao Supabase.");
        
        this.verificarSessaoGlobal();
    },

    gerarHash: async function(texto) {
        const msgBuffer = new TextEncoder().encode(texto);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    salvarSessao: function(dadosUsuario) {
        localStorage.setItem('usuario_logado', JSON.stringify(dadosUsuario));
        localStorage.setItem('sessao_timestamp', new Date().getTime());
        // Chama o registro de checking ao logar
        this.registrarAcesso(dadosUsuario.id);
    },

    lerSessao: function() {
        const dados = localStorage.getItem('usuario_logado');
        if (!dados) return null;
        return JSON.parse(dados);
    },

    limparSessao: function() {
        localStorage.removeItem('usuario_logado');
        localStorage.removeItem('sessao_timestamp');
        window.location.href = 'index.html';
    },

    verificarSessaoGlobal: function() {
        const paginasPublicas = ['index.html', 'login.html', 'ferramentas.html'];
        const path = window.location.pathname;
        const paginaAtual = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

        if (paginasPublicas.includes(paginaAtual)) return;

        const usuario = this.lerSessao();
        if (!usuario) {
            window.location.href = 'index.html';
        } else {
            const elNome = document.getElementById('usuario-nome-top');
            if (elNome) elNome.innerText = usuario.nome.split(' ')[0];
            // Registra atividade em páginas internas
            this.registrarAcesso(usuario.id);
        }
    },

    /**
     * FUNÇÃO DE CHECKING: Registra a presença diária do usuário
     * Baseado na tabela 'acessos_diarios' do banco de dados.
     */
    registrarAcesso: async function(usuarioId) {
        if (!usuarioId) return;
        
        const hoje = new Date().toISOString().split('T')[0];
        const storageKey = `checkin_${usuarioId}_${hoje}`;

        // Evita chamadas desnecessárias se já registrou nesta sessão/dia local
        if (localStorage.getItem(storageKey)) return;

        try {
            const { error } = await this.supabase
                .from('acessos_diarios')
                .upsert({ 
                    usuario_id: usuarioId, 
                    data_referencia: hoje 
                }, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;
            
            localStorage.setItem(storageKey, 'true');
            console.log(`Checking realizado para usuário ${usuarioId} em ${hoje}`);
        } catch (err) {
            console.error("Erro ao registrar checking:", err.message);
        }
    },

    escapar: function(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

Sistema.init();