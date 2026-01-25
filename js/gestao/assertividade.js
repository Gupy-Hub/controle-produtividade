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
        if (!this.inicializado) {
            await this.transformarFiltrosEmSelects();
            this.inicializado = true;
        }
        this.atualizarFiltrosEBuscar();
    },

    // Função que o HTML chama no onkeyup/onchange
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

        if (tbody) {
            tbody.style.opacity = '0.5';
        }
        
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
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false })
                .limit(100);

            // Filtros
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
            // Status Styles
            let statusClass = 'bg-slate-100 text-slate-500 border-slate-200';
            const st = (item.status || '').toUpperCase();
            if (['OK', 'VALIDO'].includes(st)) statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            else if (st.includes('NOK')) statusClass = 'bg-rose-50 text-rose-700 border-rose-200';
            else if (st.includes('REV')) statusClass = 'bg-amber-50 text-amber-700 border-amber-200';

            // Datas
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            
            // --- CORREÇÃO CRÍTICA DE VAZIOS/NULOS ---
            // Se for null/undefined/vazio, exibe traço '-' e cor cinza.
            // NÃO converte para 0.
            
            const rawPorc = item.porcentagem_assertividade;
            let displayPorc = '-';
            let corPorc = "text-slate-300 font-light"; // Cor neutra para vazio

            // Verifica se tem valor REAL (não nulo, não vazio)
            if (rawPorc !== null && rawPorc !== undefined && rawPorc !== '') {
                displayPorc = rawPorc; // Exibe exatamente o que veio do banco (ex: "100,00%")
                
                // Cálculo apenas para cor
                const valP = parseFloat(String(rawPorc).replace('%','').replace(',','.'));
                
                if (!isNaN(valP)) {
                    corPorc = "text-slate-500"; // Cor padrão se for número
                    if(valP >= 99) corPorc = "text-emerald-600 font-bold";
                    else if(valP < 90) corPorc = "text-rose-600 font-bold";
                }
            }
            
            // Lógica similar para campos numéricos (Qtd Campos, OK, NOK)
            // Se for null, mostra '-'
            const qtdCampos = item.qtd_campos !== null ? item.qtd_campos : '-';
            const qtdOk = item.qtd_ok !== null ? item.qtd_ok : '-';
            const qtdNok = item.qtd_nok !== null ? item.qtd_nok : '-';

            html += `
                <tr class="hover:bg-slate-50 transition text-[11px] whitespace-nowrap">
                    <td class="px-3 py-2 font-mono text-slate-600">${dataFmt}</td>
                    <td class="px-3 py-2 text-center text-slate-400">${item.company_id || '-'}</td>
                    <td class="px-3 py-2 font-bold text-slate-700 truncate max-w-[150px]" title="${item.empresa_nome}">${item.empresa_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-600 truncate max-w-[150px]" title="${item.assistente_nome}">${item.assistente_nome || '-'}</td>
                    <td class="px-3 py-2 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ${statusClass}">${item.status || '-'}</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 italic truncate max-w-[200px]" title="${item.observacao}">${item.observacao || ''}</td>
                    
                    <td class="px-3 py-2 text-center font-mono text-slate-500">${qtdCampos}</td>
                    <td class="px-3 py-2 text-center font-bold text-emerald-600 bg-emerald-50/30">${qtdOk}</td>
                    <td class="px-3 py-2 text-center font-bold text-rose-600 bg-rose-50/30">${qtdNok}</td>
                    
                    <td class="px-3 py-2 text-center ${corPorc}">${displayPorc}</td>
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