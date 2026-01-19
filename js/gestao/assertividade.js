window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    inicializado: false,
    timerBusca: null,
    
    // Configuração estática para aliviar o banco
    opcoesStatus: ['OK', 'NOK', 'REV', 'VALIDO', 'INVALIDO', 'PENDENTE'],

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
        console.log("Gestao.Assertividade: Iniciando módulo (v3 Otimizada)...");
        
        // Garante visibilidade
        const view = document.getElementById('view-assertividade');
        if (view && view.classList.contains('hidden')) {
            view.classList.remove('hidden');
        }

        try {
            if (!this.inicializado) {
                // Carrega status estático IMEDIATAMENTE (UX Instantânea)
                this.montarSelectStatus();
                
                // Tenta carregar auditoras dinamicamente (assíncrono, não bloqueia)
                this.transformarAuditorasEmSelect();
                
                this.inicializado = true;
            }
            this.atualizarFiltrosEBuscar();
        } catch (error) {
            console.error("Erro fatal init:", error);
            this.exibirErroFatal(error.message);
        }
    },

    atualizarFiltrosEBuscar: function() {
        const tbody = document.getElementById('lista-assertividade');
        
        // Coleta Segura com Optional Chaining (?.)
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
        this.timerBusca = setTimeout(() => this.buscarDados(), 500);
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        
        if (!tbody) return;

        tbody.style.opacity = '1';
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2 text-xs">Processando...</p></td></tr>';
        if (infoPag) infoPag.innerText = "Filtrando...";

        try {
            if (!Sistema?.supabase) throw new Error("Supabase desconectado.");

            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false })
                .limit(100);

            // Aplicação Otimizada de Filtros
            if (this.filtros.busca) {
                const termo = `%${this.filtros.busca}%`;
                query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo}`);
            }

            if (this.filtros.data) query = query.eq('data_referencia', this.filtros.data);
            if (this.filtros.empresa) query = query.ilike('empresa_nome', `%${this.filtros.empresa}%`);
            if (this.filtros.assistente) query = query.ilike('assistente_nome', `%${this.filtros.assistente}%`);
            if (this.filtros.doc) query = query.ilike('doc_name', `%${this.filtros.doc}%`);
            if (this.filtros.obs) query = query.ilike('observacao', `%${this.filtros.obs}%`);
            if (this.filtros.auditora) query = query.eq('auditora_nome', this.filtros.auditora);
            if (this.filtros.status) query = query.eq('status', this.filtros.status);

            const { data, error } = await query;
            if (error) throw error;

            this.renderizarTabela(data || []);
            if (infoPag) infoPag.innerHTML = `Exibindo <b>${(data || []).length}</b> registros.`;

        } catch (error) {
            console.error("Erro na busca:", error);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-rose-500 font-bold text-xs">Erro de conexão: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        if (!lista?.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10 text-slate-400 text-xs">Nenhum registro encontrado.</td></tr>';
            return;
        }

        const formatNum = (v) => (v != null && v !== '') ? v : '-';
        
        let html = '';
        lista.forEach(item => {
            // Estilos de Status
            let stClass = 'bg-slate-100 text-slate-500 border-slate-200';
            const st = (item.status || '').toUpperCase();
            if (['OK', 'VALIDO'].some(k => st.includes(k))) stClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            else if (st.includes('NOK')) stClass = 'bg-rose-50 text-rose-700 border-rose-200';
            else if (st.includes('REV')) stClass = 'bg-amber-50 text-amber-700 border-amber-200';

            // Porcentagem e Cor
            let corPorc = "text-slate-300";
            const porcVal = parseFloat(String(item.porcentagem_assertividade || '').replace('%','').replace(',','.'));
            if (!isNaN(porcVal)) {
                corPorc = porcVal >= 99 ? "text-emerald-600 font-bold" : (porcVal < 90 ? "text-rose-600 font-bold" : "text-slate-500");
            }

            html += `
                <tr class="hover:bg-slate-50 transition text-[11px] whitespace-nowrap border-b border-slate-50">
                    <td class="px-3 py-2 font-mono text-slate-600">${item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-'}</td>
                    <td class="px-3 py-2 text-center text-slate-400 font-mono text-[10px]">${item.company_id || '-'}</td>
                    <td class="px-3 py-2 font-bold text-slate-700 truncate max-w-[150px]" title="${item.empresa_nome}">${item.empresa_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${item.assistente_nome}">${item.assistente_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                    <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${stClass}">${item.status || 'N/A'}</span></td>
                    <td class="px-3 py-2 text-slate-400 italic truncate max-w-[150px]">${item.observacao || ''}</td>
                    <td class="px-3 py-2 text-center border-l border-slate-100">${formatNum(item.qtd_campos)}</td>
                    <td class="px-3 py-2 text-center font-bold text-emerald-600 bg-emerald-50/20">${formatNum(item.qtd_ok)}</td>
                    <td class="px-3 py-2 text-center font-bold text-rose-600 bg-rose-50/20 border-r border-slate-100">${formatNum(item.qtd_nok)}</td>
                    <td class="px-3 py-2 text-center ${corPorc}">${item.porcentagem_assertividade || '-'}</td>
                    <td class="px-3 py-2 text-slate-400 uppercase text-[9px]">${item.auditora_nome || '-'}</td>
                </tr>`;
        });
        tbody.innerHTML = html;
    },

    // --- MÉTODOS DE FILTRO OTIMIZADOS ---

    // 1. Status: Usa lista estática (Rápido, sem DB)
    montarSelectStatus: function() {
        this.converterInputParaSelect('filtro-status', ['Todos', ...this.opcoesStatus]);
    },

    // 2. Auditoras: Tenta DB, falha silenciosamente mantendo input
    transformarAuditorasEmSelect: async function() {
        try {
            // Se falhar aqui, cai no catch e o input continua texto (fallback seguro)
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');
            if (error) throw error;
            
            if (data && data.auditoras && data.auditoras.length > 0) {
                this.converterInputParaSelect('filtro-auditora', ['Todas', ...data.auditoras]);
            }
        } catch (e) {
            console.warn("Filtro Auditora: Mantendo input de texto (Performance/Timeout)", e.message);
        }
    },

    // Helper reutilizável para criar selects
    converterInputParaSelect: function(elementId, opcoes) {
        const input = document.getElementById(elementId);
        if (!input) return;

        // Se já for select, apenas atualiza (preservando valor se possível)
        if (input.tagName === 'SELECT') return;

        const select = document.createElement('select');
        select.id = elementId;
        select.className = input.className.replace('text-[10px]', 'text-[10px] cursor-pointer bg-slate-50 font-bold text-slate-700');
        select.style.width = "100%";
        select.addEventListener('change', () => this.atualizarFiltrosEBuscar());

        let html = '';
        opcoes.forEach(opt => {
            const val = (opt === 'Todas' || opt === 'Todos') ? '' : opt;
            html += `<option value="${val}">${opt}</option>`;
        });
        select.innerHTML = html;

        input.parentNode.replaceChild(select, input);
    },

    exibirErroFatal: function(msg) {
        const tbody = document.getElementById('lista-assertividade');
        if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center text-red-500 py-10 font-bold">Erro crítico: ${msg}</td></tr>`;
    },

    mudarPagina: function(delta) {
        alert("Paginação em desenvolvimento.");
    }
};