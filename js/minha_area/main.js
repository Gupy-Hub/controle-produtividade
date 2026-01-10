const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null, // ID do usuário cujos dados estamos vendo
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Verificação de Segurança
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        // Define o alvo inicial como o próprio usuário
        this.usuarioAlvoId = this.usuario.id;

        // 2. Verifica se tem permissão para ver outros
        this.setupAdminAccess();

        // 3. Data Global
        this.configurarDataGlobal();

        // 4. Inicia na aba padrão
        this.mudarAba('diario');
    },

    setupAdminAccess: async function() {
        // Regra: Gestora, Auditora, Admin ou ID 1
        const podeVerTodos = ['GESTORA', 'AUDITORA', 'ADMIN'].includes(this.usuario.funcao) || this.usuario.perfil === 'admin' || this.usuario.id == 1;

        if (podeVerTodos) {
            const container = document.getElementById('admin-selector-container');
            const select = document.getElementById('admin-user-selector');
            
            if (container && select) {
                container.classList.remove('hidden');
                
                try {
                    // Busca lista de usuários para o dropdown
                    const { data: users, error } = await Sistema.supabase
                        .from('usuarios')
                        .select('id, nome')
                        .eq('ativo', true)
                        .order('nome');

                    if (!error && users) {
                        // Adiciona opção "Eu Mesmo" no topo
                        let options = `<option value="${this.usuario.id}">👤 Meus Dados</option>`;
                        options += `<optgroup label="Colaboradores">`;
                        users.forEach(u => {
                            if (u.id !== this.usuario.id) {
                                options += `<option value="${u.id}">${u.nome}</option>`;
                            }
                        });
                        options += `</optgroup>`;
                        select.innerHTML = options;
                        select.value = this.usuario.id;
                    }
                } catch (e) {
                    console.error("Erro ao carregar lista de usuários admin", e);
                }
            }
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        this.usuarioAlvoId = parseInt(novoId);
        this.atualizarTudo();
    },

    getUsuarioAlvo: function() {
        // Retorna o ID que deve ser usado nas queries
        return this.usuarioAlvoId || this.usuario.id;
    },

    configurarDataGlobal: function() {
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    atualizarTudo: function() {
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
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });
        this.atualizarTudo();
    },

    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        let dataRef = (dateInput && dateInput.value) ? new Date(dateInput.value) : new Date();
        const ano = dataRef.getFullYear();
        const mes = dataRef.getMonth();

        let inicio, fim;
        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
            fim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        } else if (this.filtroPeriodo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        } else if (this.filtroPeriodo === 'semana') {
            const curr = new Date(dataRef);
            const diaSemana = curr.getDay(); 
            const first = curr.getDate() - diaSemana;
            const dataInicio = new Date(curr.setDate(first));
            const dataFim = new Date(curr.setDate(first + 6));
            inicio = dataInicio.toISOString().split('T')[0];
            fim = dataFim.toISOString().split('T')[0];
        }
        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});