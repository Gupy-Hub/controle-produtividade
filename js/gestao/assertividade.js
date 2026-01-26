window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    inicializado: false,
    timerBusca: null,
    
    // Estado dos filtros
    filtros: {
        busca: '',
        data: '',
        empresa: '',
        assistente: '',
        auditora: '',
        status: '',
        doc: '',
        obs: ''
    },

    carregar: async function() {
        if (!this.inicializado) {
            await this.transformarFiltrosEmSelects();
            this.inicializado = true;
        }
        this.atualizarFiltrosEBuscar();
    },

    atualizarFiltrosEBuscar: function() {
        const tbody = document.getElementById('lista-assertividade');
        
        this.filtros.busca = document.getElementById('search-assert')?.value || '';
        this.filtros.data = document.getElementById('filtro-data')?.value || '';
        this.filtros.empresa = document.getElementById('filtro-empresa')?.value || '';
        this.filtros.assistente = document.getElementById('filtro-assistente')?.value || '';
        this.filtros.doc = document.getElementById('filtro-doc')?.value || '';
        this.filtros.status = document.getElementById('filtro-status')?.value || '';
        this.filtros.obs = document.getElementById('filtro-obs')?.value || '';
        this.filtros.auditora = document.getElementById('filtro-auditora')?.value || '';

        if (tbody) tbody.style.opacity = '0.5';
        
        clearTimeout(this.timerBusca);
        this.timerBusca = setTimeout(() => {
            this.buscarDados();
        }, 500);
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        
        if (!tbody) return; 

        tbody.style.opacity = '1';
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2 text-xs">Carregando dados...</p></td></tr>';
        
        if (infoPag) infoPag.innerText = "Filtrando...";

        try {
            // USANDO O NOVO MÓDULO CENTRAL
            const dados = await Sistema.Assertividade.buscar({
                buscaGeral: this.filtros.busca,
                data: this.filtros.data,
                empresa: this.filtros.empresa,
                assistente: this.filtros.assistente,
                doc: this.filtros.doc,
                obs: this.filtros.obs,
                auditora: this.filtros.auditora,
                status: this.filtros.status,
                limit: 100
            });

            this.renderizarTabela(dados);
            if (infoPag) infoPag.innerHTML = `Exibindo <b>${dados.length}</b> registros recentes.`;

        } catch (error) {
            console.error("Erro busca:", error);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-red-500 font-bold text-xs">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10 text-slate-400 text-xs">Nenhum registro encontrado com esses filtros.</td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            
            // Usando funções do Core para formatação
            const badgeStatus = Sistema.Assertividade.renderizarBadgeStatus(item.status);
            const stylePorc = Sistema.Assertividade.obterEstiloPorcentagem(item.porcentagem_assertividade);
            const valPorc = Sistema.Assertividade.formatarValor(item.porcentagem_assertividade);

            const valCampos = Sistema.Assertividade.formatarValor(item.qtd_campos);
            const valOk = Sistema.Assertividade.formatarValor(item.qtd_ok);
            const valNok = Sistema.Assertividade.formatarValor(item.qtd_nok);

            html += `
                <tr class="hover:bg-slate-50 transition text-[11px] whitespace-nowrap">
                    <td class="px-3 py-2 font-mono text-slate-600">${dataFmt}</td>
                    <td class="px-3 py-2 text-center text-slate-400">${item.company_id || '-'}</td>
                    <td class="px-3 py-2 font-bold text-slate-700 truncate max-w-[150px]" title="${item.empresa_nome}">${item.empresa_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${item.assistente_nome}">${item.assistente_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                    <td class="px-3 py-2 text-center">
                        ${badgeStatus}
                    </td>
                    <td class="px-3 py-2 text-slate-400 italic truncate max-w-[200px]" title="${item.observacao}">${item.observacao || ''}</td>
                    
                    <td class="px-3 py-2 text-center font-mono text-slate-500">${valCampos}</td>
                    <td class="px-3 py-2 text-center font-bold text-emerald-600 bg-emerald-50/30">${valOk}</td>
                    <td class="px-3 py-2 text-center font-bold text-rose-600 bg-rose-50/30">${valNok}</td>
                    
                    <td class="px-3 py-2 text-center ${stylePorc}">${valPorc}</td>
                    <td class="px-3 py-2 text-slate-500 uppercase text-[10px]">${item.auditora_nome || '-'}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    transformarFiltrosEmSelects: async function() {
        const campos = [
            { id: 'filtro-auditora', key: 'auditoras', placeholder: 'Todas' },
            { id: 'filtro-status', key: 'status', placeholder: 'Todos' }
        ];

        try {
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');
            if (error || !data) return;

            campos.forEach(campo => {
                const inputOriginal = document.getElementById(campo.id);
                if (!inputOriginal) return;

                let select;
                if (inputOriginal.tagName === 'INPUT') {
                    select = document.createElement('select');
                    select.id = campo.id;
                    select.className = inputOriginal.className + " font-bold text-slate-700 cursor-pointer";
                    select.style.width = "100%";
                    select.addEventListener('change', () => this.atualizarFiltrosEBuscar());
                    inputOriginal.parentNode.replaceChild(select, inputOriginal);
                } else {
                    select = inputOriginal;
                }

                let htmlOpts = `<option value="">${campo.placeholder}</option>`;
                const lista = data[campo.key] || [];
                lista.forEach(item => {
                    if(item) htmlOpts += `<option value="${item}">${item}</option>`;
                });
                select.innerHTML = htmlOpts;
            });

        } catch (e) {
            console.warn("Não foi possível carregar filtros dinâmicos:", e);
        }
    },

    mudarPagina: function(delta) {
        alert("Paginação simplificada para esta visualização.");
    }
};