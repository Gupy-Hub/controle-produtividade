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

    // Ponto de entrada chamado pelo Menu
    carregar: async function() {
        // 1. Converte APENAS Auditora e Status em Selects Inteligentes
        // Empresa, Assistente e Doc continuam como INPUT de texto (Digitar)
        if (!this.inicializado) {
            await this.transformarFiltrosEmSelects();
            this.inicializado = true;
        }

        // 2. Dispara a busca inicial
        this.atualizarFiltrosEBuscar();
    },

    // Função que o HTML chama no onkeyup/onchange
    atualizarFiltrosEBuscar: function() {
        const tbody = document.getElementById('lista-assertividade');
        
        // Atualiza estado lendo do DOM
        this.filtros.busca = document.getElementById('search-assert')?.value || '';
        this.filtros.data = document.getElementById('filtro-data')?.value || '';
        this.filtros.empresa = document.getElementById('filtro-empresa')?.value || '';
        this.filtros.assistente = document.getElementById('filtro-assistente')?.value || '';
        this.filtros.doc = document.getElementById('filtro-doc')?.value || '';
        this.filtros.status = document.getElementById('filtro-status')?.value || '';
        this.filtros.obs = document.getElementById('filtro-obs')?.value || '';
        this.filtros.auditora = document.getElementById('filtro-auditora')?.value || '';

        // Feedback visual imediato
        if (tbody) {
            tbody.style.opacity = '0.5';
        }
        
        // Debounce para não travar digitando
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
            // Query Base
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false })
                .limit(100);

            // --- APLICAÇÃO DOS FILTROS ---

            // Busca Geral (Barra do topo)
            if (this.filtros.busca) {
                const termo = `%${this.filtros.busca}%`;
                query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo}`);
            }

            // Data (Exata)
            if (this.filtros.data) query = query.eq('data_referencia', this.filtros.data);
            
            // --- FILTROS DE DIGITAÇÃO (ILIKE - CONTÉM) ---
            // Agora busca qualquer parte do texto digitado
            if (this.filtros.empresa) query = query.ilike('empresa_nome', `%${this.filtros.empresa}%`);
            if (this.filtros.assistente) query = query.ilike('assistente_nome', `%${this.filtros.assistente}%`);
            if (this.filtros.doc) query = query.ilike('doc_name', `%${this.filtros.doc}%`);
            if (this.filtros.obs) query = query.ilike('observacao', `%${this.filtros.obs}%`);

            // --- FILTROS DE SELEÇÃO (EQ - EXATO) ---
            // Auditora e Status continuam como Select, então a busca é exata
            if (this.filtros.auditora) query = query.eq('auditora_nome', this.filtros.auditora);
            if (this.filtros.status) query = query.eq('status', this.filtros.status);

            const { data, error } = await query;

            if (error) throw error;

            this.renderizarTabela(data || []);
            if (infoPag) infoPag.innerHTML = `Exibindo <b>${(data || []).length}</b> registros recentes.`;

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
            // Estilos de Status
            let statusClass = 'bg-slate-100 text-slate-500 border-slate-200';
            const st = (item.status || '').toUpperCase();
            if (['OK', 'VALIDO'].includes(st)) statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            else if (st.includes('NOK')) statusClass = 'bg-rose-50 text-rose-700 border-rose-200';
            else if (st.includes('REV')) statusClass = 'bg-amber-50 text-amber-700 border-amber-200';

            // Formatações
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            const porc = item.porcentagem_assertividade || '0,00%';
            
            let corPorc = "text-slate-500";
            const valP = parseFloat(porc.replace('%','').replace(',','.'));
            if(valP >= 99) corPorc = "text-emerald-600 font-bold";
            else if(valP < 90) corPorc = "text-rose-600 font-bold";

            html += `
                <tr class="hover:bg-slate-50 transition text-[11px] whitespace-nowrap">
                    <td class="px-3 py-2 font-mono text-slate-600">${dataFmt}</td>
                    <td class="px-3 py-2 text-center text-slate-400">${item.company_id || '-'}</td>
                    <td class="px-3 py-2 font-bold text-slate-700 truncate max-w-[150px]" title="${item.empresa_nome}">${item.empresa_nome}</td>
                    <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${item.assistente_nome}">${item.assistente_nome}</td>
                    <td class="px-3 py-2 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name}</td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ${statusClass}">${item.status}</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 italic truncate max-w-[200px]" title="${item.observacao}">${item.observacao || ''}</td>
                    <td class="px-3 py-2 text-center font-mono text-slate-500">${item.qtd_campos || '-'}</td>
                    <td class="px-3 py-2 text-center font-bold text-emerald-600 bg-emerald-50/30">${item.qtd_ok || '-'}</td>
                    <td class="px-3 py-2 text-center font-bold text-rose-600 bg-rose-50/30">${item.qtd_nok || '-'}</td>
                    <td class="px-3 py-2 text-center ${corPorc}">${porc}</td>
                    <td class="px-3 py-2 text-slate-500 uppercase text-[10px]">${item.auditora_nome || '-'}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    // --- MÁGICA: Converte APENAS Auditora e Status em Selects ---
    transformarFiltrosEmSelects: async function() {
        // Removi Empresa, Assistente e Doc daqui. Eles continuam como Input Text.
        const campos = [
            { id: 'filtro-auditora', key: 'auditoras', placeholder: 'Todas' },
            { id: 'filtro-status', key: 'status', placeholder: 'Todos' }
        ];

        try {
            // Busca dados únicos do banco (RPC)
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');
            if (error || !data) return;

            campos.forEach(campo => {
                const inputOriginal = document.getElementById(campo.id);
                if (!inputOriginal) return;

                let select;
                
                // Transforma Input em Select (caso da Auditora)
                if (inputOriginal.tagName === 'INPUT') {
                    select = document.createElement('select');
                    select.id = campo.id;
                    select.className = inputOriginal.className + " font-bold text-slate-700 cursor-pointer";
                    select.style.width = "100%";
                    select.addEventListener('change', () => this.atualizarFiltrosEBuscar());
                    inputOriginal.parentNode.replaceChild(select, inputOriginal);
                } else {
                    select = inputOriginal; // Caso do Status, que já é select
                }

                // Preenche as opções
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