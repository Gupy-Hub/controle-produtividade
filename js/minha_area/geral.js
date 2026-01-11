MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const tbody = document.getElementById('tabela-extrato');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</td></tr>';

        try {
            // 1. Busca Produção
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Meta do Mês (CORREÇÃO: coluna 'meta' em vez de 'valor')
            const mesAtual = new Date(inicio).getMonth() + 1;
            const anoAtual = new Date(inicio).getFullYear();
            
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta') 
                .eq('usuario_id', uid)
                .eq('mes', mesAtual)
                .eq('ano', anoAtual)
                .maybeSingle();

            // CORREÇÃO: Usa metaData.meta
            const metaDiariaPadrao = metaData ? Math.round(metaData.meta / 22) : 650;

            // 3. Processamento
            let totalProd = 0;
            let diasUteis = 0;
            let totalMeta = 0;
            let somaFator = 0;

            tbody.innerHTML = '';

            data.forEach(item => {
                const qtd = Number(item.quantidade || 0);
                const fator = Number(item.fator);
                const metaDia = Math.round(metaDiariaPadrao * fator);
                
                totalProd += qtd;
                somaFator += fator;
                totalMeta += metaDia;
                if (fator > 0) diasUteis++;

                const pct = metaDia > 0 ? (qtd / metaDia) * 100 : 0;
                let corPct = pct >= 100 ? 'text-emerald-600' : (pct >= 80 ? 'text-amber-600' : 'text-rose-600');
                
                const [ano, mes, dia] = item.data_referencia.split('-');

                const tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0 text-xs text-slate-600">
                        <td class="px-6 py-3 font-bold">${dia}/${mes}/${ano}</td>
                        <td class="px-6 py-3 text-center">${fator}</td>
                        <td class="px-6 py-3 text-center text-slate-400">-</td>
                        <td class="px-6 py-3 text-center text-slate-400">-</td>
                        <td class="px-6 py-3 text-center text-slate-400">-</td>
                        <td class="px-6 py-3 text-center font-black text-blue-700 bg-blue-50/30">${qtd}</td>
                        <td class="px-6 py-3 text-center">${metaDia}</td>
                        <td class="px-6 py-3 text-center font-bold ${corPct}">${Math.round(pct)}%</td>
                        <td class="px-6 py-3 truncate max-w-[200px]" title="${item.justificativa || ''}">${item.justificativa || '-'}</td>
                    </tr>
                `;
                tbody.innerHTML += tr;
            });

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            // 4. Atualiza KPIs
            const atingimentoGeral = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;
            const mediaDiaria = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;

            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', atingimentoGeral + '%');
            this.setTxt('kpi-dias', diasUteis);
            this.setTxt('kpi-media', mediaDiaria);

            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = `${Math.min(atingimentoGeral, 100)}%`;
                bar.className = atingimentoGeral >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
            }

            this.setTxt('footer-fator', somaFator.toFixed(1));
            this.setTxt('footer-prod', totalProd.toLocaleString('pt-BR'));
            this.setTxt('footer-meta', totalMeta.toLocaleString('pt-BR'));
            this.setTxt('footer-pct', atingimentoGeral + '%');

        } catch (err) {
            console.error("Erro ao carregar geral:", err);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro ao carregar dados. Verifique a conexão.</td></tr>';
        }
    },

    setTxt: function(id, val) { 
        const el = document.getElementById(id); 
        if(el) el.innerText = val; 
    }
};