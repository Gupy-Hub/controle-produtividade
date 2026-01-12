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

    // --- INICIALIZAÇÃO ---
    carregar: async function() {
        this.estado.pagina = 0;
        // Não limpamos os filtros ao recarregar a aba para manter o contexto do usuário
        // Se quiser limpar sempre que entrar, descomente a linha abaixo:
        // this.limparCamposUI(); 
        this.buscarDados(); 
    },

    limparCamposUI: function() {
        const ids = ['search-assert', 'filtro-data', 'filtro-empresa', 'filtro-assistente', 'filtro-auditora', 'filtro-status', 'filtro-doc', 'filtro-obs'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        this.atualizarFiltrosEBuscar(); // Recarrega após limpar
    },

    // --- CONTROLE DE FILTROS (Debounce) ---
    atualizarFiltrosEBuscar: function() {
        // Coleta os valores atuais dos inputs
        this.estado.termo = document.getElementById('search-assert')?.value.trim() || '';
        this.estado.filtros.data = document.getElementById('filtro-data')?.value || '';
        this.estado.filtros.empresa = document.getElementById('filtro-empresa')?.value.trim() || '';
        this.estado.filtros.assistente = document.getElementById('filtro-assistente')?.value.trim() || '';
        this.estado.filtros.auditora = document.getElementById('filtro-auditora')?.value.trim() || '';
        this.estado.filtros.status = document.getElementById('filtro-status')?.value || '';
        this.estado.filtros.doc = document.getElementById('filtro-doc')?.value.trim() || '';
        this.estado.filtros.obs = document.getElementById('filtro-obs')?.value.trim() || '';

        // Reseta página para a primeira
        this.estado.pagina = 0;
        
        // Feedback visual imediato na tabela
        const tbody = document.getElementById('lista-assertividade');
        if(tbody) tbody.style.opacity = '0.5';

        // Debounce: Aguarda 600ms após parar de digitar para buscar (performance)
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

    // --- BUSCA INTELIGENTE ---
    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        const contador = document.getElementById('contador-assert');

        if(tbody) tbody.style.opacity = '1'; // Restaura opacidade
        if(infoPag) infoPag.innerHTML = `<span class="text-blue-500"><i class="fas fa-circle-notch fa-spin"></i> Filtrando...</span>`;

        try {
            let query = Sistema.supabase
                .from('vw_assertividade_completa')
                .select('*', { count: 'exact' });

            // 1. Busca Geral (No Search Vector turbinado pela View)
            if (this.estado.termo) {
                query = query.ilike('search_vector', `%${this.estado.termo}%`);
            }

            // 2. Filtros Específicos (Coluna por Coluna)
            if (this.estado.filtros.data) {
                query = query.eq('data_referencia', this.estado.filtros.data);
            }
            if (this.estado.filtros.empresa) {
                // Busca no nome da empresa (ilike ignora maiuscula/minuscula)
                query = query.ilike('empresa_nome', `%${this.estado.filtros.empresa}%`);
            }
            if (this.estado.filtros.assistente) {
                query = query.ilike('nome_assistente', `%${this.estado.filtros.assistente}%`);
            }
            if (this.estado.filtros.auditora) {
                query = query.ilike('nome_auditora_raw', `%${this.estado.filtros.auditora}%`);
            }
            if (this.estado.filtros.status) {
                // status pode ser 'OK', 'Ok', 'ok' - ilike resolve
                query = query.ilike('status', `%${this.estado.filtros.status}%`);
            }
            if (this.estado.filtros.doc) {
                query = query.ilike('nome_documento', `%${this.estado.filtros.doc}%`);
            }
            if (this.estado.filtros.obs) {
                query = query.ilike('observacao', `%${this.estado.filtros.obs}%`);
            }

            // 3. Paginação e Ordenação
            const inicio = this.estado.pagina * this.estado.limite;
            const fim = inicio + this.estado.limite - 1;
            
            query = query.order('data_referencia', { ascending: false })
                         .order('id', { ascending: false }) // Desempate por ID
                         .range(inicio, fim);

            const { data, error, count } = await query;

            if (error) throw error;

            this.estado.total = count || 0;
            this.renderizarTabela(data || []);
            this.atualizarControlesPaginacao();

        } catch (e) {
            console.error("Erro busca:", e);
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
            // Sanitização
            const empresaSafe = Sistema.escapar(item.empresa_nome || '-');
            const assistenteSafe = Sistema.escapar(item.nome_assistente || '-');
            const auditoraSafe = Sistema.escapar(item.nome_auditora_raw || '-');
            const docSafe = Sistema.escapar(item.nome_documento || '-');
            const obsSafe = Sistema.escapar(item.observacao || '-');
            
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const empIdDisplay = item.empresa_id ? `<span class="text-slate-400 font-mono text-[10px]">#${item.empresa_id}</span>` : '';

            // Status Badge
            const stRaw = Sistema.escapar(item.status || '-');     
            const stUp = stRaw.toUpperCase();     
            let badgeClass = "bg-slate-100 text-slate-500 border-slate-200"; 
            if (stUp === 'OK' || stUp === 'VALIDO') badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
            else if (stUp.includes('NOK')) badgeClass = "bg-rose-100 text-rose-700 border-rose-200";
            else if (stUp.includes('REV')) badgeClass = "bg-amber-100 text-amber-700 border-amber-200";
            else if (stUp.includes('PEND')) badgeClass = "bg-blue-50 text-blue-600 border-blue-100";

            const statusBadge = `<span class="${badgeClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap">${stRaw}</span>`;

            // Assertividade
            const assertVal = parseFloat(item.indice_assertividade || 0);
            let assertColor = 'text-slate-600';
            if (assertVal >= 99) assertColor = 'text-emerald-600 font-bold';
            else if (assertVal < 90 && assertVal > 0) assertColor = 'text-rose-600 font-bold';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-600 font-mono">${dataFmt}</td>
                <td class="px-3 py-2 text-center">${empIdDisplay}</td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${empresaSafe}">${empresaSafe}</td>
                <td class="px-3 py-2 text-slate-600 max-w-[120px] truncate font-medium" title="${assistenteSafe}">${assistenteSafe}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${docSafe}">${docSafe}</td>
                <td class="px-3 py-2 text-center">${statusBadge}</td>
                <td class="px-3 py-2 text-slate-400 max-w-[180px] truncate cursor-help border-l border-slate-100 pl-4 italic" title="${obsSafe}">${obsSafe}</td>
                <td class="px-3 py-2 text-center font-mono bg-slate-50/50 text-slate-500">${item.num_campos}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold bg-emerald-50/30">${item.qtd_ok}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold bg-rose-50/30">${item.qtd_nok}</td>
                <td class="px-3 py-2 text-center ${assertColor} text-sm bg-slate-50/50">${assertVal}%</td>
                <td class="px-3 py-2 text-slate-500 text-[10px] uppercase">${auditoraSafe}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};