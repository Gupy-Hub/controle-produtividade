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
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Processando calendário...</span></div></td></tr>';

        try {
            // Converter datas para objetos Date para iteração
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // 1. Buscas Otimizadas
            const [prodRes, assertRes, metasRes] = await Promise.all([
                // Produção
                Sistema.supabase
                    .from('producao')
                    .select('*') 
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim)
                    .limit(5000), // Aumentado para suportar ano
                
                // Assertividade (Numérico)
                Sistema.supabase
                    .from('assertividade')
                    .select('data_auditoria, porcentagem') 
                    .eq('usuario_id', uid)
                    .gte('data_auditoria', inicio)
                    .lte('data_auditoria', fim)
                    .not('porcentagem', 'is', null)
                    .neq('porcentagem', '')
                    .limit(5000), 
                
                // Metas (Busca RANGE de anos para cobrir o período)
                Sistema.supabase
                    .from('metas')
                    .select('mes, ano, meta, meta_assertividade')
                    .eq('usuario_id', uid)
                    .gte('ano', anoInicio)
                    .lte('ano', anoFim)
            ]);

            if (prodRes.error) throw prodRes.error;
            if (assertRes.error) throw assertRes.error;
            if (metasRes.error) throw metasRes.error;

            // 2. Mapa de Metas para acesso rápido (Ano -> Mês -> Valor)
            const mapMetas = {};
            metasRes.data.forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                mapMetas[m.ano][m.mes] = { 
                    prod: Number(m.meta), 
                    assert: Number(m.meta_assertividade) 
                };
            });

            // 3. Mapa de Produção para acesso rápido
            const mapProd = new Map();
            prodRes.data.forEach(p => mapProd.set(p.data_referencia, p));

            // 4. Mapa de Assertividade
            const mapAssert = new Map();
            assertRes.data.forEach(a => {
                // Agrupa por data se houver múltiplas
                const key = a.data_auditoria;
                if(!mapAssert.has(key)) mapAssert.set(key, { soma: 0, qtd: 0 });
                
                const valRaw = a.porcentagem;
                if (valRaw !== null && valRaw !== undefined && String(valRaw).trim() !== '') {
                    mapAssert.get(key).soma += this.parseValorPorcentagem(valRaw);
                    mapAssert.get(key).qtd++;
                }
            });

            // 5. CÁLCULO CALENDÁRIO (Dia a Dia)
            const listaGrid = [];
            
            // Acumuladores Globais
            let totalProdReal = 0;
            let totalMetaEsperada = 0;
            let somaFatorProdutivo = 0; // Para média de velocidade
            let diasComProducaoReal = 0;
            
            let totalAssertSoma = 0;
            let totalAssertQtd = 0;
            
            // Itera do inicio ao fim
            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                // Pula finais de semana (0=Dom, 6=Sab)
                if (d.getDay() === 0 || d.getDay() === 6) continue;

                const dataStr = d.toISOString().split('T')[0];
                const anoAtual = d.getFullYear();
                const mesAtual = d.getMonth() + 1; // JS é 0-11, DB é 1-12

                // Busca Meta do Mês (ou padrão 650)
                const metaConfig = mapMetas[anoAtual]?.[mesAtual] || { prod: 650, assert: 98.0 };
                
                // Verifica se tem Produção Real
                const prodDoDia = mapProd.get(dataStr);
                
                let fator = 1.0; // Padrão se não tiver dados (Dia Útil normal)
                let qtdReal = 0;
                let justif = '';
                let temRegistro = false;

                if (prodDoDia) {
                    temRegistro = true;
                    fator = Number(prodDoDia.fator); // Respeita abono (0.5, 0, etc)
                    if (isNaN(fator)) fator = 1.0;
                    
                    qtdReal = Number(prodDoDia.quantidade || 0);
                    
                    // Lógica de Justificativa
                    justif = (prodDoDia.justificativa_abono || '').trim();
                    if (!justif) justif = (prodDoDia.justificativa || '').trim();
                    if (!justif) justif = (prodDoDia.justificativas || '').trim();

                    // Acumula Produção Real
                    totalProdReal += qtdReal;
                    somaFatorProdutivo += fator; // Soma exata (ex: 0.5 + 0.5 = 1.0)
                    if (fator > 0) diasComProducaoReal++;
                } else {
                    // Sem registro: Assume dia útil cheio para Meta Esperada, mas 0 produção
                    // NÃO soma no 'somaFatorProdutivo' pois isso diluiria a velocidade média falsamente
                    // A Meta Esperada cresce, mas a produção não.
                }

                // Acumula Meta Esperada (Baseada no fator do dia - seja real ou projetado 1.0)
                // Se o dia foi abonado (fator 0), a meta esperada soma 0. Correto.
                // Se não tem registro (futuro ou esquecido), assumimos fator 1, logo soma meta cheia. Correto.
                const metaDiaCalculada = Math.round(metaConfig.prod * fator);
                totalMetaEsperada += metaDiaCalculada;

                // Processa Assertividade do Dia
                const assertDoDia = mapAssert.get(dataStr);
                let assertDiaDisplay = { val: 0, text: '-', class: 'text-slate-300' };
                
                if (assertDoDia && assertDoDia.qtd > 0) {
                    const mediaDia = assertDoDia.soma / assertDoDia.qtd;
                    totalAssertSoma += assertDoDia.soma;
                    totalAssertQtd += assertDoDia.qtd;
                    
                    assertDiaDisplay.val = mediaDia;
                    assertDiaDisplay.text = this.fmtPct(mediaDia);
                    assertDiaDisplay.class = mediaDia >= metaConfig.assert ? 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1' : 'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                }

                // Adiciona ao Grid SOMENTE se tiver registro (para não poluir com dias futuros vazios)
                // OU se quiser mostrar calendário completo, remova o 'if'.
                // O padrão "Minha Área" costuma mostrar o que foi trabalhado.
                if (temRegistro) {
                    listaGrid.push({
                        data: dataStr,
                        fator: fator,
                        qtd: qtdReal,
                        metaDia: metaDiaCalculada,
                        metaConfigAssert: metaConfig.assert,
                        assertDisplay: assertDiaDisplay,
                        justificativa: justif,
                        fifo: Number(prodDoDia.fifo || 0),
                        gt: Number(prodDoDia.gradual_total || 0),
                        gp: Number(prodDoDia.gradual_parcial || 0)
                    });
                }
            }

            // Ordena Decrescente (Mais recente primeiro)
            listaGrid.sort((a, b) => b.data.localeCompare(a.data));

            // 6. Renderização Grid
            if(tbody) tbody.innerHTML = '';
            
            if (listaGrid.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            listaGrid.forEach(item => {
                const pctProd = item.metaDia > 0 ? (item.qtd / item.metaDia) * 100 : 0;
                let corProd = 'text-slate-400';
                if (item.metaDia > 0) {
                    corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');
                }

                // Data Formatada
                const [ano, mes, dia] = item.data.split('-');
                const dateObj = new Date(item.data + 'T12:00:00');
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');

                // Justificativa Visual
                const temJust = item.justificativa && item.justificativa.length > 0;
                const classJust = temJust ? "text-slate-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block truncate w-full" : "text-slate-200 text-center block";

                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600">
                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${item.fator}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.fifo}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gt}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gp}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400">${item.metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${this.fmtPct(pctProd)}</td>
                        
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${item.metaConfigAssert}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">
                            <span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span>
                        </td>

                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 max-w-[200px]" title="${temJust ? 'Obs: '+item.justificativa : ''}">
                            <span class="${classJust}">${item.justificativa || '-'}</span>
                        </td>
                    </tr>`;
            });

            // 7. Atualização KPI Cards (Lógica Refinada)
            
            // CARD 1: VOLUME
            this.setTxt('kpi-total', totalProdReal.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaEsperada.toLocaleString('pt-BR')); // Agora inclui todos os dias do período
            const pctVol = totalMetaEsperada > 0 ? (totalProdReal / totalMetaEsperada) * 100 : 0;
            const barVolume = document.getElementById('bar-volume');
            if(barVolume) barVolume.style.width = `${Math.min(pctVol, 100)}%`;

            // CARD 2: QUALIDADE (Média Ponderada Global)
            // Fórmula: Soma de todas as notas / Total de auditorias
            const mediaAssertGlobal = totalAssertQtd > 0 ? (totalAssertSoma / totalAssertQtd) : 0;
            this.setTxt('kpi-assertividade-val', this.fmtPct(mediaAssertGlobal));
            this.setTxt('kpi-pct', this.fmtPct(pctVol)); // % Atingimento Volume no Card 2

            // CARD 3: DIAS PRODUTIVOS
            // Soma simples dos fatores (ex: 0.5 + 0.5 = 1.0)
            const diasUteisPeriodo = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias', this.fmtDias(somaFatorProdutivo)); 
            this.setTxt('kpi-dias-uteis', diasUteisPeriodo);
            
            const pctDias = diasUteisPeriodo > 0 ? (somaFatorProdutivo / diasUteisPeriodo) * 100 : 0;
            const barDias = document.getElementById('bar-dias');
            if(barDias) barDias.style.width = `${Math.min(pctDias, 100)}%`;

            // CARD 4: VELOCIDADE (Média/Dia + %)
            // Usa 'somaFatorProdutivo' para ser justo (se trabalhou meio dia, conta como 0.5 no divisor)
            // Se somaFatorProdutivo for 0 (nenhum dia trabalhado), evita divisão por zero
            const divisorVelocidade = somaFatorProdutivo > 0 ? somaFatorProdutivo : 1;
            const mediaDiariaReal = Math.round(totalProdReal / divisorVelocidade);
            
            // A meta "ideal" no card de velocidade é a última meta configurada ou uma média?
            // Vamos usar a média das metas diárias do período para ser mais preciso
            // (Total Meta Esperada / Dias Úteis Totais do Período)
            // Mas cuidado: TotalMetaEsperada inclui dias futuros.
            // Para comparar maçãs com maçãs, o ideal é comparar com a meta do dia padrão (ex: 650).
            // Vou pegar a meta do último mês do período como referência de "Alvo Atual".
            const metaReferencia = mapMetas[anoFim]?.[new Date(dtFim).getMonth()+1]?.prod || 650;

            const pctVelocidade = metaReferencia > 0 ? (mediaDiariaReal / metaReferencia) * 100 : 0;
            
            // Formatação Híbrida: "605 / 93,08%"
            const textoVelocidade = `${mediaDiariaReal} <span class="text-slate-300 mx-1">/</span> <span class="${pctVelocidade >= 100 ? 'text-emerald-500' : 'text-amber-500'}">${this.fmtPct(pctVelocidade)}</span>`;
            
            const elMedia = document.getElementById('kpi-media');
            if(elMedia) elMedia.innerHTML = textoVelocidade;

            this.setTxt('kpi-meta-dia', metaReferencia); // Mostra a meta alvo (ex: 650)

        } catch (err) {
            console.error(err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    // Helpers de Formatação
    fmtPct: function(val) {
        if (val === null || val === undefined || isNaN(val)) return '0,00%';
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },
    
    fmtNum: function(val) {
        return val ? val.toLocaleString('pt-BR') : '0';
    },

    fmtDias: function(val) {
        // Exibe 1 casa decimal se não for inteiro (ex: 10,5)
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    },

    parseValorPorcentagem: function(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        let str = String(val).replace('%', '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
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
        ['kpi-total','kpi-meta-acumulada','kpi-assertividade-val','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        const bars = ['bar-volume', 'bar-dias'];
        bars.forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};