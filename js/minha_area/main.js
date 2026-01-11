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
        
        // 1. Configura a UI de Admin (mostra o container, mas o select virá vazio inicialmente)
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            if (container) container.classList.remove('hidden');
        } else {
            this.usuarioAlvoId = this.usuario.id;
        }

        // 2. Popula Selects de Data
        this.popularSeletoresIniciais();

        // 3. Carrega Estado Salvo
        this.carregarEstadoSalvo();

        // 4. Inicia (Isso vai disparar a atualização da lista e depois dos dados)
        this.mudarAba('diario');
    },

    isAdmin: function() {
        return ['GESTORA', 'AUDITORA', 'ADMIN'].includes(this.usuario.funcao) || this.usuario.perfil === 'admin' || this.usuario.id == 1;
    },

    // --- LÓGICA DO SELETOR DINÂMICO ---

    atualizarListaAssistentes: async function() {
        // Se não for admin, não faz nada
        if (!this.isAdmin()) return;

        const select = document.getElementById('admin-user-selector');
        if (!select) return;

        const { inicio, fim } = this.getDatasFiltro();

        // Feedback visual de carregamento no select
        const idAnterior = this.usuarioAlvoId;
        select.innerHTML = `<option>🔄 Buscando...</option>`;
        select.disabled = true;

        try {
            // 1. Descobre quem produziu no período (IDs únicos)
            const { data: prodData, error: prodError } = await Sistema.supabase
                .from('producao')
                .select('usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (prodError) throw prodError;

            // Extrai IDs únicos
            const idsComProducao = [...new Set(prodData.map(item => item.usuario_id))];

            if (idsComProducao.length === 0) {
                select.innerHTML = `<option value="">(Sem dados no período)</option>`;
                select.disabled = false;
                this.usuarioAlvoId = null; // Ninguém para mostrar
                return false; // Retorna false para indicar que não há dados para carregar nas abas
            }

            // 2. Busca detalhes desses usuários, EXCLUINDO Gestoras/Auditoras
            const { data: users, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, funcao')
                .in('id', idsComProducao)
                .neq('funcao', 'GESTORA')  // Filtra Gestora
                .neq('funcao', 'AUDITORA') // Filtra Auditora
                .neq('perfil', 'admin')    // Filtra Admin
                .order('nome');

            if (userError) throw userError;

            // 3. Monta o Select
            let html = `<option value="" disabled ${!idAnterior ? 'selected' : ''}>👉 Selecionar Assistente...</option>`;
            let mantemSelecao = false;

            users.forEach(u => {
                // Verifica se o usuário anteriormente selecionado ainda está na lista
                const isSelected = u.id == idAnterior;
                if (isSelected) mantemSelecao = true;
                
                html += `<option value="${u.id}" ${isSelected ? 'selected' : ''}>${u.nome}</option>`;
            });

            select.innerHTML = html;
            select.disabled = false;

            // Se o usuário que eu estava vendo não tem dados neste novo período, reseta o alvo
            if (!mantemSelecao) {
                this.usuarioAlvoId = null;
            } else {
                this.usuarioAlvoId = idAnterior; // Garante o tipo numérico
            }

            return true; // Lista carregada com sucesso

        } catch (err) {
            console.error("Erro ao atualizar lista de assistentes:", err);
            select.innerHTML = `<option>Erro ao carregar</option>`;
            return false;
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        if (!novoId) return;
        this.usuarioAlvoId = parseInt(novoId);
        
        // Atualiza apenas os dados da aba, sem recarregar a lista de usuários (pois a data não mudou)
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    getUsuarioAlvo: function() {
        return this.usuarioAlvoId;
    },

    // --- CONTROLES DE DATA ---

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-ano');
        const anoAtual = new Date().getFullYear();
        let htmlAnos = '';
        for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
            htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
        }
        if(anoSelect) anoSelect.innerHTML = htmlAnos;
        
        const mesSelect = document.getElementById('sel-mes');
        const mesAtual = new Date().getMonth();
        if(mesSelect) mesSelect.value = mesAtual;
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
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
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
        const ano = parseInt(document.getElementById('sel-ano').value);
        const mes = parseInt(document.getElementById('sel-mes').value);
        let inicio, fim;

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
    },

    // --- CICLO DE ATUALIZAÇÃO ---

    atualizarTudo: async function() {
        // 1. Se for admin, primeiro atualiza a lista de usuários disponíveis para este período
        if (this.isAdmin()) {
            await this.atualizarListaAssistentes();
        }

        // 2. Carrega a aba ativa
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

        // Se estiver trocando de aba, apenas carrega os dados (não precisa recarregar lista de usuários se a data não mudou)
        // Porém, se for a inicialização, a data pode ter sido setada agora. 
        // Para simplificar, chamamos carregarDadosAba, pois atualizarLista já foi chamado no init ou no change date
        this.carregarDadosAba(abaId);
    },

    carregarDadosAba: function(abaId) {
        // Se for admin e não tiver ninguém selecionado (ou lista vazia), não carrega gráficos
        if (this.isAdmin() && !this.usuarioAlvoId) {
            // Pode limpar os dados visuais aqui se quiser
            if (abaId === 'diario' && this.Geral) this.Geral.zerarKPIs();
            return;
        }

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