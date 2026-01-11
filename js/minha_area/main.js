const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área: Tentando iniciar...");
        
        // 1. Aguarda conexão do Sistema (Até 5 segundos)
        let tentativas = 0;
        // Espera enquanto Sistema não existe OU Supabase não conectou
        while ((!window.Sistema || !window.Sistema.supabase) && tentativas < 50) {
            await new Promise(r => setTimeout(r, 100)); // Espera 100ms
            tentativas++;
        }

        if (!window.Sistema || !window.Sistema.supabase) {
            console.error("Erro Crítico: Sistema timeout.", { sistema: window.Sistema });
            
            // Tenta recuperar se o Sistema existir mas o Supabase não
            if (window.Sistema && !window.Sistema.supabase) {
                console.warn("Minha Área: Tentando forçar inicialização do Sistema...");
                await window.Sistema.inicializar(false);
                if (window.Sistema.supabase) {
                    console.log("Minha Área: Recuperado com sucesso!");
                    return this.prosseguirInit();
                }
            }

            document.body.innerHTML = '<div style="text-align:center; padding:50px; color:#ef4444;"><h3>Erro de Conexão</h3><p>Não foi possível conectar ao banco de dados.</p><button onclick="location.reload()" style="padding:10px 20px; cursor:pointer;">Tentar Novamente</button></div>';
            return;
        }

        this.prosseguirInit();
    },

    prosseguirInit: async function() {
        console.log("Minha Área: Sistema OK. Carregando interface...");

        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        // 1. Popula Selects Iniciais (Ano/Mês)
        this.popularSeletoresIniciais();
        
        // 2. Carrega Estado Salvo (Persistência)
        this.carregarEstadoSalvo();

        // 3. Configura Permissão Admin
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            if (container) container.classList.remove('hidden');
        } else {
            this.usuarioAlvoId = this.usuario.id;
        }

        // 4. Inicia ciclo de atualização
        setTimeout(() => this.atualizarTudo(), 100);
    },

    isAdmin: function() {
        if (!this.usuario) return false;
        const funcao = (this.usuario.funcao || '').toUpperCase();
        const perfil = (this.usuario.perfil || '').toLowerCase();
        return ['GESTORA', 'AUDITORA', 'ADMIN'].includes(funcao) || perfil === 'admin' || this.usuario.id == 1;
    },

    // --- LÓGICA DO SELETOR DINÂMICO ---

    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return false;

        const select = document.getElementById('admin-user-selector');
        if (!select) return false;

        const { inicio, fim } = this.getDatasFiltro();
        if (!inicio || !fim) return false;

        const idAnterior = this.usuarioAlvoId;
        
        // Estado de Loading Visual
        select.innerHTML = `<option value="" disabled selected>🔄 Buscando...</option>`;
        select.disabled = true;

        try {
            // 1. Busca IDs de quem produziu no período
            const { data: prodData, error: prodError } = await Sistema.supabase
                .from('producao')
                .select('usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (prodError) throw prodError;

            // Filtra IDs únicos e remove nulos
            const idsComProducao = [...new Set(prodData.map(item => item.usuario_id))].filter(id => id);

            if (idsComProducao.length === 0) {
                select.innerHTML = `<option value="" disabled selected>⚠️ Sem dados no período</option>`;
                select.disabled = false;
                this.usuarioAlvoId = null; 
                this.limparTelas();
                return false;
            }

            // 2. Busca nomes, EXCLUINDO Gestão/Auditoria
            const { data: users, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, funcao')
                .in('id', idsComProducao)
                .neq('funcao', 'GESTORA')
                .neq('funcao', 'AUDITORA')
                .neq('perfil', 'admin')
                .order('nome');

            if (userError) throw userError;

            // 3. Monta o HTML do Select
            let html = `<option value="" disabled ${!idAnterior ? 'selected' : ''}>👉 Selecionar Assistente...</option>`;
            let mantemSelecao = false;

            users.forEach(u => {
                const isSelected = (u.id == idAnterior);
                if (isSelected) mantemSelecao = true;
                html += `<option value="${u.id}" ${isSelected ? 'selected' : ''}>${u.nome}</option>`;
            });

            select.innerHTML = html;
            select.disabled = false;

            // Se a pessoa selecionada anteriormente ainda está na lista, mantém. Senão, reseta.
            if (mantemSelecao) {
                this.usuarioAlvoId = parseInt(idAnterior);
                return true;
            } else {
                this.usuarioAlvoId = null;
                this.limparTelas();
                return false;
            }

        } catch (err) {
            console.error("Erro no seletor:", err);
            select.innerHTML = `<option value="">Erro ao carregar</option>`;
            select.disabled = false;
            return false;
        }
    },

    limparTelas: function() {
        if (this.Geral && this.Geral.zerarKPIs) this.Geral.zerarKPIs();
        if (this.Assertividade && this.Assertividade.zerarKPIs) this.Assertividade.zerarKPIs();
        
        const tbodyProd = document.getElementById('tabela-extrato');
        if(tbodyProd) tbodyProd.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma assistente</p></td></tr>';
        
        const tbodyAudit = document.getElementById('tabela-audit');
        if(tbodyAudit) tbodyAudit.innerHTML = '<tr><td colspan="4" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma assistente</p></td></tr>';
    },

    mudarUsuarioAlvo: function(novoId) {
        if (!novoId) return;
        this.usuarioAlvoId = parseInt(novoId);
        
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    getUsuarioAlvo: function() { return this.usuarioAlvoId; },

    // --- DATAS E FILTROS ---

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-ano');
        if (anoSelect && anoSelect.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            let htmlAnos = '';
            for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
                htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
            }
            anoSelect.innerHTML = htmlAnos;
        }
        
        const mesSelect = document.getElementById('sel-mes');
        if (mesSelect && !mesSelect.value) {
            mesSelect.value = new Date().getMonth();
        }
    },

    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano').value,
            mes: document.getElementById('sel-mes').value,
            semana: document.getElementById('sel-semana').value,
            sub: document.getElementById('sel-subperiodo-ano').value
        };
        localStorage.setItem('ma_filtro_state', JSON.stringify(estado));
        this.atualizarTudo();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('ma_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                if(document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
                if(document.getElementById('sel-semana')) document.getElementById('sel-semana').value = s.semana;
                if(document.getElementById('sel-subperiodo-ano')) document.getElementById('sel-subperiodo-ano').value = s.sub;
                
                this.mudarPeriodo(s.tipo, false);
                return;
            } catch(e) { console.error(e); }
        }
        this.mudarPeriodo('mes', false);
    },

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                btn.className = (t === tipo) 
                    ? "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition"
                    : "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSubAno = document.getElementById('sel-subperiodo-ano');

        if(selMes) selMes.classList.remove('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');

        if (tipo === 'semana') {
            if(selSemana) selSemana.classList.remove('hidden');
        } else if (tipo === 'ano') {
            if(selMes) selMes.classList.add('hidden');
            if(selSubAno) selSubAno.classList.remove('hidden');
        }

        if(salvar) this.salvarEAtualizar();
    },

    getDatasFiltro: function() {
        const anoEl = document.getElementById('sel-ano');
        const mesEl = document.getElementById('sel-mes');
        if (!anoEl || !mesEl) return { inicio: null, fim: null };

        const ano = parseInt(anoEl.value);
        const mes = parseInt(mesEl.value);
        
        let inicio, fim;

        try {
            if (this.filtroPeriodo === 'mes') {
                inicio = new Date(ano, mes, 1);
                fim = new Date(ano, mes + 1, 0);
            } else if (this.filtroPeriodo === 'semana') {
                const semanaIndex = parseInt(document.getElementById('sel-semana').value);
                const diaInicio = (semanaIndex - 1) * 7 + 1;
                let diaFim = diaInicio + 6;
                const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
                if (diaFim > ultimoDiaMes) diaFim = ultimoDiaMes;
                
                if (diaInicio > ultimoDiaMes) {
                    inicio = new Date(ano, mes, ultimoDiaMes);
                    fim = new Date(ano, mes, ultimoDiaMes);
                } else {
                    inicio = new Date(ano, mes, diaInicio);
                    fim = new Date(ano, mes, diaFim);
                }
            } else if (this.filtroPeriodo === 'ano') {
                const sub = document.getElementById('sel-subperiodo-ano').value;
                if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
                else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
                else if (sub === 'S2') { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
                else if (sub.startsWith('T')) {
                    const tri = parseInt(sub.replace('T', ''));
                    const mesInicio = (tri - 1) * 3;
                    const mesFim = mesInicio + 3;
                    inicio = new Date(ano, mesInicio, 1);
                    fim = new Date(ano, mesFim, 0);
                }
            }

            const fmt = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            return { inicio: fmt(inicio), fim: fmt(fim) };
        } catch (e) {
            console.error(e);
            return { inicio: null, fim: null };
        }
    },

    atualizarTudo: async function() {
        if (this.isAdmin()) {
            await this.atualizarListaAssistentes();
        }
        
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
        if (this.isAdmin() && !this.usuarioAlvoId) return;

        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        
        // Nova aba de Assertividade
        if (abaId === 'assertividade' && this.Assertividade) this.Assertividade.carregar();
        
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Timeout para garantir que bibliotecas carregaram
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});