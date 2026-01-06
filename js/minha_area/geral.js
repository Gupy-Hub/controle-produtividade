MinhaArea.Geral = {
    carregar: async function() {
        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;

        try {
            // 1. Busca Produção do Mês
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia');

            if (error) throw error;

            // 2. Busca Metas Vigentes
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // Processa Dados
            let totalProd = 0;
            let totalMeta = 0;
            let diasTrab = 0;

            const listaDiaria = producao.map(p => {
                // Acha a meta válida para a data de referência
                const metaDia = metas.find(m => m.data_inicio <= p.data_referencia) || { valor_meta: 0 };
                const metaVal = metaDia.valor_meta;
                const fator = p.fator_multiplicador !== null ? p.fator_multiplicador : 1;
                
                const metaCalc = Math.round(metaVal * fator);
                const qtd = p.quantidade || 0;
                
                totalProd += qtd;
                totalMeta += metaCalc;
                diasTrab += (fator > 0 ? 1 : 0); // Conta dias que não foram abono total

                return {
                    data: p.data_referencia,
                    qtd: qtd,
                    meta: metaCalc,
                    pct: metaCalc > 0 ? (qtd / metaCalc) * 100 : 0
                };
            });

            // Atualiza UI
            this.atualizarKPIs(totalProd, totalMeta, diasTrab);
            this.renderizarTabela(listaDiaria);

        } catch (e) {
            console.error("Erro Geral:", e);
        }
    },

    atualizarKPIs: function(prod, meta, dias) {
        // KPI Total
        document.getElementById('ma-kpi-total').innerText = prod.toLocaleString('pt-BR');
        document.getElementById('ma-kpi-meta').innerText = meta.toLocaleString('pt-BR');
        
        // Porcentagem e Barra
        const pct = meta > 0 ? Math.round((prod / meta) * 100) : 0;
        document.getElementById('ma-kpi-pct').innerText = `${pct}%`;
        document.getElementById('ma-bar-total').style.width = `${Math.min(pct, 100)}%`;
        
        // Cor da Barra
        const bar = document.getElementById('ma-bar-total');
        if(pct >= 100) bar.className = "h-full bg-emerald-500 rounded-full";
        else if(pct >= 80) bar.className = "h-full bg-blue-500 rounded-full";
        else bar.className = "h-full bg-red-500 rounded-full";

        // KPI Média
        const media = dias > 0 ? Math.round(prod / dias) : 0;
        document.getElementById('ma-kpi-media').innerText = media;
        document.getElementById('ma-kpi-dias').innerText = dias;

        // KPI Status Badge
        const badge = document.getElementById('ma-kpi-badge');
        const txt = document.getElementById('ma-kpi-status-text');
        
        if (pct >= 100) {
            badge.innerText = "🚀";
            txt.innerText = "Excelente!";
        } else if (pct >= 90) {
            badge.innerText = "👍";
            txt.innerText = "Bom Trabalho";
        } else if (pct >= 80) {
            badge.innerText = "⚠️";
            txt.innerText = "Atenção";
        } else {
            badge.innerText = "📉";
            txt.innerText = "Abaixo da Meta";
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('ma-table-body');
        if(lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Sem dados neste mês.</td></tr>';
            return;
        }

        let html = '';
        // Ordena data descrescente
        lista.sort((a, b) => new Date(b.data) - new Date(a.data));

        lista.forEach(item => {
            const dataFmt = item.data.split('-').reverse().join('/');
            const pct = item.pct.toFixed(1);
            
            let status = '';
            if(item.pct >= 100) status = '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">Meta Batida</span>';
            else if(item.pct >= 80) status = '<span class="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold">Na Média</span>';
            else status = '<span class="px-2 py-1 bg-red-50 text-red-600 rounded text-xs font-bold">Baixo</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50">
                <td class="px-6 py-3 font-bold">${dataFmt}</td>
                <td class="px-6 py-3 text-center text-blue-700 font-bold">${item.qtd}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.meta}</td>
                <td class="px-6 py-3 text-center font-bold ${item.pct >= 100 ? 'text-emerald-600' : 'text-slate-600'}">${pct}%</td>
                <td class="px-6 py-3 text-center">${status}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};