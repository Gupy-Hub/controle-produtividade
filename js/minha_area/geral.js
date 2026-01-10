MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const tbody = document.getElementById('tabela-diario');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        try {
            // 1. Busca Produção do Usuário
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Média do Time (para KPI)
            // Otimização: Fazer em paralelo se necessário
            const { data: timeData } = await Sistema.supabase
                .from('producao')
                .select('quantidade')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            // PROCESSAMENTO
            let totalProd = 0;
            let diasTrabalhados = 0;
            let metaAcumulada = 0;
            const metaDiariaBase = 650;

            tbody.innerHTML = '';

            data.forEach(r => {
                const qtd = Number(r.quantidade) || 0;
                const fator = Number(r.fator) || 0;
                
                totalProd += qtd;
                metaAcumulada += (metaDiariaBase * fator);
                if (fator > 0) diasTrabalhados++;

                // Renderiza Linha Tabela
                const [ano, mes, dia] = r.data_referencia.split('-');
                const pctDia = (metaDiariaBase * fator) > 0 ? (qtd / (metaDiariaBase * fator)) * 100 : 0;
                
                let statusBadge = `<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-bold">N/A</span>`;
                if (fator > 0) {
                    if (pctDia >= 100) statusBadge = `<span class="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded font-bold">Meta Batida</span>`;
                    else if (pctDia >= 80) statusBadge = `<span class="bg-amber-100 text-amber-700 text-[10px] px-2 py-1 rounded font-bold">Atenção</span>`;
                    else statusBadge = `<span class="bg-rose-100 text-rose-700 text-[10px] px-2 py-1 rounded font-bold">Baixo</span>`;
                }

                const tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                        <td class="px-6 py-3 font-bold text-slate-600 text-xs">${dia}/${mes}/${ano}</td>
                        <td class="px-6 py-3 text-center font-black text-blue-600">${qtd}</td>
                        <td class="px-6 py-3 text-center text-xs text-slate-500">${fator}</td>
                        <td class="px-6 py-3 text-center text-xs text-slate-400">${Math.round(metaDiariaBase * fator)}</td>
                        <td class="px-6 py-3 text-center">${statusBadge}</td>
                        <td class="px-6 py-3 text-xs text-slate-400 italic truncate max-w-[150px]" title="${r.justificativa || ''}">${r.justificativa || '-'}</td>
                    </tr>
                `;
                tbody.innerHTML += tr;
            });

            if (data.length === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400 italic text-xs">Sem registros no período.</td></tr>';

            // ATUALIZA KPIS
            const pctTotal = metaAcumulada > 0 ? Math.round((totalProd / metaAcumulada) * 100) : 0;
            const mediaMinha = diasTrabalhados > 0 ? Math.round(totalProd / diasTrabalhados) : 0;
            
            // Média Time (Simplificada: Total Produção / Total Registros do Time)
            // Para maior precisão, deveria dividir por dias únicos x pessoas, mas isso serve para estimativa
            const mediaTime = timeData.length > 0 ? Math.round(timeData.reduce((acc, curr) => acc + curr.quantidade, 0) / timeData.length) : 0;

            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-total', metaAcumulada.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', pctTotal + '%');
            this.setTxt('kpi-dias', diasTrabalhados);
            this.setTxt('kpi-media-real', mediaMinha.toLocaleString('pt-BR'));
            this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));

            const bar = document.getElementById('bar-progress');
            if (bar) {
                bar.style.width = `${Math.min(pctTotal, 100)}%`;
                bar.className = pctTotal >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
            }

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-400 text-xs">Erro ao carregar dados.</td></tr>';
        }
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};