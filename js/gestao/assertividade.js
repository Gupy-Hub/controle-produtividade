Gestao.Assertividade = {
    timerBusca: null, 

    // --- CARREGAMENTO INICIAL ---
    carregar: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const searchInput = document.getElementById('search-assert');
        
        if (searchInput && searchInput.value.trim().length > 0) {
            this.filtrar();
            return;
        }

        if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12"><i class="fas fa-spinner fa-spin text-purple-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando dados...</p></td></tr>';

        try {
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 30);
            const dataIso = dataLimite.toISOString().split('T')[0];

            // Busca inicial usando RPC para garantir que traga o ID da empresa corretamente
            this.executarBuscaRPC('');

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    // --- BUSCA ---
    filtrar: function() {
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

            const dadosFormatados = (data || []).map(item => ({
                ...item,
                usuarios: { nome: item.usuario_nome }
            }));

            this.renderizarTabela(dadosFormatados, termo ? `Resultados para: "${termo}"` : "Últimos registros");

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-red-500">Erro na busca: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(lista, mensagemRodape = "") {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        
        if(contador) {
             contador.innerHTML = `<strong>${lista.length}</strong> <span class="text-xs font-normal text-slate-400 ml-2">(${mensagemRodape})</span>`;
        }

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhum registro encontrado.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const horaFmt = item.hora ? item.hora.substring(0, 5) : '';
            const nomeUser = item.usuarios?.nome || `ID: ${item.usuario_id}`;
            
            // Tratamento do ID da Empresa
            // Se o ID vier null do banco, mostramos um traço
            const empIdDisplay = item.empresa_id ? `#${item.empresa_id}` : '<span class="text-slate-200">-</span>';

            // Badge Status
            let statusBadge = `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">${item.status || '-'}</span>`;
            const stUpper = (item.status||'').toUpperCase();
            if (stUpper === 'OK' || stUpper === 'VALIDO') statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">OK</span>`;
            else if (stUpper.includes('NOK') || stUpper.includes('INV')) statusBadge = `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 font-bold">${item.status}</span>`;
            else if (stUpper.includes('JUST')) statusBadge = `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold">JUST</span>`;

            // Cor Assertividade
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
                <td class="px-3 py-2 text-center text-[10px]">${statusBadge}</td>
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