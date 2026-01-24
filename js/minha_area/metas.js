/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: Refatoração da Visão Geral para refletir cálculo da Produtividade (Soma Ponderada)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    carregar: async function() {
        console.log("🚀 Metas: Iniciando carregamento (Lógica Espelho Produtividade)...");
        const uid = MinhaArea.getUsuarioAlvo(); // null = Visão Geral
        const isGeral = (uid === null);

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // 1. Buscas Paralelas
            const promises = [
                // A. Produção
                Sistema.supabase.from('producao')
                    .select('usuario_id, data_referencia, quantidade, fator')
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim),
                
                // B. Metas
                Sistema.supabase.from('metas')
                    .select('usuario_id, mes, ano, meta, meta_assertividade')
                    .gte('ano', anoInicio)
                    .lte('ano', anoFim),
                
                // C. Usuários (Para filtrar funções na visão geral)
                Sistema.supabase.from('usuarios').select('id, funcao')
            ];

            const [prodRes, metasRes, usersRes] = await Promise.all(promises);

            if (prodRes.error) throw prodRes.error;
            if (metasRes.error) throw metasRes.error;

            // 2. Auditoria (Busca Paginada)
            const assertData = await this.buscarTodosAuditados(uid, inicio, fim);
            
            // --- PROCESSAMENTO INTELIGENTE (REFLETIR PRODUTIVIDADE) ---

            // Mapeamento de Usuários e Funções
            const userFuncaoMap = {};
            (usersRes.data || []).forEach(u => userFuncaoMap[u.id] = (u.funcao || '').toUpperCase());

            // Quem deve ser contado na meta? (Assistentes + Quem produziu)
            const usersComProducao = new Set();
            const rawProd = (uid) ? prodRes.data.filter(p => p.usuario_id == uid) : prodRes.data;
            rawProd.forEach(p => { if(Number(p.quantidade)>0) usersComProducao.add(p.usuario_id); });

            const getMetaUsuario = (userId, ano, mes) => {
                const m = (metasRes.data || []).find(r => r.usuario_id == userId && r.ano == ano && r.mes == mes);
                return m ? { prod: Number(m.meta), assert: Number(m.meta_assertividade) } : { prod: 650, assert: 98.0 };
            };

            // Indexar Produção para acesso rápido: mapProd[data][userId] = {qtd, fator}
            const mapProdDiaUser = {};
            rawProd.forEach(p => {
                if (!mapProdDiaUser[p.data_referencia]) mapProdDiaUser[p.data_referencia] = {};
                mapProdDiaUser[p.data_referencia][p.usuario_id] = { 
                    qtd: Number(p.quantidade||0), 
                    fator: Number(p.fator) // Pode ser NaN ou null
                };
            });

            // Indexar Assertividade (Para Gráfico)
            const mapAssertDia = new Map();
            const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];
            
            // Filtra auditoria pelo usuário alvo se não for geral
            const rawAsserts = uid ? assertData.filter(a => a.usuario_id == uid) : assertData;

            rawAsserts.forEach(a => {
                const dataKey = a.data_referencia ? a.data_referencia.split('T')[0] : null;
                if (!dataKey) return;
                const status = (a.status || '').toUpperCase();
                if (STATUS_IGNORAR.includes(status)) return;
                
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if (!isNaN(val)) {
                    if(!mapAssertDia.has(dataKey)) mapAssertDia.set(dataKey, []);
                    mapAssertDia.get(dataKey).push(val);
                }
            });

            // 3. Loop Temporal (Construção do Gráfico e KPI)
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            
            const labels = [];
            const dataProdReal = [];
            const dataProdMeta = [];
            const dataAssertReal = [];
            const dataAssertMeta = [];
            const aggMensal = new Map();

            // Variáveis Totais para Cards
            let kpiTotalProd = 0;
            let kpiTotalMeta = 0;

            // Define lista de IDs a iterar (Se Geral: Todos os users relevantes. Se Individual: Apenas o UID)
            let targetUserIds = [];
            if (uid) {
                targetUserIds = [parseInt(uid)];
            } else {
                targetUserIds = (usersRes.data || []).filter(u => {
                    const cargo = (u.funcao || '').toUpperCase();
                    const isAdm = ['AUDITORA', 'GESTORA', 'ADMINISTRADOR', 'ADMIN'].includes(cargo);
                    // Regra Produtividade: Conta se não for ADM OU se produziu algo
                    return !isAdm || usersComProducao.has(u.id);
                }).map(u => u.id);
            }

            // LOOP DIA A DIA
            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                const diaSemana = d.getDay();
                const isFDS = (diaSemana === 0 || diaSemana === 6);
                if (!modoMensal && isFDS) continue;

                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;
                const dia = d.getDate();

                // CÁLCULO DA META E REALIZADO DO DIA (Soma dos Usuários)
                let diaProd = 0;
                let diaMeta = 0;
                let diaMetaAssertSoma = 0;
                let diaMetaAssertCount = 0;

                targetUserIds.forEach(idUser => {
                    // 1. Produção Real
                    const registro = mapProdDiaUser[dataStr]?.[idUser];
                    const qtd = registro ? registro.qtd : 0;
                    diaProd += qtd;

                    // 2. Meta Esperada
                    // Se tem registro, usa o fator do registro. Se não, usa 1 (se dia útil) ou 0 (fds)
                    let fator = registro ? registro.fator : (isFDS ? 0 : 1);
                    if (isNaN(fator) || fator === null) fator = (isFDS ? 0 : 1);

                    const metasUser = getMetaUsuario(idUser, ano, mes);
                    
                    // Acumula Meta
                    diaMeta += Math.round(metasUser.prod * fator);
                    
                    // Acumula Meta Assertividade (para média)
                    diaMetaAssertSoma += metasUser.assert;
                    diaMetaAssertCount++;
                });

                kpiTotalProd += diaProd;
                kpiTotalMeta += diaMeta;

                // Média da Meta de Assertividade do Time (ex: 98%)
                const metaAssertDia = diaMetaAssertCount > 0 ? (diaMetaAssertSoma / diaMetaAssertCount) : 98.0;

                // Assertividade Real do Dia (Média dos docs auditados no dia)
                const assertsDiaList = mapAssertDia.get(dataStr) || [];
                const mediaAssertDia = assertsDiaList.length > 0 
                    ? assertsDiaList.reduce((a,b)=>a+b,0) / assertsDiaList.length 
                    : null;

                // Agregação Visual (Gráficos)
                if (modoMensal) {
                    const chaveMes = `${ano}-${mes}`;
                    if (!aggMensal.has(chaveMes)) {
                        aggMensal.set(chaveMes, { label: `${mes}/${ano}`, prod: 0, meta: 0, assertSoma: 0, assertQtd: 0, metaAssert: 0 });
                    }
                    const slot = aggMensal.get(chaveMes);
                    slot.prod += diaProd;
                    slot.meta += diaMeta;
                    slot.metaAssert = metaAssertDia; // Simplificação: pega o último ou média
                    if(mediaAssertDia !== null) {
                        slot.assertSoma += mediaAssertDia * assertsDiaList.length; // Re-pondera
                        slot.assertQtd += assertsDiaList.length;
                    }
                } else {
                    labels.push(`${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                    dataProdReal.push(diaProd);
                    dataProdMeta.push(diaMeta);
                    dataAssertReal.push(mediaAssertDia);
                    dataAssertMeta.push(metaAssertDia);
                }
            }

            // Processa Gráfico Mensal se necessário
            if (modoMensal) {
                for (const [key, val] of aggMensal.entries()) {
                    labels.push(val.label);
                    dataProdReal.push(val.prod);
                    dataProdMeta.push(val.meta);
                    dataAssertReal.push(val.assertQtd > 0 ? val.assertSoma / val.assertQtd : null);
                    dataAssertMeta.push(val.metaAssert);
                }
            }

            // 4. Renderização dos Cards (KPIs)
            this.atualizarCardsKPI(kpiTotalProd, kpiTotalMeta, rawAsserts);

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação (Docs)', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade (%)', '#059669', true);

        } catch (err) {
            console.error("❌ Erro Metas:", err);
            const container = document.getElementById('chart-container-wrapper'); 
        }
    },

    buscarTodosAuditados: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        const size = 1000;
        let continuar = true;
        while(continuar) {
            let q = Sistema.supabase.from('assertividade')
                .select('usuario_id, data_referencia, porcentagem_assertividade, status, qtd_nok, auditora_nome')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .neq('auditora_nome', null)
                .range(page * size, (page + 1) * size - 1);
            
            // Se for individual, filtra no banco pra economizar banda
            if(uid) q = q.eq('usuario_id', uid);

            const { data, error } = await q;
            if(error || !data || data.length === 0) {
                continuar = false;
            } else {
                todos = todos.concat(data);
                if(data.length < size) continuar = false;
                else page++;
            }
        }
        return todos;
    },

    atualizarCardsKPI: function(totalProd, totalMeta, asserts) {
        let somaAssert = 0;
        let qtdAssert = 0;
        let totalErros = 0;
        const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

        asserts.forEach(a => {
            const status = (a.status || '').toUpperCase();
            if (!STATUS_IGNORAR.includes(status)) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { somaAssert += val; qtdAssert++; }
            }
            if (a.qtd_nok && Number(a.qtd_nok) > 0) totalErros++;
        });

        const mediaAssert = qtdAssert > 0 ? (somaAssert / qtdAssert) : 0;
        const totalAuditados = asserts.length; 
        const totalAcertos = totalAuditados - totalErros;
        const semAuditoria = Math.max(0, totalProd - totalAuditados);

        // Render Cards
        this.setTxt('meta-prod-real', totalProd.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalProd/totalMeta)*100 : 0, 'bg-blue-600');

        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2})+'%');
        this.setTxt('meta-assert-meta', '98,00%');
        this.setBar('bar-meta-assert', (mediaAssert/98)*100, mediaAssert >= 98 ? 'bg-emerald-500' : 'bg-rose-500');

        this.setTxt('auditoria-total-validados', totalProd.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-total-nok', totalErros.toLocaleString('pt-BR')); 
    },

    renderizarGrafico: function(canvasId, labels, dataReal, dataMeta, labelReal, colorReal, isPercent) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (canvasId === 'graficoEvolucaoProducao') { if (this.chartProd) this.chartProd.destroy(); } 
        else { if (this.chartAssert) this.chartAssert.destroy(); }

        const newChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: labelReal,
                        data: dataReal,
                        backgroundColor: colorReal,
                        borderRadius: 4,
                        barPercentage: 0.6,
                        order: 2
                    },
                    {
                        label: 'Meta Esperada',
                        data: dataMeta,
                        type: 'line',
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        pointRadius: 0,
                        borderDash: [5, 5],
                        tension: 0.1,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: v => isPercent?v+'%':v } },
                    x: { grid: { display: false } }
                }
            }
        });

        if (canvasId === 'graficoEvolucaoProducao') this.chartProd = newChart;
        else this.chartAssert = newChart;
    },

    resetarCards: function() {
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta','auditoria-total-validados','auditoria-total-auditados','auditoria-sem-audit','auditoria-total-ok','auditoria-total-nok'].forEach(id => this.setTxt(id, '--'));
        ['bar-meta-assert','bar-meta-prod'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },
    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, cls) { const el = document.getElementById(id); if(el) { el.style.width = Math.min(pct,100)+'%'; el.className = `h-full rounded-full transition-all ${cls}`; } }
};