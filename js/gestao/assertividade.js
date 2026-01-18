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
            assistente: '',
            auditora: '',
            status: '',
            doc: '',
            obs: ''
        }
    },

    carregar: async function() {
        this.estado.pagina = 0;
        this.buscarDados(); 
    },

    limparCamposUI: function() {
        const ids = ['search-assert', 'filtro-data', 'filtro-empresa', 'filtro-assistente', 'filtro-auditora', 'filtro-status', 'filtro-doc', 'filtro-obs'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        this.atualizarFiltrosEBuscar();
    },

    atualizarFiltrosEBuscar: function() {
        this.estado.termo = document.getElementById('search-assert')?.value.trim() || '';
        this.estado.filtros.data = document.getElementById('filtro-data')?.value || '';
        this.estado.filtros.empresa = document.getElementById('filtro-empresa')?.value.trim() || '';
        this.estado.filtros.assistente = document.getElementById('filtro-assistente')?.value.trim() || '';
        this.estado.filtros.auditora = document.getElementById('filtro-auditora')?.value.trim() || '';
        this.estado.filtros.status = document.getElementById('filtro-status')?.value || '';
        this.estado.filtros.doc = document.getElementById('filtro-doc')?.value.trim() || '';
        this.estado.filtros.obs = document.getElementById('filtro-obs')?.value.trim() || '';

        this.estado.pagina = 0;
        
        const tbody = document.getElementById('lista-assertividade');
        if(tbody) tbody.style.opacity = '0.5';

        clearTimeout(this.timerBusca);
        this.timerBusca = setTimeout(() => {
            this.buscarDados();
        }, 600);
    },

    mudarPagina: function(delta) {
        const novaPagina = this.estado.pagina + delta;
        if (novaPagina >= 0) {
            this.estado.pagina = novaPagina;
            this.buscarDados(); 
        }
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        
        if(tbody) tbody.style.opacity = '1';
        if(infoPag) infoPag.innerHTML = `<span class="text-blue-500"><i class="fas fa-circle-notch fa-spin"></i> Filtrando...</span>`;

        try {
            // 1. QUERY PRINCIPAL
            // Usamos a View ou a Tabela direta (já que a estrutura agora é limpa)
            let query = Sistema.supabase
                .from('assertividade') // Agora consultamos direto a tabela otimizada
                .select('*', { count: 'exact' });

            // --- CORREÇÃO DE FILTROS (Nomes novos do Banco) ---
            
            // Busca Geral (Substitui o search_vector antigo)
            if (this.estado.termo) {
                const termo = `%${this.estado.termo}%`;
                // Busca no nome do assistente OU empresa
                query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo}`);
            }

            // Filtros Específicos
            if (this.estado.filtros.data) query = query.eq('data_referencia', this.estado.filtros.data);
            if (this.estado.filtros.empresa) query = query.ilike('empresa_nome', `%${this.estado.filtros.empresa}%`);
            
            // CORREÇÃO: nome_assistente -> assistente_nome
            if (this.estado.filtros.assistente) query = query.ilike('assistente_nome', `%${this.estado.filtros.assistente}%`);
            
            // CORREÇÃO: nome_auditora_raw -> auditora_nome
            if (this.estado.filtros.auditora) query = query.ilike('auditora_nome', `%${this.estado.filtros.auditora}%`);
            
            if (this.estado.filtros.status) query = query.ilike('status', this.estado.filtros.status); 
            
            // CORREÇÃO: nome_documento -> doc_name
            if (this.estado.filtros.doc) query = query.ilike('doc_name', `%${this.estado.filtros.doc}%`);
            
            if (this.estado.filtros.obs) query = query.ilike('observacao', `%${this.estado.filtros.obs}%`);

            // Paginação
            const inicio = this.estado.pagina * this.estado.limite;
            const fim = inicio + this.estado.limite - 1;
            
            query = query.order('data_referencia', { ascending: false })
                         .order('id', { ascending: false })
                         .range(inicio, fim);

            const { data: dados, error, count } = await query;

            if (error) throw new Error(`Erro no Banco: ${error.message}`);

            this.estado.total = count || 0;

            // Renderiza direto (não precisamos mais do passo secundário pois a tabela agora tem tudo)
            this.renderizarTabela(dados || []);
            this.atualizarControlesPaginacao();

        } catch (e) {
            console.error("Erro crítico na busca:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500 font-bold"><i class="fas fa-exclamation-circle mr-2"></i> Erro ao filtrar: ${e.message}</td></tr>`;
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
            if(infoPag) infoPag.innerHTML = "Nenhum registro encontrado.";
            if(btnAnt) btnAnt.disabled = true;
            if(btnProx) btnProx.disabled = true;
        } else {
            if(infoPag) infoPag.innerHTML = `Exibindo <b>${inicio}</b> a <b>${fim}</b> de <b>${total.toLocaleString('pt-BR')}</b>`;
            if(btnAnt) btnAnt.disabled = this.estado.pagina === 0;
            if(btnProx) btnProx.disabled = fim >= total;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Sua busca não retornou resultados.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            // --- MAPEAMENTO PARA RENDERIZAÇÃO (Nomes novos) ---
            const empresaSafe = Sistema.escapar(item.empresa_nome || '-');
            const assistenteSafe = Sistema.escapar(item.assistente_nome || '-'); // Corrigido
            const auditoraSafe = Sistema.escapar(item.auditora_nome || '-');     // Corrigido
            const docSafe = Sistema.escapar(item.doc_name || '-');               // Corrigido
            const obsSafe = Sistema.escapar(item.observacao || '-');
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const empIdDisplay = item.company_id ? `<span class="text-slate-400 font-mono text-[10px]">#${item.company_id}</span>` : '';

            // Status Badge
            const stRaw = Sistema.escapar(item.status || '-');     
            const stUp = stRaw.toUpperCase();     
            let badgeClass = "bg-slate-100 text-slate-500 border-slate-200"; 
            if (stUp === 'OK' || stUp === 'VALIDO') badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
            else if (stUp === 'NOK' || stUp.includes('NOK')) badgeClass = "bg-rose-100 text-rose-700 border-rose-200";
            else if (stUp.includes('REV')) badgeClass = "bg-amber-100 text-amber-700 border-amber-200";
            else if (stUp === 'PROCESSADO') badgeClass = "bg-indigo-50 text-indigo-600 border-indigo-100"; 
            else if (stUp.includes('PEND')) badgeClass = "bg-blue-50 text-blue-600 border-blue-100";

            const statusBadge = `<span class="${badgeClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap">${stRaw}</span>`;

            // Tratamento da porcentagem
            // Agora pegamos direto da coluna correta
            let valorParaExibir = item.porcentagem_assertividade; // Corrigido
            
            let assertDisplay = '-';
            let assertColor = 'text-slate-400 font-light'; 

            if (valorParaExibir !== null && valorParaExibir !== '' && valorParaExibir !== undefined) {
                const valorLimpo = String(valorParaExibir).replace('%', '').replace(',', '.');
                const assertVal = parseFloat(valorLimpo);
                
                assertDisplay = String(valorParaExibir).includes('%') ? valorParaExibir : valorParaExibir + '%';
                
                if (!isNaN(assertVal)) {
                    assertColor = 'text-slate-600';
                    if (assertVal >= 99) assertColor = 'text-emerald-600 font-bold';
                    else if (assertVal < 90 && assertVal >= 0) assertColor = 'text-rose-600 font-bold';
                }
            }

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-600 font-mono">${dataFmt}</td>
                <td class="px-3 py-2 text-center">${empIdDisplay}</td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${empresaSafe}">${empresaSafe}</td>
                <td class="px-3 py-2 text-slate-600 max-w-[120px] truncate font-medium" title="${assistenteSafe}">${assistenteSafe}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${docSafe}">${docSafe}</td>
                <td class="px-3 py-2 text-center">${statusBadge}</td>
                <td class="px-3 py-2 text-slate-400 max-w-[180px] truncate cursor-help border-l border-slate-100 pl-4 italic" title="${obsSafe}">${obsSafe}</td>
                <td class="px-3 py-2 text-center font-mono bg-slate-50/50 text-slate-500">${item.qtd_campos || '-'}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold bg-emerald-50/30">${item.qtd_ok || '-'}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold bg-rose-50/30">${item.qtd_nok || '-'}</td>
                <td class="px-3 py-2 text-center ${assertColor} text-sm bg-slate-50/50">${assertDisplay}</td>
                <td class="px-3 py-2 text-slate-500 text-[10px] uppercase">${auditoraSafe}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};