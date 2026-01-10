MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        
        // Se não tiver usuário alvo (caso do admin que acabou de entrar), mostra aviso
        if (!uid) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p><p class="text-xs">Utilize o seletor para visualizar os dados da equipe.</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Buscando dados...</span></div></td></tr>';

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

            // 2. Busca Meta
            const mesAtual = new Date(inicio).getMonth() + 1;
            const anoAtual = new Date(inicio).getFullYear();
            
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta') 
                .eq('usuario_id', uid)
                .eq('mes', mesAtual)
                .eq('ano', anoAtual)
                .maybeSingle();

            const metaDiariaPadrao = metaData ? Math.round(metaData.meta / 22) : 650;

            let totalProd = 0;
            let totalFifo = 0;
            let totalGT = 0;
            let totalGP = 0;
            let diasUteis = 0;
            let totalMeta = 0;
            let somaFator = 0;

            tbody.innerHTML = '';

            data.forEach(item => {
                const qtd = Number(item.quantidade || 0);
                const fifo = Number(item.fifo || 0);
                const gt = Number(item.gradual_total || 0);
                const gp = Number(item.gradual_parcial || 0);
                const fator = Number(item.fator);
                const metaDia = Math.round(metaDiariaPadrao * fator);
                
                totalProd += qtd;
                totalFifo += fifo;
                totalGT += gt;
                totalGP += gp;
                somaFator += fator;
                totalMeta += metaDia;
                if (fator > 0) diasUteis++;

                const pct = metaDia > 0 ? (qtd / metaDia) * 100 : 0;
                let corPct = pct >= 100 ? 'text-emerald-600' : (pct >= 80 ? 'text-amber-600' : 'text-rose-600');
                
                const dateObj = new Date(item.data_referencia + 'T12:00:00');
                const dia = String(dateObj.getDate()).padStart(2, '0');
                const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
                const ano = dateObj.getFullYear();
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');
                
                // Helper para zeros ficarem discretos
                const fmtZero = (val) => val === 0 ? '<span class="text-slate-300">0</span>' : val;

                const tr = `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600">
                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>
                            ${dia}/${mes}/${ano}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fator}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(fifo)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(gt)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(gp)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${qtd}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-bold ${corPct}">${Math.round(pct)}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 truncate max-w-[200px]" title="${item.justificativa || ''}">
                            ${item.justificativa || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>
                `;
                tbody.innerHTML += tr;
            });

            this.setTxt('total-registros-footer', data.length);
            this.setTxt('footer-fator', somaFator.toFixed(1));
            this.setTxt('footer-fifo', totalFifo.toLocaleString('pt-BR'));
            this.setTxt('footer-gt', totalGT.toLocaleString('pt-BR'));
            this.setTxt('footer-gp', totalGP.toLocaleString('pt-BR'));
            this.setTxt('footer-prod', totalProd.toLocaleString('pt-BR'));
            this.setTxt('footer-meta', totalMeta.toLocaleString('pt-BR'));
            
            const atingimentoGeral = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;
            this.setTxt('footer-pct', atingimentoGeral + '%');

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            // KPIs
            const mediaDiaria = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;

            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', atingimentoGeral + '%');
            this.setTxt('kpi-dias', diasUteis);
            this.setTxt('kpi-media', mediaDiaria);
            this.setTxt('kpi-meta-acumulada', totalMeta.toLocaleString('pt-BR'));

            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = `${Math.min(atingimentoGeral, 100)}%`;
                bar.className = atingimentoGeral >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
            }

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    zerarKPIs: function() {
        this.setTxt('kpi-total', '--');
        this.setTxt('kpi-pct', '--%');
        this.setTxt('kpi-dias', '--');
        this.setTxt('kpi-media', '--');
        this.setTxt('kpi-meta-acumulada', '--');
        const bar = document.getElementById('bar-progress');
        if(bar) bar.style.width = '0%';
    },

    setTxt: function(id, val) { 
        const el = document.getElementById(id); 
        if(el) el.innerText = val; 
    }
};