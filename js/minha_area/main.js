/* ARQUIVO: js/minha_area/main.js */
const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes',

    init: async function() {
        if (!Sistema.supabase) await Sistema.inicializar(false);
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        // Verifica se é admin para mostrar controles extras
        await this.setupAdminAccess();

        // Se NÃO for admin, trava a visão no próprio ID
        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        this.atualizarTudo();
        this.mudarAba('diario');
    },

    isAdmin: function() {
        // Normalização para garantir match correto
        const perfil = (this.usuario.perfil || '').toLowerCase();
        const funcao = (this.usuario.funcao || '').toLowerCase();
        const id = parseInt(this.usuario.id);

        return perfil === 'admin' || 
               perfil === 'administrador' || 
               funcao.includes('gestora') || 
               funcao.includes('gestor') ||
               funcao.includes('auditor') ||
               id === 1 || 
               id === 1000; // <--- ID 1000 ADICIONADO
    },

    setupAdminAccess: async function() {
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            if (container) container.classList.remove('hidden');
        }
    },

    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return;

        const select = document.getElementById('admin-user-selector');
        if (!select) return;

        const { inicio, fim } = this.getDatasFiltro();

        try {
            const { data: prodData, error: prodError } = await Sistema.supabase
                .from('producao')
                .select('usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (prodError) throw prodError;

            const idsComDados = [...new Set(prodData.map(p => p.usuario_id))];

            // Busca nomes dos usuários
            let users = [];
            if(idsComDados.length > 0) {
                const { data, error } = await Sistema.supabase
                    .from('usuarios')
                    .select('id, nome')
                    .in('id', idsComDados)
                    .order('nome');
                if(!error) users = data;
            }

            let options = `<option value="" ${!this.usuarioAlvoId ? 'selected' : ''}>👥 Visão Geral da Equipe</option>`;
            
            users.forEach(u => {
                if (u.id != this.usuario.id) { // Usa != para não travar tipos string/int
                    const isSelected = (u.id == this.usuarioAlvoId);
                    options += `<option value="${u.id}" ${isSelected ? 'selected' : ''}>${u.nome}</option>`;
                }
            });

            select.innerHTML = options;

        } catch (e) {
            console.error("Erro lista assistentes:", e);
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        this.usuarioAlvoId = novoId ? parseInt(novoId) : null;
        this.atualizarTudo();
    },

    getUsuarioAlvo: function() { return this.usuarioAlvoId; },

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-ano');
        if(anoSelect) {
            const anoAtual = new Date().getFullYear();
            let htmlAnos = '';
            for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
                htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
            }
            anoSelect.innerHTML = htmlAnos;
        }
        
        const mesSelect = document.getElementById('sel-mes');
        if(mesSelect) mesSelect.value = new Date().getMonth();
    },

    salvarEAtualizar: function() {
        // Lógica simplificada de salvar estado
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano')?.value,
            mes: document.getElementById('sel-mes')?.value
        };
        localStorage.setItem('ma_filtro_state', JSON.stringify(estado));
        this.atualizarTudo();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('ma_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                if(s.ano && document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(s.mes && document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
            } catch(e) {}
        }
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        // Atualiza botões visuais (simplificado)
        ['mes', 'semana', 'ano'].forEach(t => {
             const btn = document.getElementById(`btn-periodo-${t}`);
             if(btn) btn.className = t === tipo ? "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600" : "px-3 py-1 text-xs font-bold rounded text-slate-500";
        });
        
        // Exibe/Oculta selects baseados no tipo (lógica visual omitida para brevidade, mas deve existir)
        this.salvarEAtualizar();
    },

    getDatasFiltro: function() {
        const ano = parseInt(document.getElementById('sel-ano').value || 2024);
        const mes = parseInt(document.getElementById('sel-mes').value || 0);
        // Simplificado para Mês (expanda se usar semana/ano)
        const inicio = new Date(ano, mes, 1);
        const fim = new Date(ano, mes + 1, 0);
        
        const fmt = (d) => d.toISOString().split('T')[0];
        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    atualizarTudo: function() {
        this.atualizarListaAssistentes();
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');
        
        this.carregarDadosAba(abaId);
    },

    carregarDadosAba: function(abaId) {
        // Carregamento dinâmico
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});