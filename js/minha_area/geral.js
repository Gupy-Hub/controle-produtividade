MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        
        // Validação de Usuário Selecionado
        if (!uid) {
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Buscando justificativas...</span></div></td></tr>';

        try {
            // 1. Buscas Otimizadas (Limite aumentado para garantir todo o mês)
            const [prodRes, assertRes, metaRes] = await Promise.all([
                // Produção (Trazendo colunas de justificativa)
                Sistema.supabase
                    .from('producao')
                    .select('*') 
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim)
                    .limit(2000), 
                
                // Assertividade (Apenas registros com nota)
                Sistema.supabase
                    .from('assertividade')
                    .select('data_auditoria, porcentagem') 
                    .eq('usuario_id', uid)
                    .gte('data_auditoria', inicio)
                    .lte('data_auditoria', fim)
                    .not('porcentagem', 'is', null)
                    .neq('porcentagem', '')
                    .limit(5000), 
                
                // Metas
                Sistema.supabase
                    .from('metas')
                    .select('meta, meta_assertividade')
                    .eq('usuario_id', uid)
                    .eq('mes', parseInt(inicio.split('-')[1])) 
                    .eq('ano', parseInt(inicio.split('-')[0])) 
                    .maybeSingle()
            ]);

            if (prodRes.error) throw prodRes.error;
            if (assertRes.error) throw assertRes.error;
            
            // 2. Define Metas Padrão
            const metaProducaoPadrao = metaRes.data?.meta || 650;
            const metaAssertPadrao = metaRes.data?.meta_assertividade || 98.0;

            // 3. Unificação e Tratamento dos Dados
            const mapaDados = new Map();

            // Helper para garantir chave única de data (YYYY-MM-DD)
            const getDia = (dataFull) => {
                if(!dataFull) return null;
                const dataStr = dataFull.split('T')[0];
                if (!mapaDados.has(dataStr)) {
                    mapaDados.set(dataStr, {
                        data: dataStr,
                        prod: { qtd: 0, fifo: 0, gt: 0, gp: 0, fator: 1, justificativa: '' },
                        assert: { somaNotas: 0, qtdAuditorias: 0 } 
                    });
                }
                return mapaDados.get(dataStr);
            };

            // Processa Produção (Foco na Justificativa do Abono)
            (prodRes.data || []).forEach(p => {
                const dia = getDia(p.data_referencia);
                if(dia) {
                    // Soma produtividade de múltiplos registros no mesmo dia
                    dia.prod.qtd += Number(p.quantidade || 0);
                    dia.prod.fifo += Number(p.fifo || 0);
                    dia.prod.gt += Number(p.gradual_total || 0);
                    dia.prod.gp += Number(p.gradual_parcial || 0);
                    
                    // LÓGICA DE ABONO: 
                    // Se encontrar um registro com fator diferente de 1 (abono), ele prevalece.
                    const fator = Number(p.fator);
                    if (!isNaN(fator) && fator !== 1) {
                        dia.prod.fator = fator;
                    }

                    // LÓGICA DA JUSTIFICATIVA:
                    // Verifica 'justificativa' (singular) ou 'justificativas' (plural/alias)
                    const justifItem = (p.justificativa || p.justificativas || '').trim();
                    
                    if (justifItem !== '') {
                        // Se já temos uma justificativa e a nova for de um abono (fator != 1), a do abono ganha.
                        // Se não temos justificativa ainda, pegamos a primeira que aparecer.
                        const ehAbono = (!isNaN(fator) && fator !== 1);
                        if (dia.prod.justificativa === '' || ehAbono) {
                            dia.prod.justificativa = justifItem;
                        }
                    }
                }
            });

            // Processa Assertividade
            (assertRes.data || []).forEach(a => {
                const dia = getDia(a.data_auditoria);
                if(dia) {
                    const valRaw = a.porcentagem;
                    if (valRaw !== null && valRaw !== undefined && String(valRaw).trim() !== '') {
                        const nota = this.parseValorPorcentagem(valRaw);
                        dia.assert.somaNotas += nota;
                        dia.assert.qtdAuditorias++;
                    }
                }
            });

            // Ordena Cronologicamente (Mais recente primeiro)
            const lista = Array.from(mapaDados.values()).sort((a, b) => b.data.localeCompare(a.data));

            // 4. Renderização do Grid
            if(tbody) tbody.innerHTML = '';
            
            let totalProd = 0, totalMeta = 0, somaFator = 0, diasComProducao = 0;
            let somaNotasGlobal = 0, qtdAuditoriasGlobal = 0;

            const fmtPct = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
            const fmtNum = (val) => val.toLocaleString('pt-BR');

            lista.forEach(item => {
                // --- Produção ---
                const fator = item.prod.fator;
                const metaDia = Math.round(metaProducaoPadrao * fator);
                const pctProd = metaDia > 0 ? (item.prod.qtd / metaDia) * 100 : 0;
                
                let corProd = 'text-slate-400';
                if (metaDia > 0) {
                    corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');
                }

                // --- Assertividade ---
                let pctAssert = 0;
                let displayAssert = '-';
                let corAssert = 'text-slate-300';
                let tooltipAssert = 'Nenhuma auditoria válida';

                if (item.assert.qtdAuditorias > 0) {
                    pctAssert = item.assert.somaNotas / item.assert.qtdAuditorias;
                    displayAssert = pctAssert.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%';
                    tooltipAssert = `Média: ${displayAssert} (${item.assert.qtdAuditorias} auditorias)`;
                    
                    if (pctAssert >= metaAssertPadrao) {
                        corAssert = 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1';
                    } else {
                        corAssert = 'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                    }
                    
                    somaNotasGlobal += item.assert.somaNotas;
                    qtdAuditoriasGlobal += item.assert.qtdAuditorias;
                }

                // KPIs Globais
                totalProd += item.prod.qtd;
                totalMeta += metaDia;
                somaFator += fator;
                if (fator > 0) diasComProducao++;

                // --- TRATAMENTO VISUAL DA OBSERVAÇÃO/JUSTIFICATIVA ---
                const temJustificativa = item.prod.justificativa && item.prod.justificativa.length > 0;
                const textoJustificativa = item.prod.justificativa || '-';
                
                // Se tiver justificativa (comum em abonos), destaca com fundo âmbar
                const classJustificativa = temJustificativa 
                    ? "text-slate-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block truncate w-full" 
                    : "text-slate-200 text-center block";

                const tooltipJustificativa = temJustificativa ? item.prod.justificativa : "";

                // Data
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
                        <td class="px-2 py-2 border-r border-slate-100 text-center" title="${tooltipAssert}">
                            <span class="${corAssert}">${displayAssert}</span>
                        </td>

                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 max-w-[200px]" title="${tooltipJustificativa}">
                            <span class="${classJustificativa}">${textoJustificativa}</span>
                        </td>
                    </tr>`;
            });

            if (lista.length === 0) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';

            // 5. Atualiza Cards de KPI (Topo da Tela)
            const atingimentoGeral = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
            const mediaDiaria = diasComProducao > 0 ? Math.round(totalProd / diasComProducao) : 0;

            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMeta.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', fmtPct(atingimentoGeral));
            this.setStatus(atingimentoGeral);
            this.setTxt('kpi-dias', Math.ceil(somaFator));
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteisMes(inicio, fim));
            this.setTxt('kpi-media', mediaDiaria);
            this.setTxt('kpi-meta-dia', metaProducaoPadrao);

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

    parseValorPorcentagem: function(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        let str = String(val).replace('%', '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
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