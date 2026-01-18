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
        // 1. Converte os inputs de texto em Selects (só na primeira vez)
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
        
        if (!tbody) return; // Proteção contra HTML incorreto

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

            // Aplicação dos Filtros
            if (this.filtros.busca) {
                const termo = `%${this.filtros.busca}%`;
                query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo}`);
            }

            if (this.filtros.data) query = query.eq('data_referencia', this.filtros.data);
            
            // Filtros exatos (vêm dos Selects) ou parciais (se ainda for input)
            if (this.filtros.empresa) query = query.eq('empresa_nome', this.filtros.empresa);
            if (this.filtros.assistente) query = query.eq('assistente_nome', this.filtros.assistente);
            if (this.filtros.auditora) query = query.eq('auditora_nome', this.filtros.auditora);
            if (this.filtros.status) query = query.eq('status', this.filtros.status);
            if (this.filtros.doc) query = query.eq('doc_name', this.filtros.doc);
            
            // Filtro de OBS continua sendo texto livre (ilike)
            if (this.filtros.obs) query = query.ilike('observacao', `%${this.filtros.obs}%`);

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

            // Formatação de Data
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            
            // Formatação Porcentagem
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

    // --- MÁGICA: Converte Inputs em Selects e Preenche ---
    transformarFiltrosEmSelects: async function() {
        const campos = [
            { id: 'filtro-empresa', key: 'empresas', placeholder: 'Todas' },
            { id: 'filtro-assistente', key: 'assistentes', placeholder: 'Todos' },
            { id: 'filtro-auditora', key: 'auditoras', placeholder: 'Todas' },
            { id: 'filtro-status', key: 'status', placeholder: 'Todos' },
            { id: 'filtro-doc', key: 'docs', placeholder: 'Todos' }
        ];

        try {
            // Busca dados únicos do banco (RPC)
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');
            if (error || !data) return;

            campos.forEach(campo => {
                const inputOriginal = document.getElementById(campo.id);
                if (!inputOriginal) return;

                // Se já for select (ex: status no seu html original), apenas atualiza opções
                // Se for input, troca por select
                let select;
                
                if (inputOriginal.tagName === 'INPUT') {
                    select = document.createElement('select');
                    select.id = campo.id;
                    // Copia as classes do input original para manter o design
                    select.className = inputOriginal.className + " font-bold text-slate-700 cursor-pointer";
                    select.style.width = "100%";
                    
                    // Adiciona evento de mudança
                    select.addEventListener('change', () => this.atualizarFiltrosEBuscar());
                    
                    // Substitui no DOM
                    inputOriginal.parentNode.replaceChild(select, inputOriginal);
                } else {
                    select = inputOriginal; // Já é select
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
        // Implementação simplificada de paginação futura
        alert("Paginação simplificada para esta visualização.");
    }
};