Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {},
    timeoutBusca: null,

    initListeners: function() {
        // Listeners para inputs de texto (keyup)
        ['search-assert', 'filtro-empresa', 'filtro-assistente', 'filtro-doc', 'filtro-obs', 'filtro-auditora'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('keyup', () => this.atualizarFiltrosEBuscar());
        });

        // Listeners para selects e datas (change)
        ['filtro-data', 'filtro-status'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', () => this.atualizarFiltrosEBuscar());
        });
    },

    limparFiltros: function() {
        const inputs = document.querySelectorAll('#view-assertividade input, #view-assertividade select');
        inputs.forEach(el => el.value = '');
        this.carregar();
    },

    carregar: function() {
        this.paginaAtual = 1;
        this.capturarFiltros();
        this.buscarDados();
    },

    capturarFiltros: function() {
        const get = (id) => { const el = document.getElementById(id); return el && el.value.trim() ? el.value.trim() : null; };
        
        this.filtrosAtivos = {
            global: get('search-assert'),
            data: get('filtro-data'),
            empresa: get('filtro-empresa'),
            assistente: get('filtro-assistente'),
            doc: get('filtro-doc'),
            status: get('filtro-status'),
            obs: get('filtro-obs'),
            auditora: get('filtro-auditora')
        };
    },

    atualizarFiltrosEBuscar: function() {
        if (this.timeoutBusca) clearTimeout(this.timeoutBusca);
        this.timeoutBusca = setTimeout(() => {
            this.paginaAtual = 1;
            this.capturarFiltros();
            this.buscarDados();
        }, 400);
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-blue-500 text-3xl"></i><p class="text-slate-400 mt-2">Buscando dados...</p></td></tr>';
        if(contador) contador.innerHTML = '';

        try {
            // Prepara parâmetros (envia null se vazio para o RPC ignorar o filtro)
            const params = {
                p_pagina: this.paginaAtual,
                p_tamanho: this.itensPorPagina,
                p_busca_global: this.filtrosAtivos.global,
                p_filtro_data: this.filtrosAtivos.data, // IMPORTANTE: Se null, o backend decide (geralmente traz tudo ou mês atual)
                p_filtro_empresa: this.filtrosAtivos.empresa,
                p_filtro_assistente: this.filtrosAtivos.assistente,
                p_filtro_doc: this.filtrosAtivos.doc,
                p_filtro_status: this.filtrosAtivos.status,
                p_filtro_obs: this.filtrosAtivos.obs,
                p_filtro_auditora: this.filtrosAtivos.auditora
            };

            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);
            if (error) throw error;

            this.renderizarTabela(data);
            this.atualizarPaginacao(data);

        } catch (e) {
            console.error("Erro busca:", e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-rose-500"><i class="fas fa-exclamation-triangle"></i> Erro ao buscar: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';

        if (!dados || dados.length === 0) {
            const msg = this.filtrosAtivos.data 
                ? `Nenhum registro encontrado para a data <b>${this.filtrosAtivos.data.split('-').reverse().join('/')}</b>.`
                : 'Nenhum registro encontrado. Tente ajustar os filtros.';
                
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-16 text-slate-400"><i class="far fa-folder-open text-3xl mb-3 block"></i>${msg}</td></tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition border-b border-slate-50 text-xs group";
            
            // Data Formatada (YYYY-MM-DD -> DD/MM/YYYY)
            let dataFmt = '-';
            if(row.data_auditoria) {
                const [Y, M, D] = row.data_auditoria.split('-');
                dataFmt = `${D}/${M}/${Y}`;
            }

            const statusClass = this.getStatusColor(row.status);

            tr.innerHTML = `
                <td class="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">${dataFmt}</td>
                <td class="px-3 py-2 font-bold text-slate-700 truncate max-w-[200px]" title="${row.empresa}">${row.empresa || '-'}</td>
                <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${row.assistente}">${row.assistente || '-'}</td>
                <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${row.doc_name}">${row.doc_name || '-'}</td>
                <td class="px-3 py-2 text-center"><span class="${statusClass} px-2 py-0.5 rounded text-[10px] font-bold border block w-full truncate">${row.status || '-'}</span></td>
                <td class="px-3 py-2 text-slate-500 truncate max-w-[200px]" title="${row.obs}">${row.obs || '-'}</td>
                <td class="px-3 py-2 text-center font-mono text-slate-400">${row.campos || 0}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold bg-emerald-50 rounded">${row.ok || 0}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold bg-rose-50 rounded">${row.nok || 0}</td>
                <td class="px-3 py-2 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-3 py-2 text-slate-500 truncate max-w-[100px]">${row.auditora || '-'}</td>
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
        
        if(elInfo) elInfo.innerText = `Pág ${this.paginaAtual} de ${Math.ceil(total/this.itensPorPagina) || 1}`;
        if(elContador) elContador.innerHTML = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold ml-2">Total: ${total}</span>`;
        
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        
        if(btnAnt) {
            btnAnt.disabled = this.paginaAtual === 1;
            btnAnt.onclick = () => { this.paginaAtual--; this.buscarDados(); };
        }
        if(btnProx) {
            btnProx.disabled = (this.paginaAtual * this.itensPorPagina) >= total;
            btnProx.onclick = () => { this.paginaAtual++; this.buscarDados(); };
        }
    },

    getStatusColor: function(status) {
        if(!status) return 'bg-slate-100 text-slate-400 border-slate-200';
        const s = status.toString().toUpperCase();
        if(s.includes('OK')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if(s.includes('NOK')) return 'bg-rose-100 text-rose-700 border-rose-200';
        if(s.includes('REV')) return 'bg-amber-100 text-amber-700 border-amber-200';
        if(s.includes('JUST')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if(s.includes('IA')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};