// ARQUIVO: js/sistema.js
// ATUALIZAÇÃO: Lógica de Checking (D-1 para Assistentes)

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

    // --- CRIPTOGRAFIA ---
    gerarHash: async function(texto) {
        const msgBuffer = new TextEncoder().encode(texto);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    // --- SESSÃO ---
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
        // Limpa chaves de controle de abas
        localStorage.removeItem('gestao_aba_ativa');
        localStorage.removeItem('ma_filtro_state');
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

    // --- CHECKING INTELIGENTE (REGRA DE NEGÓCIO) ---
    registrarAcesso: async function(usuarioId) {
        if (!usuarioId) return;
        
        // 1. Obtém a Data Local do Cliente (Brasil)
        // Isso evita erros de fuso horário (UTC vs Local)
        const getLocalISODate = (dateObj = new Date()) => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const hoje = getLocalISODate();
        const storageKey = `checkin_done_${usuarioId}_${hoje}`;

        // Evita chamadas repetidas na mesma sessão/dia (Cache Local)
        if (localStorage.getItem(storageKey)) return;

        // Recupera dados para saber o perfil
        const usuario = this.lerSessao();
        if(!usuario) return;

        // --- LÓGICA DO DIA ANTERIOR (D-1) ---
        let dataReferencia = hoje;

        // Normalização
        const perfil = (usuario.perfil || '').toUpperCase();
        const funcao = (usuario.funcao || '').toUpperCase();
        const id = parseInt(usuario.id);

        // Quem NÃO entra na regra do "dia anterior"? (Gestores, Admins, Auditores)
        const isGestao = 
            perfil === 'ADMIN' || 
            perfil === 'ADMINISTRADOR' ||
            funcao.includes('GESTOR') || 
            funcao.includes('LIDER') ||
            funcao.includes('AUDITOR') || 
            id === 1 || 
            id === 1000;

        // Se NÃO for gestão (ou seja, é Assistente), aplica D-1
        if (!isGestao) {
            const ontemObj = new Date();
            ontemObj.setDate(ontemObj.getDate() - 1); // Subtrai 1 dia
            dataReferencia = getLocalISODate(ontemObj);
            
            console.log(`📅 Checking de Assistente: Registrando presença para ONTEM (${dataReferencia})`);
        } else {
            console.log(`📅 Checking de Gestão: Registrando presença para HOJE (${dataReferencia})`);
        }

        try {
            // Upsert: Se já existir registro para (usuario + data), não duplica
            const { error } = await this.supabase
                .from('acessos_diarios')
                .upsert({ 
                    usuario_id: usuarioId, 
                    data_referencia: dataReferencia 
                }, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;
            
            // Marca no navegador que o processo rodou HOJE
            localStorage.setItem(storageKey, 'true');
            console.log(`✅ Checking realizado com sucesso.`);
            
        } catch (err) {
            // Ignora erros silenciosamente para não travar o uso (ex: rede instável)
            console.warn("Aviso Checking:", err.message);
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