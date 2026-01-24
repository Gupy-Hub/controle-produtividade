/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Engine do Painel "Dia a Dia" (Minha Área)
   ATUALIZAÇÃO: Correção na leitura das Metas (meta_producao)
*/

MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo(); // Retorna ID ou null (Visão Geral)
        const isGeral = (uid === null); // Flag para identificar modo Visão Geral
        
        const tbody = document.getElementById('tabela-extrato');
        
        // Limpa estado anterior do alerta
        const alertContainer = document.getElementById('container-checkin-alert');
        if (alertContainer) {
            alertContainer.innerHTML = '';
            alertContainer.classList.add('hidden');
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Consolidando dados da equipe...</span></div></td></tr>';

        try {
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // --- CONSTRUÇÃO DAS QUERIES CONDICIONAIS ---
            
            // 1. Produção
            let qProducao = Sistema.supabase.from('producao')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .limit(5000);
            if (!isGeral) qProducao = qProducao.eq('usuario_id', uid);

            // 2. Assertividade
            let qAssertividade = Sistema.supabase.from('assertividade')
                .select('data_referencia, porcentagem_assertividade')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .not('porcentagem_assertividade', 'is', null)
                .limit(5000);
            if (!isGeral) qAssertividade = qAssertividade.eq('usuario_id', uid);

            // 3. Metas (CORRIGIDO: meta -> meta_producao)
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, ano, meta_producao, meta_assertividade')
                .gte('ano', anoInicio)
                .lte('ano', anoFim);
            if (!isGeral) qMetas = qMetas.eq('usuario_id', uid);

            // 4. Histórico Checking (Apenas se for usuário único)
            let qCheck = null;
            if (!isGeral) {
                qCheck = Sistema.supabase.from('checking_diario')
                    .select('data_referencia, status')
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim);
            }

            // --- EXECUÇÃO PARALELA ---
            const [prodRes, assertRes, metasRes, checkRes] = await Promise.all([
                qProducao,
                qAssertividade,
                qMetas,
                qCheck ? qCheck : Promise.resolve({ data: [] })
            ]);

            if (prodRes.error) console.error("Erro Produção:", prodRes.error);
            if (assertRes.error) console.error("Erro Assertividade:", assertRes.error);
            if (metasRes.error) console.error("Erro Metas:", metasRes.error);

            const dadosProducaoRaw = prodRes.data || [];
            const dadosAssertividadeRaw = assertRes.data || [];
            const dadosMetasRaw = metasRes.data || [];
            const dadosCheckins = checkRes.data || [];

            // --- LOGICA DE CHECKING (Apenas Individual) ---
            if (!isGeral) {
                await this.processarCheckingInterface(uid, dadosCheckins);
            }

            // --- PROCESSAMENTO E AGREGAÇÃO DE DADOS ---

            // 1. Agregação de Metas (Soma das metas de todos os usuários ativos no mês)
            const mapMetas = {};
            dadosMetasRaw.forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                if (!mapMetas[m.ano][m.mes]) mapMetas[m.ano][m.mes] = { prod: 0, assert: 0, count: 0 };
                
                // Na visão geral, somamos a meta de produção (CORRIGIDO: meta_producao)
                const metaProdVal = m.meta_producao ? Number(m.meta_producao) : 0;
                mapMetas[m.ano][m.mes].prod += metaProdVal;
                
                // Na visão geral, mantemos a meta de assertividade padrão (ou média, se preferir)
                if (isGeral) {
                     mapMetas[m.ano][m.mes].assert = 98.0; 
                } else {
                     mapMetas[m.ano][m.mes].assert = Number(m.meta_assertividade || 98.0);
                }
            });

            // 2. Agregação de Produção
            const mapProd = new Map();
            
            if (isGeral) {
                // Modo Visão Geral: Agrupa tudo por Data
                dadosProducaoRaw.forEach(p => {
                    const data = p.data_referencia;
                    if (!mapProd.has(data)) {
                        mapProd.set(data, {
                            quantidade: 0,
                            fifo: 0,
                            gradual_total: 0,
                            gradual_parcial: 0,
                            fator_soma: 0,
                            fator_count: 0,
                            justificativa: 'Visão Consolidada' // Texto padrão
                        });
                    }
                    const reg = mapProd.get(data);
                    reg.quantidade += Number(p.quantidade || 0);
                    reg.fifo += Number(p.fifo || 0);
                    reg.gradual_total += Number(p.gradual_total || 0);
                    reg.gradual_parcial += Number(p.gradual_parcial || 0);
                    reg.fator_soma += Number(p.fator || 1);
                    reg.fator_count++;
                });

                // Calcula média do fator para a visão geral
                for (let [key, val] of mapProd) {
                    val.fator = val.fator_count > 0 ? (val.fator_soma / val.fator_count).toFixed(2) : 1.0;
                }

            } else {
                // Modo Individual: Mapeamento direto
                dadosProducaoRaw.forEach(p => mapProd.set(p.data_referencia, p));
            }

            // 3. Agregação de Assertividade
            const mapAssert = new Map();
            dadosAssertividadeRaw.forEach(a => {
                const key = a.data_referencia;
                if(!mapAssert.has(key)) mapAssert.set(key, { soma: 0, qtd: 0 });
                
                const valRaw = a.porcentagem_assertividade;
                if (valRaw !== null && valRaw !== undefined && String(valRaw).trim() !== '') {
                    mapAssert.get(key).soma += this.parseValorPorcentagem(valRaw);
                    mapAssert.get(key).qtd++;
                }
            });

            // 4. Mapeamento de Checkins
            const mapCheckins = new Set();
            dadosCheckins.forEach(c => mapCheckins.add(c.data_referencia));

            // --- GERAÇÃO DA GRID (CALENDÁRIO) ---
            const listaGrid = [];
            let totalProdReal = 0, totalMetaEsperada = 0, somaFatorProdutivo = 0, diasComProducaoReal = 0;
            let totalAssertSoma = 0, totalAssertQtd = 0;
            
            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                if (d.getDay() === 0 || d.getDay() === 6) continue;

                const dataStr = d.toISOString().split('T')[0];
                const anoAtual = d.getFullYear();
                const mesAtual = d.getMonth() + 1;
                
                // Pega meta do mapa (Se for Geral, é a soma. Se for Individual, é a do usuário)
                const metaConfig = mapMetas[anoAtual]?.[mesAtual] || { prod: (isGeral ? 6500 : 650), assert: 98.0 };
                
                const prodDoDia = mapProd.get(dataStr);
                
                let fator = 1.0;
                let qtdReal = 0;
                let justif = '';
                let temRegistro = false;

                if (prodDoDia) {
                    temRegistro = true;
                    fator = Number(prodDoDia.fator); 
                    if (isNaN(fator)) fator = 1.0;
                    qtdReal = Number(prodDoDia.quantidade || 0);
                    
                    // Recupera justificativa (se for geral, vem 'Visão Consolidada')
                    justif = (prodDoDia.justificativa_abono || '').trim();
                    if (!justif) justif = (prodDoDia.justificativa || '').trim();
                    if (!justif) justif = (prodDoDia.justificativas || '').trim();
                    if (isGeral) justif = ''; // Limpa visualmente na geral

                    totalProdReal += qtdReal;
                    somaFatorProdutivo += fator; // Na geral, soma a média dos fatores diários
                    if (fator > 0) diasComProducaoReal++;
                }

                // Cálculo da Meta do Dia baseada no Fator (Presume que metaConfig.prod é a meta diária cheia)
                const metaDiaCalculada = Math.round(metaConfig.prod * fator);
                totalMetaEsperada += metaDiaCalculada;

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
                        gp: Number(prodDoDia.gradual_parcial || 0),
                        validado: mapCheckins.has(dataStr)
                    });
                }
            }

            listaGrid.sort((a, b) => b.data.localeCompare(a.data));

            // --- RENDERIZAÇÃO ---
            if(tbody) tbody.innerHTML = '';
            
            if (listaGrid.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            listaGrid.forEach(item => {
                const pctProd = item.metaDia > 0 ? (item.qtd / item.metaDia) * 100 : 0;
                let corProd = 'text-slate-400';
                if (item.metaDia > 0) corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');

                const [ano, mes, dia] = item.data.split('-');
                const dateObj = new Date(item.data + 'T12:00:00');
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');

                const temJust = item.justificativa && item.justificativa.length > 0;
                const classJust = temJust ? "text-slate-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block truncate w-full" : "text-slate-200 text-center block";

                const iconValidado = item.validado 
                    ? `<i class="fas fa-check-circle text-emerald-500 ml-1" title="Validado (Checking Diário)"></i>` 
                    : `<i class="far fa-circle text-slate-200 ml-1 text-[8px]" title="Pendente de checking"></i>`;

                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600 ${item.validado ? 'bg-emerald-50/5' : ''}">
                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano} ${!isGeral ? iconValidado : ''}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${Number(item.fator).toFixed(2)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.fifo}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gt}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gp}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400">${item.metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${this.fmtPct(pctProd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${item.metaConfigAssert}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 max-w-[200px]" title="${temJust ? 'Obs: '+item.justificativa : ''}"><span class="${classJust}">${item.justificativa || '-'}</span></td>
                    </tr>`;
            });

            // --- ATUALIZAÇÃO DOS KPIS DE TOPO ---
            this.setTxt('kpi-total', totalProdReal.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaEsperada.toLocaleString('pt-BR'));
            
            const pctVol = totalMetaEsperada > 0 ? (totalProdReal / totalMetaEsperada) * 100 : 0;
            const barVolume = document.getElementById('bar-volume');
            if(barVolume) barVolume.style.width = `${Math.min(pctVol, 100)}%`;

            const mediaAssertGlobal = totalAssertQtd > 0 ? (totalAssertSoma / totalAssertQtd) : 0;
            this.setTxt('kpi-assertividade-val', this.fmtPct(mediaAssertGlobal));
            this.setTxt('kpi-pct', this.fmtPct(pctVol));

            const diasUteisPeriodo = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias', this.fmtDias(somaFatorProdutivo)); 
            this.setTxt('kpi-dias-uteis', diasUteisPeriodo);
            
            const pctDias = diasUteisPeriodo > 0 ? (somaFatorProdutivo / diasUteisPeriodo) * 100 : 0;
            const barDias = document.getElementById('bar-dias');
            if(barDias) barDias.style.width = `${Math.min(pctDias, 100)}%`;

            // Velocidade (Docs/Dia)
            const divisorVelocidade = somaFatorProdutivo > 0 ? somaFatorProdutivo : 1;
            const mediaDiariaReal = Math.round(totalProdReal / divisorVelocidade);
            
            // Meta Referência (Último mês disponível)
            const metaReferencia = mapMetas[anoFim]?.[new Date(dtFim).getMonth()+1]?.prod || (isGeral ? 6500 : 650);
            
            const pctVelocidade = metaReferencia > 0 ? (mediaDiariaReal / metaReferencia) * 100 : 0;
            
            const elMedia = document.getElementById('kpi-media');
            if(elMedia) elMedia.innerHTML = `${mediaDiariaReal} <span class="text-slate-300 mx-1">/</span> <span class="${pctVelocidade >= 100 ? 'text-emerald-500' : 'text-amber-500'}">${this.fmtPct(pctVelocidade)}</span>`;
            this.setTxt('kpi-meta-dia', metaReferencia);

        } catch (err) {
            console.error("Erro Crítico Geral:", err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados consolidados.</td></tr>';
        }
    },

    // --- LÓGICA DE CHECKING ---
    processarCheckingInterface: async function(uid, checkins) {
        // Se uid for nulo (Visão Geral) ou se não for o próprio usuário logado, aborta.
        if (!uid || MinhaArea.usuario.id !== parseInt(uid)) return;

        // DATA DE TESTE FIXA (Conforme solicitado)
        const ontemStr = '2025-12-16'; 
        const ontemFormatado = '16/12/2025';

        const jaValidou = checkins.some(c => c.data_referencia === ontemStr);
        const container = document.getElementById('container-checkin-alert');
        if (!container) return;

        if (!jaValidou) {
            container.innerHTML = `
                <div class="bg-white border-l-4 border-blue-500 shadow-md rounded-r-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                    <div class="flex items-center gap-3">
                        <div class="bg-blue-50 p-3 rounded-full text-blue-600"><i class="fas fa-clipboard-check text-xl"></i></div>
                        <div>
                            <h4 class="font-bold text-slate-700 text-sm">Checking Diário Pendente (TESTE)</h4>
                            <p class="text-xs text-slate-500">Confirme a conferência dos dados do dia ${ontemFormatado}.</p>
                        </div>
                    </div>
                    <button onclick="MinhaArea.Geral.realizarCheckin('${ontemStr}')" 
                        class="group bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 hover:shadow-md active:scale-95 whitespace-nowrap">
                        <span>Validar Dados</span>
                        <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                    </button>
                </div>`;
            container.classList.remove('hidden');
        } else {
            container.innerHTML = `
                <div class="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-center justify-center gap-2 shadow-sm opacity-90 transition-all">
                    <i class="fas fa-check-circle text-emerald-600"></i>
                    <span class="text-emerald-800 font-bold text-xs">Dados de ${ontemFormatado} confirmados!</span>
                </div>`;
            container.classList.remove('hidden');
        }
    },

    realizarCheckin: async function(dataStr) {
        if(!confirm(`Confirma que analisou e valida os dados do dia ${dataStr.split('-').reverse().join('/')}?`)) return;

        try {
            const uid = MinhaArea.usuario.id;
            const { error } = await Sistema.supabase
                .from('checking_diario')
                .insert({ usuario_id: uid, data_referencia: dataStr, status: 'VALIDADO' });

            if (error) throw error;
            this.carregar();
        } catch (e) {
            alert('Erro ao validar: ' + e.message);
        }
    },

    // --- Helpers Format ---
    fmtPct: function(val) {
        if (val === null || val === undefined || isNaN(val)) return '0,00%';
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },
    fmtNum: function(val) { return val ? val.toLocaleString('pt-BR') : '0'; },
    fmtDias: function(val) { return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); },
    
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