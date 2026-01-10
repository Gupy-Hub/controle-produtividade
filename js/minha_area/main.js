const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        // Configura permissões
        await this.setupAdminAccess();

        // Se não for admin, o alvo é ele mesmo. Se for admin, espera seleção (null).
        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        this.configurarDataGlobal();
        this.mudarAba('diario');
    },

    isAdmin: function() {
        return ['GESTORA', 'AUDITORA', 'ADMIN'].includes(this.usuario.funcao) || this.usuario.perfil === 'admin' || this.usuario.id == 1;
    },

    setupAdminAccess: async function() {
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            const select = document.getElementById('admin-user-selector');
            
            if (container && select) {
                container.classList.remove('hidden');
                
                try {
                    const { data: users, error } = await Sistema.supabase
                        .from('usuarios')
                        .select('id, nome')
                        .eq('ativo', true)
                        .order('nome');

                    if (!error && users) {
                        // Placeholder neutro em vez de "Meus Dados"
                        let options = `<option value="" disabled selected>👉 Selecionar Colaboradora...</option>`;
                        
                        users.forEach(u => {
                            // Não mostra o próprio admin na lista de seleção de produção
                            if (u.id !== this.usuario.id) {
                                options += `<option value="${u.id}">${u.nome}</option>`;
                            }
                        });
                        select.innerHTML = options;
                    }
                } catch (e) {
                    console.error("Erro ao carregar lista", e);
                }
            }
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        if (!novoId) return;
        this.usuarioAlvoId = parseInt(novoId);
        this.atualizarTudo();
    },

    getUsuarioAlvo: function() {
        return this.usuarioAlvoId;
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
        // Se for admin e não tiver selecionado ninguém, para aqui.
        if (this.isAdmin() && !this.usuarioAlvoId) {
            // Pode limpar a tela ou mostrar aviso
            return; 
        }

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