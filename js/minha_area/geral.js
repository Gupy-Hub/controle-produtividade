// ARQUIVO: js/minha_area/geral.js
MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        
        if (!uid) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p><p class="text-xs">Utilize o seletor para visualizar os dados da equipe.</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Buscando dados...</span></div></td></tr>';

        try {
            // 1. Busca Produção (INCLUINDO Assertividade)
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('id, quantidade, fifo, gradual_total, gradual_parcial, fator, data_referencia, justificativa, assertividade')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Meta
            const [anoStr, mesStr] = inicio.split('-');
            const mesAtual = parseInt(mesStr);
            const anoAtual = parseInt(anoStr);
            
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta, meta_assertividade') 
                .eq('usuario_id', uid)
                .eq('mes', mesAtual)
                .eq('ano', anoAtual)
                .maybeSingle();

            const metaProducaoPadrao = metaData ? (metaData.meta || 650) : 650;
            const metaAssertPadrao = metaData ? (metaData.meta_assertividade || 98.0) : 98.0;

            // 3. Processamento
            let totalProd = 0; let totalMeta = 0; let somaFator = 0; let diasUteis = 0;

            tbody.innerHTML = '';
            const fmtPct = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
            const fmtZero = (val) => val === 0 ? '<span class="text-slate-300">0</span>' : val;

            data.forEach(item => {
                const qtd = Number(item.quantidade || 0);
                const fifo = Number(item.fifo || 0);
                const gt = Number(item.gradual_total || 0);
                const gp = Number(item.gradual_parcial || 0);
                const fator = Number(item.fator);
                
                // Meta ajustada pelo fator (dias úteis)
                const metaDia = Math.round(metaProducaoPadrao * fator);
                
                totalProd += qtd; 
                somaFator += fator;
                totalMeta += metaDia;
                if (fator > 0) diasUteis++;

                // % Produção
                const pctProd = metaDia > 0 ? (qtd / metaDia) * 100 : 0;
                let corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');
                
                // % Assertividade
                let assertDisplay = '-';
                let corAssert = 'text-slate-400';
                
                if (item.assertividade !== null && item.assertividade !== undefined) {
                    // Remove símbolo % se existir e converte
                    const valClean = String(item.assertividade).replace('%', '').replace(',', '.');
                    const valAssert = parseFloat(valClean);
                    
                    if (!isNaN(valAssert)) {
                        assertDisplay = valAssert.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%';
                        if (valAssert >= metaAssertPadrao) {
                            corAssert = 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1';
                        } else {
                            corAssert = 'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                        }
                    }
                }

                // Formata Data
                const dateObj = new Date(item.data_referencia + 'T12:00:00');
                const dia = String(dateObj.getDate()).padStart(2, '0');
                const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
                const ano = dateObj.getFullYear();
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');
                
                // Renderização da Linha
                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600">
                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fator}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(fifo)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(gt)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fmtZero(gp)}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${qtd}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${fmtPct(pctProd)}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${metaAssertPadrao}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">
                            <span class="${corAssert}">${assertDisplay}</span>
                        </td>

                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate max-w-[200px]" title="${item.justificativa || ''}">
                            ${item.justificativa || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>`;
            });

            this.setTxt('total-registros-footer', data.length);
            
            // Cálculos de KPIs Totais
            const diasUteisCalculados = Math.ceil(somaFator);
            const atingimentoGeral = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
            const mediaDiaria = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;

            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMeta.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', fmtPct(atingimentoGeral));
            this.setStatus(atingimentoGeral);
            this.setTxt('kpi-dias', diasUteisCalculados);
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteisMes(inicio, fim));
            this.setTxt('kpi-media', mediaDiaria);
            this.setTxt('kpi-meta-dia', metaProducaoPadrao);

            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = `${Math.min(atingimentoGeral, 100)}%`;
                bar.className = atingimentoGeral >= 100 ? "h-full bg-emerald-500" : "h-full bg-blue-500";
            }

            if (data.length === 0) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    setStatus: function(pct) {
        const el = document.getElementById('kpi-status');
        if(!el) return;
        if (pct >= 100) { el.innerText = "Excelente"; el.className = "text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 uppercase"; }
        else if (pct >= 90) { el.innerText = "Bom"; el.className = "text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase"; }
        else if (pct >= 80) { el.innerText = "Atenção"; el.className = "text-xs font-black text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 uppercase"; }
        else { el.innerText = "Crítico"; el.className = "text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 uppercase"; }
    },

    calcularDiasUteisMes: function(inicio, fim) {
        let count = 0;
        const cur = new Date(inicio + 'T12:00:00');
        const end = new Date(fim + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    },

    zerarKPIs: function() {
        ['kpi-total','kpi-meta-acumulada','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        this.setStatus(0);
        const bar = document.getElementById('bar-progress'); if(bar) bar.style.width = '0%';
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};