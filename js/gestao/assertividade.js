Gestao.Assertividade = {
    timerBusca: null, 
    dadosCache: [], // Armazena os dados vindos do servidor para filtrar localmente

    // --- CARREGAMENTO INICIAL ---
    carregar: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const searchInput = document.getElementById('search-assert');
        
        // Limpa os inputs de filtro local ao recarregar
        this.limparFiltrosLocais();

        if (searchInput && searchInput.value.trim().length > 0) {
            this.filtrarGlobal();
            return;
        }

        if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12"><i class="fas fa-spinner fa-spin text-purple-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando dados...</p></td></tr>';

        try {
            // Busca inicial
            this.executarBuscaRPC('');
        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    // --- BUSCA GLOBAL (NO SERVIDOR) ---
    filtrarGlobal: function() {
        const termo = document.getElementById('search-assert').value.trim();
        clearTimeout(this.timerBusca);
        this.timerBusca = setTimeout(() => {
            this.executarBuscaRPC(termo);
        }, 600);
    },

    executarBuscaRPC: async function(termo) {
        const tbody = document.getElementById('lista-assertividade');
        const msg = termo ? "Pesquisando..." : "Carregando recentes...";
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">${msg}</p></td></tr>`;

        try {
            const termoBusca = termo || '';
            const { data, error } = await Sistema.supabase.rpc('buscar_auditorias', { termo: termoBusca });

            if (error) throw error;

            // Formata e salva no cache
            this.dadosCache = (data || []).map(item => ({
                ...item,
                usuarios: { nome: item.usuario_nome }
            }));

            // Popula os selects de Status e Auditora com o que veio do banco
            this.popularSelectsFiltro();

            // Renderiza tudo (pois ainda não tem filtro local aplicado)
            this.renderizarTabela(this.dadosCache, termo ? `Resultados do Servidor para: "${termo}"` : "Últimos registros");

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500">Erro na busca: ${e.message}</td></tr>`;
        }
    },

    // --- LÓGICA DE FILTROS LOCAIS (NA TELA) ---
    
    popularSelectsFiltro: function() {
        const selStatus = document.getElementById('filtro-status');
        const selAuditora = document.getElementById('filtro-auditora');
        
        if(!selStatus || !selAuditora) return;

        const statusSet = new Set();
        const auditoraSet = new Set();

        this.dadosCache.forEach(item => {
            if(item.status) statusSet.add(item.status); // Mantém o case original para exibição
            if(item.auditora) auditoraSet.add(item.auditora);
        });

        // Monta Select Status
        // Convertemos para array, normalizamos para remover duplicatas de case se houver, mas exibimos original
        let htmlStatus = '<option value="">Todos</option>';
        // Vamos usar o Set direto e ordenar
        Array.from(statusSet).sort().forEach(st => {
            htmlStatus += `<option value="${st}">${st}</option>`;
        });
        selStatus.innerHTML = htmlStatus;

        // Monta Select Auditora
        let htmlAud = '<option value="">Todas</option>';
        Array.from(auditoraSet).sort().forEach(au => {
            htmlAud += `<option value="${au}">${au}</option>`;
        });
        selAuditora.innerHTML = htmlAud;
    },

    limparFiltrosLocais: function() {
        const ids = ['filtro-data', 'filtro-empresa', 'filtro-assistente', 'filtro-doc', 'filtro-status', 'filtro-obs', 'filtro-auditora'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
    },

    aplicarFiltrosLocais: function() {
        // Pega valores
        const fData = document.getElementById('filtro-data')?.value; // YYYY-MM-DD
        const fEmpresa = document.getElementById('filtro-empresa')?.value.toLowerCase();
        const fAssistente = document.getElementById('filtro-assistente')?.value.toLowerCase();
        const fDoc = document.getElementById('filtro-doc')?.value.toLowerCase();
        const fStatus = document.getElementById('filtro-status')?.value; // Valor exato
        const fObs = document.getElementById('filtro-obs')?.value.toLowerCase();
        const fAuditora = document.getElementById('filtro-auditora')?.value; // Valor exato

        // Filtra o array em memória
        const filtrados = this.dadosCache.filter(item => {
            // Data (item.data_referencia vem YYYY-MM-DD do banco)
            if (fData && item.data_referencia !== fData) return false;

            // Empresa
            if (fEmpresa && !(item.empresa || '').toLowerCase().includes(fEmpresa)) return false;

            // Assistente
            const nomeUser = (item.usuarios?.nome || '').toLowerCase();
            if (fAssistente && !nomeUser.includes(fAssistente)) return false;

            // Doc
            if (fDoc && !(item.nome_documento || '').toLowerCase().includes(fDoc)) return false;

            // Status (Comparação exata ignorando case se precisar, mas select values são exatos)
            if (fStatus && (item.status || '').toLowerCase() !== fStatus.toLowerCase()) return false;

            // Obs
            if (fObs && !(item.observacao || '').toLowerCase().includes(fObs)) return false;

            // Auditora
            if (fAuditora && (item.auditora || '').toLowerCase() !== fAuditora.toLowerCase()) return false;

            return true;
        });

        this.renderizarTabela(filtrados, "Filtrado na tela");
    },

    renderizarTabela: function(lista, mensagemRodape = "") {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        
        if(contador) {
             contador.innerHTML = `<strong>${lista.length}</strong> <span class="text-xs font-normal text-slate-400 ml-2">(${mensagemRodape})</span>`;
        }

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-filter text-3xl opacity-20"></i><span>Nenhum registro encontrado com esses filtros.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const horaFmt = item.hora ? item.hora.substring(0, 5) : '';
            const nomeUser = item.usuarios?.nome || `ID: ${item.usuario_id}`;
            
            // Tratamento do ID da Empresa
            const empIdDisplay = item.empresa_id ? `#${item.empresa_id}` : '<span class="text-slate-200">-</span>';

            // --- TRATAMENTO DO STATUS (Cores da Planilha) ---
            const stRaw = item.status || '-';     
            const stUp = stRaw.toUpperCase();     
            
            let badgeClass = "bg-slate-100 text-slate-500 border-slate-200"; 

            if (stUp === 'OK' || stUp === 'VALIDO') badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200 font-bold";
            else if (stUp.includes('NOK') || stUp.includes('INV') || stUp.includes('REP')) badgeClass = "bg-rose-100 text-rose-700 border-rose-200 font-bold";
            else if (stUp.includes('REV')) badgeClass = "bg-amber-100 text-amber-700 border-amber-200 font-bold";
            else if (stUp.includes('JUST')) badgeClass = "bg-blue-100 text-blue-700 border-blue-200 font-bold";
            else if (stUp.includes('DUPL')) badgeClass = "bg-purple-100 text-purple-700 border-purple-200 font-bold";
            else if (stUp.includes('IA')) badgeClass = "bg-cyan-100 text-cyan-700 border-cyan-200 font-bold";
            else if (stUp.includes('EMPR')) badgeClass = "bg-indigo-100 text-indigo-700 border-indigo-200 font-bold";
            else if (stUp.includes('REC')) badgeClass = "bg-orange-100 text-orange-700 border-orange-200 font-bold";

            const statusBadge = `<span class="${badgeClass} px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wide whitespace-nowrap">${stRaw}</span>`;

            // --- Assertividade ---
            let assertVal = 0;
            if(item.assertividade) {
                assertVal = parseFloat(String(item.assertividade).replace('%','').replace(',','.'));
            }
            let assertColor = 'text-slate-600';
            if (assertVal >= 99) assertColor = 'text-emerald-600 font-bold';
            else if (assertVal > 0 && assertVal < 90) assertColor = 'text-rose-600 font-bold';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-500 font-mono">${dataFmt} <span class="text-[10px] text-slate-300 ml-1">${horaFmt}</span></td>
                
                <td class="px-3 py-2 text-center font-mono text-slate-400 font-bold bg-slate-50/50">
                    ${empIdDisplay}
                </td>
                
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${item.empresa}">
                    ${item.empresa || '-'}
                </td>
                
                <td class="px-3 py-2 text-slate-600 max-w-[150px] truncate" title="${nomeUser}">${nomeUser}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${item.nome_documento}">${item.nome_documento || '-'}</td>
                
                <td class="px-3 py-2 text-center">${statusBadge}</td>
                
                <td class="px-3 py-2 text-slate-500 max-w-[200px] truncate cursor-help" title="${item.observacao}">${item.observacao || '-'}</td>
                <td class="px-3 py-2 text-center text-slate-400">${item.num_campos || 0}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold">${item.qtd_ok || 0}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold">${item.nok || 0}</td>
                <td class="px-3 py-2 text-center ${assertColor}">${item.assertividade || '-'}</td>
                <td class="px-3 py-2 text-slate-500 italic text-[10px]">${item.auditora || '-'}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    },

    salvarMeta: function() { }
};