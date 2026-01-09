Gestao.Assertividade = {
    listaCompleta: [],

    carregar: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12"><i class="fas fa-spinner fa-spin text-purple-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando dados recentes...</p></td></tr>';

        try {
            // OTIMIZAÇÃO: Define limite de data (últimos 60 dias) para não travar o banco
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 60);
            const dataIso = dataLimite.toISOString().split('T')[0];

            // Busca Otimizada
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .gte('data_referencia', dataIso) // Filtra apenas dados recentes
                .order('data_referencia', { ascending: false })
                .order('hora', { ascending: false })
                .limit(2000);

            if (error) throw error;

            this.listaCompleta = data || [];
            this.filtrar();

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-red-500"><i class="fas fa-exclamation-triangle text-2xl mb-2"></i><br>Erro ao carregar: ${e.message}<br><small class="text-slate-400">Tente recarregar a página.</small></td></tr>`;
        }
    },

    filtrar: function() {
        const inputBusca = document.getElementById('search-assert');
        const termo = inputBusca ? inputBusca.value.toLowerCase().trim() : '';

        const filtrados = this.listaCompleta.filter(item => {
            if (!termo) return true;
            
            // Monta string de busca
            const dataBr = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '';
            const nomeUser = item.usuarios?.nome || '';
            
            const searchStr = `
                ${dataBr} 
                ${item.hora || ''}
                ${item.empresa || ''}
                ${nomeUser}
                ${item.nome_documento || ''}
                ${item.status || ''}
                ${item.observacao || ''}
                ${item.auditora || ''}
            `.toLowerCase();

            return searchStr.includes(termo);
        });

        this.renderizarTabela(filtrados);
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhum registro recente encontrado.</span></div></td></tr>';
            if(contador) contador.innerText = '0';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia.split('-').reverse().slice(0,2).join('/');
            const horaFmt = item.hora ? item.hora.substring(0, 5) : '-';
            const nomeUser = item.usuarios?.nome || 'ID: ' + item.usuario_id;
            
            // Badge Status
            let statusBadge = `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">${item.status}</span>`;
            const stUpper = (item.status||'').toUpperCase();
            if (stUpper === 'OK') statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">OK</span>`;
            else if (stUpper.includes('NOK')) statusBadge = `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 font-bold">${item.status}</span>`;
            else if (stUpper.includes('JUST')) statusBadge = `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold">JUST</span>`;

            // Cor Assertividade
            const assertVal = parseFloat((item.assertividade || '0').replace('%','').replace(',','.'));
            let assertColor = 'text-slate-600';
            if (assertVal >= 100) assertColor = 'text-emerald-600 font-bold';
            else if (assertVal < 90) assertColor = 'text-rose-600 font-bold';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-500 font-mono">${dataFmt} <span class="text-[10px] text-slate-300 ml-1">${horaFmt}</span></td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${item.empresa}">${item.empresa || '-'}</td>
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
        if(contador) contador.innerText = `${lista.length}`;
    },

    salvarMeta: function() { }
};