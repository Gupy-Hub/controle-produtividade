Gestao.Assertividade = {
    timerBusca: null,
    
    // Estado da Paginação
    estado: {
        pagina: 0,
        limite: 50, // Itens por página
        total: 0,
        termo: '',
        status: '',
        auditora: '',
        data: ''
    },

    // --- CARREGAMENTO INICIAL ---
    carregar: async function() {
        // Reseta tudo ao entrar na tela
        this.estado.pagina = 0;
        this.limparCamposUI();
        this.buscarDados();
    },

    limparCamposUI: function() {
        if(document.getElementById('search-assert')) document.getElementById('search-assert').value = '';
        if(document.getElementById('filtro-status')) document.getElementById('filtro-status').value = '';
        if(document.getElementById('filtro-data')) document.getElementById('filtro-data').value = '';
        if(document.getElementById('filtro-auditora')) document.getElementById('filtro-auditora').value = '';
    },

    // --- GATILHO DE BUSCA (Debounce) ---
    resetarPaginaEBuscar: function() {
        this.estado.pagina = 0; // Volta para página 1 se mudou filtro
        clearTimeout(this.timerBusca);
        this.timerBusca = setTimeout(() => {
            this.buscarDados();
        }, 600);
    },

    mudarPagina: function(delta) {
        const novaPagina = this.estado.pagina + delta;
        const maxPaginas = Math.ceil(this.estado.total / this.estado.limite);

        if (novaPagina >= 0 && (this.estado.total === 0 || novaPagina < maxPaginas)) {
            this.estado.pagina = novaPagina;
            this.buscarDados();
        }
    },

    // --- BUSCA NO SERVIDOR ---
    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const infoPag = document.getElementById('info-paginacao');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');

        // Atualiza estado com valores dos inputs
        this.estado.termo = document.getElementById('search-assert')?.value.trim() || '';
        this.estado.status = document.getElementById('filtro-status')?.value || '';
        this.estado.data = document.getElementById('filtro-data')?.value || '';
        this.estado.auditora = document.getElementById('filtro-auditora')?.value.trim() || '';

        // Feedback de Carregamento
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Buscando na base de dados...</p></td></tr>`;
        if(btnAnt) btnAnt.disabled = true;
        if(btnProx) btnProx.disabled = true;

        try {
            // CHAMA A NOVA FUNÇÃO SQL V2
            const { data, error } = await Sistema.supabase.rpc('buscar_auditorias_v2', {
                p_termo: this.estado.termo,
                p_status: this.estado.status,
                p_auditora: this.estado.auditora ? `%${this.estado.auditora}%` : '', // Adiciona % para busca parcial
                p_data: this.estado.data,
                p_page: this.estado.pagina,
                p_limit: this.estado.limite
            });

            if (error) throw error;

            const lista = data || [];
            
            // Atualiza Total (Vem na coluna total_registros da primeira linha, ou 0 se vazio)
            this.estado.total = lista.length > 0 ? lista[0].total_registros : 0;

            this.renderizarTabela(lista);
            this.atualizarControlesPaginacao();

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarControlesPaginacao: function() {
        const infoPag = document.getElementById('info-paginacao');
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');

        const total = this.estado.total;
        const inicio = (this.estado.pagina * this.estado.limite) + 1;
        let fim = (this.estado.pagina + 1) * this.estado.limite;
        if (fim > total) fim = total;

        if (total === 0) {
            infoPag.innerHTML = "Nenhum resultado encontrado.";
            btnAnt.disabled = true;
            btnProx.disabled = true;
        } else {
            infoPag.innerHTML = `Exibindo <b>${inicio}</b> a <b>${fim}</b> de <b>${total}</b> registros`;
            btnAnt.disabled = this.estado.pagina === 0;
            btnProx.disabled = fim >= total;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-filter text-3xl opacity-20"></i><span>Nenhum registro encontrado.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const horaFmt = item.hora ? item.hora.substring(0, 5) : '';
            const nomeUser = item.u_nome || `ID: ${item.usuario_id}`; // u_nome vem da V2
            const empIdDisplay = item.e_id ? `#${item.e_id}` : '<span class="text-slate-200">-</span>';

            // Status Badge
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

            // Assertividade
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
                <td class="px-3 py-2 text-center font-mono text-slate-400 font-bold bg-slate-50/50">${empIdDisplay}</td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${item.empresa}">${item.empresa || '-'}</td>
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