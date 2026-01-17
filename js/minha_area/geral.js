MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        
        if (!uid) {
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Consolidando dados...</span></div></td></tr>';

        try {
            // 1. Buscas em Paralelo (Performance)
            const [prodRes, assertRes, metaRes] = await Promise.all([
                // Produção
                Sistema.supabase
                    .from('producao')
                    .select('*')
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim),
                
                // Assertividade (Auditorias)
                Sistema.supabase
                    .from('assertividade')
                    .select('data_auditoria, ok, num_campos, porcentagem')
                    .eq('usuario_id', uid)
                    .gte('data_auditoria', inicio)
                    .lte('data_auditoria', fim),

                // Metas do Mês
                Sistema.supabase
                    .from('metas')
                    .select('meta, meta_assertividade')
                    .eq('usuario_id', uid)
                    .eq('mes', parseInt(inicio.split('-')[1])) // Pega mês da data inicial
                    .eq('ano', parseInt(inicio.split('-')[0])) // Pega ano da data inicial
                    .maybeSingle()
            ]);

            if (prodRes.error) throw prodRes.error;
            
            // 2. Define Metas Padrão se não encontrar
            const metaProducaoPadrao = metaRes.data?.meta || 650;
            const metaAssertPadrao = metaRes.data?.meta_assertividade || 98.0;

            // 3. Unificação dos Dados (Merge por Data)
            const mapaDados = new Map();

            // Helper para inicializar o dia no mapa
            const getDia = (dataStr) => {
                if (!mapaDados.has(dataStr)) {
                    mapaDados.set(dataStr, {
                        data: dataStr,
                        prod: { qtd: 0, fifo: 0, gt: 0, gp: 0, fator: 0, justificativa: '' },
                        assert: { ok: 0, campos: 0, count: 0 }
                    });
                }
                return mapaDados.get(dataStr);
            };

            // Processa Produção
            (prodRes.data || []).forEach(p => {
                const dia = getDia(p.data_referencia);
                dia.prod.qtd = Number(p.quantidade || 0);
                dia.prod.fifo = Number(p.fifo || 0);
                dia.prod.gt = Number(p.gradual_total || 0);
                dia.prod.gp = Number(p.gradual_parcial || 0);
                dia.prod.fator = Number(p.fator); // Pode ser null/undefined se não tiver
                dia.prod.justificativa = p.justificativa;
            });

            // Processa Assertividade
            (assertRes.data || []).forEach(a => {
                const dia = getDia(a.data_auditoria);
                dia.assert.ok += Number(a.ok || 0);
                dia.assert.campos += Number(a.num_campos || 0);
                dia.assert.count++;
            });

            // Converte Map para Array e Ordena (Data Decrescente)
            const lista = Array.from(mapaDados.values()).sort((a, b) => b.data.localeCompare(a.data));

            // 4. Renderização
            if(tbody) tbody.innerHTML = '';
            
            // Acumuladores para KPI Total
            let totalProd = 0, totalMeta = 0, somaFator = 0, diasComProducao = 0;
            let totalAssertOk = 0, totalAssertCampos = 0;

            const fmtPct = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
            const fmtNum = (val) => val.toLocaleString('pt-BR');

            lista.forEach(item => {
                // Cálculos Produção
                const fator = isNaN(item.prod.fator) ? 0 : item.prod.fator; // Se não tem prod, fator é 0
                const metaDia = Math.round(metaProducaoPadrao * fator);
                const pctProd = metaDia > 0 ? (item.prod.qtd / metaDia) * 100 : 0;
                
                // Cores Produção
                let corProd = 'text-slate-400';
                if (metaDia > 0) {
                    corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');
                }

                // Cálculos Assertividade Dia
                let pctAssert = 0;
                let displayAssert = '-';
                let corAssert = 'text-slate-300';

                if (item.assert.campos > 0) {
                    pctAssert = (item.assert.ok / item.assert.campos) * 100;
                    displayAssert = pctAssert.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%';
                    
                    if (pctAssert >= metaAssertPadrao) {
                        corAssert = 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1';
                    } else {
                        corAssert = 'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                    }

                    // Acumula para KPI Geral
                    totalAssertOk += item.assert.ok;
                    totalAssertCampos += item.assert.campos;
                }

                // Acumula KPIs Produção
                totalProd += item.prod.qtd;
                totalMeta += metaDia;
                somaFator += fator;
                if (fator > 0) diasComProducao++;

                // Formatação Data
                const dateObj = new Date(item.data + 'T12:00:00');
                const diaStr = String(dateObj.getDate()).padStart(2, '0');
                const mesStr = String(dateObj.getMonth() + 1).padStart(2, '0');
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');

                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600">
                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${diaStr}/${mesStr}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${fator}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.prod.fifo}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.prod.gt}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.prod.gp}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${fmtNum(item.prod.qtd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400">${metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${fmtPct(pctProd)}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${metaAssertPadrao}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">
                            <span class="${corAssert}">${displayAssert}</span>
                        </td>

                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate max-w-[150px]" title="${item.prod.justificativa || ''}">
                            ${item.prod.justificativa || '<span class="text-slate-200">-</span>'}
                        </td>
                    </tr>`;
            });

            if (lista.length === 0) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';

            // 5. Atualiza KPIs do Topo
            const atingimentoGeral = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
            const mediaDiaria = diasComProducao > 0 ? Math.round(totalProd / diasComProducao) : 0;
            // Se houver auditoria, calcula média ponderada geral
            // OBS: Pode-se usar média simples das % diárias ou (Total OK / Total Campos). (Total OK / Total Campos) é mais preciso matematicamente.
            // Porem, se quiser compatibilidade com média de notas, usar a outra lógica. Vou usar a ponderada (OK/Campos) pois temos os números brutos.
            
            // Vamos atualizar apenas os cards existentes no HTML do Minha Area
            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMeta.toLocaleString('pt-BR'));
            
            this.setTxt('kpi-pct', fmtPct(atingimentoGeral));
            this.setStatus(atingimentoGeral);

            this.setTxt('kpi-dias', Math.ceil(somaFator)); // Dias Produtivos (Soma dos fatores)
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteisMes(inicio, fim)); // Dias Úteis Calendário
            
            this.setTxt('kpi-media', mediaDiaria);
            this.setTxt('kpi-meta-dia', metaProducaoPadrao);

            // Atualiza barra de progresso
            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = `${Math.min(atingimentoGeral, 100)}%`;
                bar.className = atingimentoGeral >= 100 ? "h-full bg-emerald-500" : "h-full bg-blue-500";
            }

        } catch (err) {
            console.error(err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
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