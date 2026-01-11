Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {}, // Armazena o estado atual dos filtros

    // Inicializa a tela
    carregar: function() {
        this.paginaAtual = 1;
        this.capturarFiltros(); // Pega os filtros iniciais (geralmente vazios)
        this.buscarDados();
    },

    // Função central que lê os inputs do HTML e atualiza o estado
    capturarFiltros: function() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : null;
        };

        // Mapeia os IDs do HTML para o objeto de filtros
        this.filtrosAtivos = {
            global: getVal('search-assert'),       // Busca Geral
            data: getVal('filtro-data'),           // Data
            empresa: getVal('filtro-empresa'),     // Coluna Empresa
            assistente: getVal('filtro-assistente'), // Coluna Assistente
            doc: getVal('filtro-doc'),             // Coluna Documento
            status: getVal('filtro-status'),       // Coluna Status
            obs: getVal('filtro-obs'),             // Coluna Obs
            auditora: getVal('filtro-auditora')    // Coluna Auditora
        };
    },

    // Acionado pelo "onkeyup" ou "onchange" dos inputs
    atualizarFiltrosEBuscar: function() {
        // Debounce simples: espera o usuário parar de digitar por 300ms
        if (this.timeoutBusca) clearTimeout(this.timeoutBusca);
        
        this.timeoutBusca = setTimeout(() => {
            this.paginaAtual = 1; // Sempre volta pra página 1 ao filtrar
            this.capturarFiltros();
            this.buscarDados();
        }, 400);
    },

    // Chama o Supabase
    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        if(!tbody) return;

        // Feedback de carregamento
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Buscando dados no servidor...</p></td></tr>';

        try {
            // Prepara os parâmetros para a função SQL (RPC)
            // IMPORTANTE: Tratamento de vazio para NULL
            const params = {
                p_pagina: this.paginaAtual,
                p_tamanho: this.itensPorPagina,
                p_busca_global: this.filtrosAtivos.global || null,
                p_filtro_data: this.filtrosAtivos.data || null,
                p_filtro_empresa: this.filtrosAtivos.empresa || null,
                p_filtro_assistente: this.filtrosAtivos.assistente || null,
                p_filtro_doc: this.filtrosAtivos.doc || null,
                p_filtro_status: this.filtrosAtivos.status || null,
                p_filtro_obs: this.filtrosAtivos.obs || null,
                p_filtro_auditora: this.filtrosAtivos.auditora || null
            };

            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);

            if (error) throw error;

            this.renderizarTabela(data);
            this.atualizarPaginacao(data);

        } catch (e) {
            console.error("Erro na busca:", e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-red-500"><i class="fas fa-exclamation-triangle"></i> Erro ao buscar: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';

        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10 text-slate-400">Nenhum registro encontrado com esses filtros.</td></tr>';
            return;
        }

        let html = '';
        dados.forEach(row => {
            // Formatação de cor e estilo
            const statusClass = this.getStatusColor(row.status);
            const dataFormatada = row.data_auditoria ? new Date(row.data_auditoria).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';
            
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 text-xs">
                <td class="px-3 py-2 whitespace-nowrap font-mono text-slate-500">${dataFormatada}</td>
                <td class="px-3 py-2 text-center text-slate-400">${row.company_id || '-'}</td>
                <td class="px-3 py-2 font-bold text-slate-700">${row.empresa || '-'}</td>
                <td class="px-3 py-2 text-slate-600">${row.assistente || '-'}</td>
                <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${row.doc_name}">${row.doc_name || '-'}</td>
                <td class="px-3 py-2 text-center"><span class="${statusClass} px-2 py-0.5 rounded text-[10px] font-bold border">${row.status || '-'}</span></td>
                <td class="px-3 py-2 text-slate-500 truncate max-w-[200px]" title="${row.obs}">${row.obs || '-'}</td>
                <td class="px-3 py-2 text-center font-mono">${row.campos || 0}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold bg-emerald-50 rounded">${row.ok || 0}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold bg-rose-50 rounded">${row.nok || 0}</td>
                <td class="px-3 py-2 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-3 py-2 text-slate-500">${row.auditora || '-'}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    },

    atualizarPaginacao: function(dados) {
        // O total de registros vem na própria query (coluna total_registros)
        // Pegamos do primeiro item (se existir)
        const total = (dados && dados.length > 0) ? dados[0].total_registros : 0;
        this.totalRegistros = total;

        const elInfo = document.getElementById('info-paginacao');
        const elContador = document.getElementById('contador-assert');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');

        if(elInfo) elInfo.innerText = `Página ${this.paginaAtual}`;
        if(elContador) elContador.innerHTML = `<span class="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200 text-[10px] ml-2">Total: ${total}</span>`;

        // Controle dos botões
        if(btnAnt) {
            btnAnt.disabled = this.paginaAtual === 1;
            btnAnt.onclick = () => this.mudarPagina(-1);
        }

        if(btnProx) {
            // Se trouxe menos itens que o tamanho da página, é a última
            const temMais = (this.paginaAtual * this.itensPorPagina) < total;
            btnProx.disabled = !temMais;
            btnProx.onclick = () => this.mudarPagina(1);
        }
    },

    mudarPagina: function(delta) {
        this.paginaAtual += delta;
        if(this.paginaAtual < 1) this.paginaAtual = 1;
        this.buscarDados();
    },

    // Utilitário de Estilo
    getStatusColor: function(status) {
        if(!status) return 'bg-slate-100 text-slate-500 border-slate-200';
        const s = status.toUpperCase();
        if(s === 'OK') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if(s === 'NOK') return 'bg-rose-100 text-rose-700 border-rose-200';
        if(s.includes('REV')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        if(s.includes('JUST')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if(s.includes('DUPL')) return 'bg-purple-100 text-purple-700 border-purple-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};

// Se estivermos na página correta, inicializa
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que o menu carregou
    setTimeout(() => {
        if(window.location.pathname.includes('assertividade')) {
            Gestao.Assertividade.carregar();
        }
    }, 100);
});