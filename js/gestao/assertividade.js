Gestao.Assertividade = {
    timerBusca: null,
    
    estado: {
        pagina: 0,
        limite: 50,
        total: 0,
        termo: '',
        filtros: {
            data: '',
            empresa: '',
            auditora: '', // Filtrar pelo nome da auditora
            status: '',
            doc: ''
        }
    },

    // --- CARREGAMENTO INICIAL ---
    carregar: async function() {
        this.estado.pagina = 0;
        this.limparCamposUI();
        this.buscarDados(); 
    },

    limparCamposUI: function() {
        const ids = ['search-assert', 'filtro-data', 'filtro-empresa', 'filtro-auditora', 'filtro-status', 'filtro-doc'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
    },

    // --- GATILHO DE BUSCA ---
    atualizarFiltrosEBuscar: function() {
        // Coleta valores da tela
        this.estado.termo = document.getElementById('search-assert')?.value.trim() || '';
        this.estado.filtros.data = document.getElementById('filtro-data')?.value || '';
        this.estado.filtros.empresa = document.getElementById('filtro-empresa')?.value.trim() || '';
        this.estado.filtros.auditora = document.getElementById('filtro-auditora')?.value.trim() || '';
        this.estado.filtros.status = document.getElementById('filtro-status')?.value || '';
        this.estado.filtros.doc = document.getElementById('filtro-doc')?.value.trim() || '';

        // Reset e Debounce
        this.estado.pagina = 0;
        clearTimeout(this.timerBusca);
        
        const tbody = document.getElementById('lista-assertividade');
        if(tbody && tbody.rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Consultando View Inteligente...</p></td></tr>`;
        }

        this.timerBusca = setTimeout(() => {
            this.buscarDados();
        }, 500);
    },

    mudarPagina: function(delta) {
        const novaPagina = this.estado.pagina + delta;
        // Validação simples para não ir para página negativa
        if (novaPagina >= 0) {
            this.estado.pagina = novaPagina;
            this.buscarDados(); 
        }
    },

    // --- NOVA LÓGICA DE BUSCA (SEM RPC) ---
    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        const contador = document.getElementById('contador-assert');

        // Feedback Visual
        if(infoPag) infoPag.innerHTML = `<span class="text-blue-500"><i class="fas fa-sync fa-spin"></i> Carregando...</span>`;

        try {
            // 1. CONSTRUÇÃO DA QUERY NO SUPABASE CLIENT
            // Usamos a View 'vw_assertividade_completa' criada na Fase 2
            let query = Sistema.supabase
                .from('vw_assertividade_completa')
                .select('*', { count: 'exact' }); // Pede contagem total para paginação

            // 2. APLICAÇÃO DINÂMICA DE FILTROS
            // Muito mais fácil de manter que procedures SQL
            if (this.estado.termo) {
                query = query.ilike('search_vector', `%${this.estado.termo}%`);
            }
            if (this.estado.filtros.data) {
                query = query.eq('data_referencia', this.estado.filtros.data);
            }
            if (this.estado.filtros.empresa) {
                query = query.ilike('empresa_nome', `%${this.estado.filtros.empresa}%`);
            }
            if (this.estado.filtros.auditora) {
                query = query.ilike('nome_auditora_raw', `%${this.estado.filtros.auditora}%`);
            }
            if (this.estado.filtros.status) {
                query = query.ilike('status', `%${this.estado.filtros.status}%`);
            }
            if (this.estado.filtros.doc) {
                query = query.ilike('nome_documento', `%${this.estado.filtros.doc}%`);
            }

            // 3. ORDENAÇÃO E PAGINAÇÃO
            const inicio = this.estado.pagina * this.estado.limite;
            const fim = inicio + this.estado.limite - 1;
            
            query = query.order('data_referencia', { ascending: false })
                         .range(inicio, fim);

            // 4. EXECUÇÃO
            const { data, error, count } = await query;

            if (error) throw error;

            this.estado.total = count || 0;
            this.renderizarTabela(data || []);
            this.atualizarControlesPaginacao();

        } catch (e) {
            console.error("Erro na busca:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500 font-bold"><i class="fas fa-bug mr-2"></i> Erro ao carregar dados: ${e.message}</td></tr>`;
        }
    },

    atualizarControlesPaginacao: function() {
        const infoPag = document.getElementById('info-paginacao');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        const contador = document.getElementById('contador-assert');

        const total = this.estado.total;
        const inicio = (this.estado.pagina * this.estado.limite) + 1;
        let fim = (this.estado.pagina + 1) * this.estado.limite;
        if (fim > total) fim = total;

        if(contador) contador.innerText = `${total.toLocaleString('pt-BR')} registros`;

        if (total === 0) {
            if(infoPag) infoPag.innerHTML = "Sem resultados.";
            if(btnAnt) btnAnt.disabled = true;
            if(btnProx) btnProx.disabled = true;
        } else {
            if(infoPag) infoPag.innerHTML = `${inicio}-${fim} de ${total}`;
            if(btnAnt) btnAnt.disabled = this.estado.pagina === 0;
            if(btnProx) btnProx.disabled = fim >= total;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-folder-open text-3xl opacity-20"></i><span>Nada encontrado.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            // SEGURANÇA: Sanitização (Fase 1 ainda ativa!)
            const empresaSafe = Sistema.escapar(item.empresa_nome || '-');
            const auditoraSafe = Sistema.escapar(item.nome_auditora_raw || '-');
            const docSafe = Sistema.escapar(item.nome_documento || '-');
            const obsSafe = Sistema.escapar(item.observacao || '-');
            
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            
            // Status Badge (Lógica visual mantida)
            const stRaw = Sistema.escapar(item.status || '-');     
            const stUp = stRaw.toUpperCase();     
            let badgeClass = "bg-slate-100 text-slate-500 border-slate-200"; 
            if (stUp === 'OK' || stUp === 'VALIDO') badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
            else if (stUp.includes('NOK')) badgeClass = "bg-rose-100 text-rose-700 border-rose-200";
            else if (stUp.includes('REV')) badgeClass = "bg-amber-100 text-amber-700 border-amber-200";

            const statusBadge = `<span class="${badgeClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase border">${stRaw}</span>`;

            // Assertividade (Vindo calculado do SQL agora!)
            const assertVal = parseFloat(item.indice_assertividade || 0);
            let assertColor = 'text-slate-600';
            if (assertVal >= 99) assertColor = 'text-emerald-600 font-bold';
            else if (assertVal < 90 && assertVal > 0) assertColor = 'text-rose-600 font-bold';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-500 font-mono">${dataFmt}</td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[180px] truncate" title="${empresaSafe}">${empresaSafe}</td>
                <td class="px-3 py-2 text-slate-600 max-w-[120px] truncate" title="${auditoraSafe}">${auditoraSafe}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${docSafe}">${docSafe}</td>
                <td class="px-3 py-2 text-center">${statusBadge}</td>
                <td class="px-3 py-2 text-slate-400 max-w-[200px] truncate cursor-help border-l border-slate-100 pl-4" title="${obsSafe}">${obsSafe}</td>
                <td class="px-3 py-2 text-center font-mono bg-slate-50/50">${item.num_campos}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold bg-emerald-50/30">${item.qtd_ok}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold bg-rose-50/30">${item.qtd_nok}</td>
                <td class="px-3 py-2 text-center ${assertColor} text-sm">${assertVal}%</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};