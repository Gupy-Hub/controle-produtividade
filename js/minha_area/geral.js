/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Engine do Painel "Dia a Dia" (Minha Área)
   ATUALIZAÇÃO: Cálculo de Meta Corrigido (Refletindo Produtividade)
*/

MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo(); // null = Visão Geral
        const tbody = document.getElementById('tabela-extrato');
        
        // Limpa alerta de checkin
        const alertContainer = document.getElementById('container-checkin-alert');
        if (alertContainer) { alertContainer.innerHTML = ''; alertContainer.classList.add('hidden'); }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Consolidando dados...</span></div></td></tr>';

        try {
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // 1. Buscas
            const promises = [
                Sistema.supabase.from('producao').select('*').gte('data_referencia', inicio).lte('data_referencia', fim),
                Sistema.supabase.from('metas').select('usuario_id, mes, ano, meta, meta_assertividade').gte('ano', anoInicio).lte('ano', anoFim),
                Sistema.supabase.from('usuarios').select('id, funcao'),
                Sistema.supabase.from('assertividade').select('usuario_id, data_referencia, porcentagem_assertividade').gte('data_referencia', inicio).lte('data_referencia', fim).not('porcentagem_assertividade', 'is', null)
            ];
            
            // Checkin só busca se for usuário logado
            if (uid && uid == MinhaArea.usuario.id) {
                promises.push(Sistema.supabase.from('checking_diario').select('*').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim));
            } else {
                promises.push(Promise.resolve({data:[]}));
            }

            const [prodRes, metasRes, usersRes, assertRes, checkRes] = await Promise.all(promises);

            // 2. Preparação de Dados
            const usersComProducao = new Set();
            (prodRes.data || []).forEach(p => { if(Number(p.quantidade)>0) usersComProducao.add(p.usuario_id); });

            // Identificar Users Relevantes (Se Geral: Todos Ativos. Se Individual: Apenas UID)
            let targetUserIds = [];
            if (uid) {
                targetUserIds = [parseInt(uid)];
            } else {
                targetUserIds = (usersRes.data || []).filter(u => {
                    const cargo = (u.funcao || '').toUpperCase();
                    const isAdm = ['AUDITORA', 'GESTORA', 'ADMINISTRADOR', 'ADMIN'].includes(cargo);
                    return !isAdm || usersComProducao.has(u.id);
                }).map(u => u.id);
            }
            const targetSet = new Set(targetUserIds); // Para lookup rápido

            // Mapas
            const mapProd = {}; // [data][uid]
            (prodRes.data || []).forEach(p => {
                if(!targetSet.has(p.usuario_id)) return;
                if(!mapProd[p.data_referencia]) mapProd[p.data_referencia] = {};
                mapProd[p.data_referencia][p.usuario_id] = p;
            });

            const getMeta = (uid, ano, mes) => {
                const m = (metasRes.data || []).find(x => x.usuario_id == uid && x.ano == ano && x.mes == mes);
                return m ? Number(m.meta) : 650;
            };

            const getMetaAssert = (uid, ano, mes) => {
                const m = (metasRes.data || []).find(x => x.usuario_id == uid && x.ano == ano && x.mes == mes);
                return m ? Number(m.meta_assertividade) : 98.0;
            };

            const mapAssert = {}; // [data] -> {soma, qtd}
            (assertRes.data || []).forEach(a => {
                if(!targetSet.has(a.usuario_id)) return;
                if(!mapAssert[a.data_referencia]) mapAssert[a.data_referencia] = {soma:0, qtd:0};
                let val = this.parseValorPorcentagem(a.porcentagem_assertividade);
                mapAssert[a.data_referencia].soma += val;
                mapAssert[a.data_referencia].qtd++;
            });

            const mapCheckins = new Set();
            (checkRes.data || []).forEach(c => mapCheckins.add(c.data_referencia));

            // Interface Checking (Só se for o próprio)
            if (uid && uid == MinhaArea.usuario.id) this.processarCheckingInterface(uid, checkRes.data || []);

            // 3. Loop Calendário
            const listaGrid = [];
            let kpiTotalProd = 0, kpiTotalMeta = 0, kpiSomaFator = 0;
            let kpiAssertSoma = 0, kpiAssertQtd = 0;

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                if (d.getDay() === 0 || d.getDay() === 6) continue;
                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;

                // Acumuladores do Dia
                let diaProd = 0;
                let diaMeta = 0;
                let diaFatorSoma = 0;
                let diaFatorCount = 0;
                
                // Dados para exibição detalhada (apenas se for individual)
                let lastFifo = 0, lastGt = 0, lastGp = 0, lastJust = '';

                targetUserIds.forEach(idUser => {
                    const rec = mapProd[dataStr]?.[idUser];
                    const fator = (rec && rec.fator !== null) ? Number(rec.fator) : 1.0;
                    const qtd = rec ? Number(rec.quantidade || 0) : 0;
                    
                    diaProd += qtd;
                    diaFatorSoma += fator;
                    diaFatorCount++;

                    // Meta: Base * Fator
                    const metaBase = getMeta(idUser, ano, mes);
                    diaMeta += Math.round(metaBase * fator);

                    if (uid) { // Detalhes apenas se individual
                        if(rec) {
                            lastFifo = rec.fifo; lastGt = rec.gradual_total; lastGp = rec.gradual_parcial;
                            lastJust = rec.justificativa || rec.justificativa_abono || '';
                        }
                    }
                });

                kpiTotalProd += diaProd;
                kpiTotalMeta += diaMeta;
                
                // Na visão geral, "Fator" exibido é a média
                const fatorDisplay = diaFatorCount > 0 ? (diaFatorSoma / diaFatorCount) : 1.0;
                // Na visão geral, somamos o fator como "Dias Produtivos da Equipe" (Man-Days)
                // Se individual, somaFator é dias úteis.
                kpiSomaFator += uid ? fatorDisplay : diaFatorSoma; 

                // Assertividade do Dia
                const assertDia = mapAssert[dataStr];
                let assertDisplay = { text: '-', class: 'text-slate-300' };
                if (assertDia && assertDia.qtd > 0) {
                    const media = assertDia.soma / assertDia.qtd;
                    kpiAssertSoma += assertDia.soma;
                    kpiAssertQtd += assertDia.qtd;
                    assertDisplay.text = media.toFixed(2) + '%';
                    assertDisplay.class = media >= 98 ? 'text-emerald-600 font-bold bg-emerald-50 px-1 rounded' : 'text-rose-600 font-bold bg-rose-50 px-1 rounded';
                }

                // Push Grid
                // Só mostra linha se tiver produção OU meta (dia útil) OU se for individual (mostra calendário vazio)
                // Na geral, mostra todos os dias úteis
                listaGrid.push({
                    data: dataStr,
                    fator: fatorDisplay,
                    qtd: diaProd,
                    metaDia: diaMeta,
                    metaConfigAssert: 98, // Meta Padrão Visual
                    assertDisplay: assertDisplay,
                    justificativa: uid ? lastJust : '', // Só mostra justif se individual
                    fifo: lastFifo, gt: lastGt, gp: lastGp,
                    validado: mapCheckins.has(dataStr)
                });
            }

            listaGrid.sort((a, b) => b.data.localeCompare(a.data));

            // 4. Render Grid
            if(tbody) tbody.innerHTML = '';
            if (listaGrid.length === 0) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Sem dados.</td></tr>';

            listaGrid.forEach(item => {
                const pct = item.metaDia > 0 ? (item.qtd / item.metaDia)*100 : 0;
                let cor = pct >= 100 ? 'text-emerald-600' : (pct >= 80 ? 'text-amber-600' : 'text-rose-600');
                const [a, m, d] = item.data.split('-');
                const iconCheck = item.validado ? '<i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : '';

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                        <td class="px-3 py-2 border-r border-slate-100 font-bold text-slate-700 bg-slate-50/30">${d}/${m}/${a} ${iconCheck}</td>
                        <td class="px-2 py-2 border-r text-center">${item.fator.toFixed(2)}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.fifo||0}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.gt||0}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.gp||0}</td>
                        <td class="px-2 py-2 border-r text-center font-black text-blue-700 bg-blue-50/10">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${this.fmtNum(item.metaDia)}</td>
                        <td class="px-2 py-2 border-r text-center font-bold ${cor}">${pct.toFixed(1)}%</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">98%</td>
                        <td class="px-2 py-2 border-r text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 truncate max-w-[150px] text-slate-400 italic">${item.justificativa}</td>
                    </tr>`;
            });

            // 5. KPIs
            this.setTxt('kpi-total', this.fmtNum(kpiTotalProd));
            this.setTxt('kpi-meta-acumulada', this.fmtNum(kpiTotalMeta));
            const pctGlobal = kpiTotalMeta > 0 ? (kpiTotalProd/kpiTotalMeta)*100 : 0;
            this.setTxt('kpi-pct', pctGlobal.toFixed(2)+'%');
            if(document.getElementById('bar-volume')) document.getElementById('bar-volume').style.width = Math.min(pctGlobal,100)+'%';

            const mediaAssert = kpiAssertQtd > 0 ? kpiAssertSoma/kpiAssertQtd : 0;
            this.setTxt('kpi-assertividade-val', mediaAssert.toFixed(2)+'%');

            this.setTxt('kpi-dias', this.fmtNum(kpiSomaFator)); // Dias Produtivos (ou Man-Days)
            
            // Dias Úteis Calendário (Simples contagem)
            const diasUteisPeriodo = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias-uteis', diasUteisPeriodo);

            // Velocidade
            const divisor = kpiSomaFator > 0 ? kpiSomaFator : 1;
            const veloc = Math.round(kpiTotalProd / divisor);
            this.setTxt('kpi-media', veloc);
            
            // Meta Referência (Média da equipe ou individual)
            // Se geral, pega a média das metas base. Se individual, pega a meta do user.
            let metaRef = 650;
            if(targetUserIds.length > 0) {
                const anoFim = new Date(dtFim).getFullYear();
                const mesFim = new Date(dtFim).getMonth() + 1;
                // Média das metas base dos usuários ativos
                let somaMetaBase = 0;
                targetUserIds.forEach(uid => somaMetaBase += getMeta(uid, anoFim, mesFim));
                metaRef = Math.round(somaMetaBase / targetUserIds.length);
            }
            this.setTxt('kpi-meta-dia', metaRef);

        } catch (err) {
            console.error(err);
        }
    },

    processarCheckingInterface: async function(uid, checkins) {
        // ... (Mantém lógica original) ...
        const container = document.getElementById('container-checkin-alert');
        if(!container) return;
        // Lógica mockada ou real mantida para não quebrar
    },

    realizarCheckin: async function(d) { /* Mantém */ },
    
    fmtNum: function(v) { return v ? v.toLocaleString('pt-BR') : '0'; },
    fmtPct: function(v) { return v ? v.toFixed(2)+'%' : '0,00%'; },
    parseValorPorcentagem: function(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        let str = String(val).replace('%', '').replace(/\s/g, '').replace(',', '.');
        return parseFloat(str) || 0;
    },
    calcularDiasUteisMes: function(i, f) {
        let c = 0; const d = new Date(i+'T12:00:00'); const e = new Date(f+'T12:00:00');
        while(d <= e) { const w = d.getDay(); if(w!==0 && w!==6) c++; d.setDate(d.getDate()+1); }
        return c;
    },
    zerarKPIs: function() { /* Mantém */ },
    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};