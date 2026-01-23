/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: Lógica de Acertos/Erros alinhada com a aba Assertividade
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    carregar: async function() {
        console.log("🚀 Metas: Iniciando carregamento...");
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // 1. Buscas Básicas
            const [prodRes, metasRes] = await Promise.all([
                Sistema.supabase.from('producao')
                    .select('*')
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim),
                Sistema.supabase.from('metas')
                    .select('mes, ano, meta, meta_assertividade')
                    .eq('usuario_id', uid)
                    .gte('ano', anoInicio)
                    .lte('ano', anoFim)
            ]);

            if (prodRes.error) throw prodRes.error;

            // 2. BUSCA ROBUSTA DE AUDITORIA
            const assertData = await this.buscarTodosAuditados(uid, inicio, fim);
            console.log(`📦 Metas: Total de auditorias baixadas: ${assertData.length}`);

            // 3. Processamento dos Mapas
            const mapMetas = {};
            (metasRes.data || []).forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                mapMetas[m.ano][m.mes] = { prod: Number(m.meta), assert: Number(m.meta_assertividade) };
            });

            const mapProd = new Map();
            (prodRes.data || []).forEach(p => mapProd.set(p.data_referencia, p));

            const mapAssert = new Map();
            
            // Status que não entram no cálculo da MÉDIA de assertividade
            const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

            assertData.forEach(a => {
                const dataKey = a.data_referencia ? a.data_referencia.split('T')[0] : null;
                if (!dataKey) return;

                // Para o gráfico de evolução da média, mantemos o filtro de status
                const status = (a.status || '').toUpperCase();
                if (STATUS_IGNORAR.includes(status)) return; 

                if(!mapAssert.has(dataKey)) mapAssert.set(dataKey, []);
                
                let valStr = String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.');
                let val = parseFloat(valStr);
                
                if (!isNaN(val)) {
                    mapAssert.get(dataKey).push(val);
                }
            });

            // 4. Construção dos Arrays do Gráfico
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            
            const labels = [];
            const dataProdReal = [];
            const dataProdMeta = [];
            const dataAssertReal = [];
            const dataAssertMeta = [];

            const aggMensal = new Map(); 
            const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                const diaSemana = d.getDay();
                const isFDS = (diaSemana === 0 || diaSemana === 6);

                if (!modoMensal && isFDS) continue; 

                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;
                const dia = d.getDate();

                const metaConfig = mapMetas[ano]?.[mes] || { prod: 650, assert: 98.0 };
                const prodDia = mapProd.get(dataStr);
                
                const qtd = prodDia ? Number(prodDia.quantidade || 0) : 0;
                const fator = prodDia ? Number(prodDia.fator) : (isFDS ? 0 : 1); 
                const metaDia = Math.round(metaConfig.prod * (isNaN(fator) ? 1 : fator));

                const assertsDia = mapAssert.get(dataStr) || [];
                
                if (modoMensal) {
                    const chaveMes = `${ano}-${mes}`;
                    if (!aggMensal.has(chaveMes)) {
                        aggMensal.set(chaveMes, { 
                            label: mesesNomes[mes-1],
                            prodReal: 0, prodMeta: 0,
                            assertSoma: 0, assertQtd: 0, assertMetaSoma: 0 
                        });
                    }
                    const slot = aggMensal.get(chaveMes);
                    slot.prodReal += qtd;
                    slot.prodMeta += metaDia;
                    
                    if (assertsDia.length > 0) {
                        assertsDia.forEach(v => { slot.assertSoma += v; slot.assertQtd++; });
                    }
                    slot.assertMetaSoma = metaConfig.assert; 
                } else {
                    labels.push(`${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                    dataProdReal.push(qtd);
                    dataProdMeta.push(metaDia);

                    if (assertsDia.length > 0) {
                        const soma = assertsDia.reduce((a,b)=>a+b,0);
                        const media = soma / assertsDia.length;
                        dataAssertReal.push(media);
                    } else {
                        dataAssertReal.push(null);
                    }
                    dataAssertMeta.push(Number(metaConfig.assert));
                }
            }

            if (modoMensal) {
                for (const [key, val] of aggMensal.entries()) {
                    labels.push(val.label); 
                    dataProdReal.push(val.prodReal);
                    dataProdMeta.push(val.prodMeta);
                    const mediaMensal = val.assertQtd > 0 ? (val.assertSoma / val.assertQtd) : null; 
                    dataAssertReal.push(mediaMensal);
                    dataAssertMeta.push(Number(val.assertMetaSoma)); 
                }
            }

            // 5. Renderização (Lógica de KPI Ajustada)
            this.atualizarCardsKPI(prodRes.data, assertData, mapMetas, dtInicio, dtFim);

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação (Docs)', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade (%)', '#059669', true);

        } catch (err) {
            console.error("❌ Erro Metas:", err);
            const container = document.getElementById('chart-container-wrapper');
            if(container) container.innerHTML = `<div class="text-red-500 text-center py-10">Erro ao carregar gráficos: ${err.message}</div>`;
        }
    },

    buscarTodosAuditados: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        const size = 1000;
        let continuar = true;

        while(continuar) {
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*') 
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .neq('auditora_nome', null)
                .neq('auditora_nome', '')
                .range(page * size, (page + 1) * size - 1);

            if(error) {
                console.error("Erro paginação:", error);
                throw error;
            }

            if (!data || data.length === 0) {
                continuar = false;
            } else {
                todos = todos.concat(data);
                if(data.length < size) continuar = false;
                else page++;
            }
        }
        return todos;
    },

    atualizarCardsKPI: function(prods, asserts, mapMetas, dtInicio, dtFim) {
        let totalValidados = 0; 
        let totalMeta = 0;
        
        // Variáveis para Média Assertividade (Gráfico/Barra)
        let somaAssertMedia = 0;
        let qtdAssertMedia = 0;
        
        // Variáveis para Contagem de Erros vs Acertos (Painel Auditoria)
        let totalErros = 0; 

        const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

        const mapProd = new Map();
        (prods || []).forEach(p => mapProd.set(p.data_referencia, p));

        // 1. Cálculo de Produção (Validados)
        for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
            const isFDS = (d.getDay() === 0 || d.getDay() === 6);
            const dataStr = d.toISOString().split('T')[0];
            const ano = d.getFullYear();
            const mes = d.getMonth() + 1;
            const metaConfig = mapMetas[ano]?.[mes] || { prod: 650, assert: 98.0 };

            const prodDia = mapProd.get(dataStr);
            const fator = prodDia ? Number(prodDia.fator) : (isFDS ? 0 : 1);
            
            if (prodDia) {
                totalValidados += Number(prodDia.quantidade || 0);
            }
            totalMeta += Math.round(metaConfig.prod * (isNaN(fator)?1:fator));
        }

        // 2. Loop de Auditoria
        asserts.forEach(a => {
            const status = (a.status || '').toUpperCase();
            
            // Lógica da Média (Ignora neutros)
            if (!STATUS_IGNORAR.includes(status)) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { 
                    somaAssertMedia += val; 
                    qtdAssertMedia++; 
                }
            }
            
            // Lógica de Acertos vs Erros (Igual à aba Assertividade)
            // Se tiver qualquer quantidade NOK (>0), é considerado ERRO.
            if (a.qtd_nok && Number(a.qtd_nok) > 0) {
                totalErros++;
            }
        });

        // 3. Totais Finais
        const mediaAssert = qtdAssertMedia > 0 ? (somaAssertMedia / qtdAssertMedia) : 0;
        const totalAuditados = asserts.length; 
        const semAuditoria = Math.max(0, totalValidados - totalAuditados);
        
        // Acertos é o complemento (Tudo que não é erro)
        const totalAcertos = totalAuditados - totalErros;

        // --- Atualização do DOM ---

        // Card Validação
        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-blue-600');

        // Card Assertividade (Média)
        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        const metaAssertRef = 98.0; 
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-emerald-500' : 'bg-rose-500');

        // Card Auditoria
        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
        
        // Novos Campos (Acertos vs Erros)
        // OBS: Se você alterou os rótulos no HTML para "Acertos" e "Erros", os IDs abaixo receberão os valores corretos.
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); // Antigo OK agora é Acertos
        this.setTxt('auditoria-total-nok', totalErros.toLocaleString('pt-BR')); // Antigo NOK agora é Erros
    },

    renderizarGrafico: function(canvasId, labels, dataReal, dataMeta, labelReal, colorReal, isPercent) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (canvasId === 'graficoEvolucaoProducao') {
            if (this.chartProd) this.chartProd.destroy();
        } else {
            if (this.chartAssert) this.chartAssert.destroy();
        }

        const config = {
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
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#94a3b8',
                        pointRadius: 3,
                        borderDash: [5, 5],
                        tension: 0.1,
                        order: 1,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1e293b',
                        bodyColor: '#475569',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        callbacks: {
                            label: function(ctx) {
                                let val = ctx.raw;
                                if (val === null || val === undefined) return ctx.dataset.label + ': -';
                                val = val.toLocaleString('pt-BR', { minimumFractionDigits: isPercent ? 2 : 0, maximumFractionDigits: isPercent ? 2 : 0 });
                                return ctx.dataset.label + ': ' + val + (isPercent ? '%' : '');
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        ticks: { 
                            font: { size: 10 },
                            callback: function(val) { return isPercent ? val + '%' : val; }
                        } 
                    },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        };

        const newChart = new Chart(ctx, config);

        if (canvasId === 'graficoEvolucaoProducao') this.chartProd = newChart;
        else this.chartAssert = newChart;
    },

    resetarCards: function() {
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta','auditoria-total-validados','auditoria-total-auditados','auditoria-sem-audit','auditoria-total-ok','auditoria-total-nok'].forEach(id => this.setTxt(id, '--'));
        ['bar-meta-assert','bar-meta-prod'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, colorClass) {
        const el = document.getElementById(id);
        if(el) {
            el.style.width = Math.min(pct, 100) + '%';
            el.className = `h-full rounded-full transition-all duration-1000 ${colorClass}`;
        }
    }
};