Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {},
    timeoutBusca: null,

    // Inicializa listeners para remover lógica do HTML
    initListeners: function() {
        const inputs = [
            'search-assert', 'filtro-data', 'filtro-empresa', 
            'filtro-assistente', 'filtro-doc', 'filtro-obs', 'filtro-auditora'
        ];
        
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('keyup', () => this.atualizarFiltrosEBuscar());
            if(el && (el.type === 'date' || el.tagName === 'SELECT')) {
                el.addEventListener('change', () => this.atualizarFiltrosEBuscar());
            }
        });

        const selectStatus = document.getElementById('filtro-status');
        if(selectStatus) selectStatus.addEventListener('change', () => this.atualizarFiltrosEBuscar());
    },

    carregar: function() {
        this.paginaAtual = 1;
        this.capturarFiltros();
        this.buscarDados();
    },

    limparFiltros: function() {
        const ids = [
            'search-assert', 'filtro-data', 'filtro-empresa', 
            'filtro-assistente', 'filtro-doc', 'filtro-obs', 'filtro-auditora'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        document.getElementById('filtro-status').value = '';
        
        this.carregar();
    },

    capturarFiltros: function() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : null;
        };

        this.filtrosAtivos = {
            global: getVal('search-assert'),
            data: getVal('filtro-data'),
            empresa: getVal('filtro-empresa'),
            assistente: getVal('filtro-assistente'),
            doc: getVal('filtro-doc'),
            status: getVal('filtro-status'),
            obs: getVal('filtro-obs'),
            auditora: getVal('filtro-auditora')
        };
    },

    atualizarFiltrosEBuscar: function() {
        if (this.timeoutBusca) clearTimeout(this.timeoutBusca);
        this.timeoutBusca = setTimeout(() => {
            this.paginaAtual = 1;
            this.capturarFiltros();
            this.buscarDados();
        }, 400); // 400ms debounce
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-blue-500 text-3xl"></i><p class="text-slate-400 mt-3 font-medium">Buscando registros...</p></td></tr>';

        try {
            // Nota: Se buscar_assertividade_v5 não existir, verifique os parâmetros no backend
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
            console.error("Erro busca:", e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-rose-500"><div class="flex flex-col items-center"><i class="fas fa-exclamation-triangle text-2xl mb-2"></i><span>Erro ao carregar dados.</span><span class="text-xs text-rose-400 mt-1">${e.message}</span></div></td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';

        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-16 text-slate-400"><i class="far fa-folder-open text-2xl mb-2 block"></i>Nenhum registro encontrado.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();

        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition border-b border-slate-50 text-xs group";
            
            // Tratamento de Data Seguro (Evita problema de fuso -1 dia)
            let dataFormatada = '-';
            if(row.data_auditoria) {
                const [ano, mes, dia] = row.data_auditoria.split('-'); // Assume YYYY-MM-DD do banco
                dataFormatada = `${dia}/${mes}/${ano}`;
            }

            const statusClass = this.getStatusColor(row.status);
            
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono text-slate-500">${dataFormatada}</td>
                <td class="px-4 py-3 font-bold text-slate-700 truncate max-w-[250px]" title="${row.empresa}">${row.empresa || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[200px]" title="${row.assistente}">${row.assistente || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[200px]" title="${row.doc_name}">${row.doc_name || '-'}</td>
                <td class="px-4 py-3 text-center"><span class="${statusClass} px-2 py-0.5 rounded text-[10px] font-bold border block w-full">${row.status || '-'}</span></td>
                <td class="px-4 py-3 text-slate-500 truncate max-w-[300px]" title="${row.obs}">${row.obs || '-'}</td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">${row.campos || 0}</td>
                <td class="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50/50 rounded">${row.ok || 0}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50/50 rounded">${row.nok || 0}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-4 py-3 text-slate-500">${row.auditora || '-'}</td>
            `;
            fragment.appendChild(tr);
        });

        tbody.appendChild(fragment);
    },

    atualizarPaginacao: function(dados) {
        const total = (dados && dados.length > 0) ? dados[0].total_registros : 0;
        this.totalRegistros = total;

        const elInfo = document.getElementById('info-paginacao');
        const elContador = document.getElementById('contador-assert');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');

        if(elInfo) elInfo.innerText = `Página ${this.paginaAtual} de ${Math.ceil(total / this.itensPorPagina) || 1}`;
        if(elContador) elContador.innerHTML = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">Total: ${total}</span>`;

        if(btnAnt) {
            btnAnt.disabled = this.paginaAtual === 1;
            // Remove listeners antigos clonando o nó (hack rápido) ou apenas reatribuindo
            btnAnt.onclick = () => { this.paginaAtual--; this.buscarDados(); };
        }

        if(btnProx) {
            const temMais = (this.paginaAtual * this.itensPorPagina) < total;
            btnProx.disabled = !temMais;
            btnProx.onclick = () => { this.paginaAtual++; this.buscarDados(); };
        }
    },

    getStatusColor: function(status) {
        if(!status) return 'bg-slate-100 text-slate-400 border-slate-200';
        const s = status.toString().toUpperCase().trim();
        const map = {
            'OK': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            'NOK': 'bg-rose-100 text-rose-700 border-rose-200',
            'REV': 'bg-amber-100 text-amber-700 border-amber-200',
            'JUST': 'bg-blue-100 text-blue-700 border-blue-200',
            'DUPL': 'bg-purple-100 text-purple-700 border-purple-200',
            'IA': 'bg-indigo-100 text-indigo-700 border-indigo-200',
            'EMPR': 'bg-gray-200 text-gray-700 border-gray-300'
        };
        // Busca parcial (ex: "OK (Obs)")
        for (const k in map) {
            if (s.includes(k)) return map[k];
        }
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};