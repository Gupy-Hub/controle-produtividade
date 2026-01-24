/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: Otimização de Query (Select específico) e Remoção de Filtros de Banco para paridade com Produtividade
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    carregar: async function() {
        console.log("🚀 Metas: Iniciando carregamento otimizado...");
        const uid = MinhaArea.getUsuarioAlvo(); // ID ou null (Visão Geral)
        const isGeral = (uid === null);

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // --- 1. Buscas de Dados (Produção e Metas) ---
            let qProducao = Sistema.supabase.from('producao')
                .select('*') // Produção precisa de todos os campos para cálculo de fator
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);
            
            if (!isGeral) qProducao = qProducao.eq('usuario_id', uid);

            let qMetas = Sistema.supabase.from('metas')
                .select('mes, ano, meta, meta_assertividade')
                .gte('ano', anoInicio)
                .lte('ano', anoFim);
            
            if (!isGeral) qMetas = qMetas.eq('usuario_id', uid);

            const [prodRes, metasRes] = await Promise.all([qProducao, qMetas]);

            if (prodRes.error) throw prodRes.error;

            // --- 2. Busca OTIMIZADA de Auditoria ---
            // Baixamos tudo (sem filtrar auditora no banco) para garantir que temos todos os registros
            // Igualamos a lógica da aba "Produtividade"
            const assertData = await this.buscarTodosAuditados(uid, inicio, fim);
            console.log(`📦 Metas: Total de auditorias processadas: ${assertData.length}`);

            // --- 3. Processamento e Agregação ---

            // A) Map de Metas
            const mapMetas = {};
            (metasRes.data || []).forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                if (!mapMetas[m.ano][m.mes]) mapMetas[m.ano][m.mes] = { prod: 0, assert: 0 };
                
                mapMetas[m.ano][m.mes].prod += Number(m.meta);
                
                // Na visão geral, mantemos 98% fixo como referência, ou média se preferir
                if (isGeral) {
                    mapMetas[m.ano][m.mes].assert = 98.0;
                } else {
                    mapMetas[m.ano][m.mes].assert = Number(m.meta_assertividade);
                }
            });

            // B) Map de Produção
            const mapProd = new Map();
            if (isGeral) {
                (prodRes.data || []).forEach(p => {
                    const data = p.data_referencia;
                    if (!mapProd.has(data)) {
                        mapProd.set(data, { quantidade: 0, fator_soma: 0, fator_count: 0, fator: 0 });
                    }
                    const reg = mapProd.get(data);
                    reg.quantidade += Number(p.quantidade || 0);
                    reg.fator_soma += Number(p.fator || 1);
                    reg.fator_count++;
                });
                for (let [key, val] of mapProd) {
                    val.fator = val.fator_count > 0 ? (val.fator_soma / val.fator_count) : 1.0;
                }
            } else {
                (prodRes.data || []).forEach(p => mapProd.set(p.data_referencia, p));
            }

            // C) Map de Assertividade
            const mapAssert = new Map();
            // Status que realmente não devem contar (alinhar com Produtividade)
            const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA']; 

            assertData.forEach(a => {
                const dataKey = a.data_referencia; 
                if (!dataKey) return;

                const status = (a.status || '').toUpperCase();
                
                // Filtro aplicado via código (mais seguro que via banco neste caso)
                if (STATUS_IGNORAR.includes(status)) return; 

                if(!mapAssert.has(dataKey)) mapAssert.set(dataKey, []);
                
                let valStr = String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.');
                let val = parseFloat(valStr);
                
                if (!isNaN(val)) {
                    mapAssert.get(dataKey).push(val);
                }
            });

            // --- 4. Construção dos Gráficos ---
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

                const metaConfig = mapMetas[ano]?.[mes] || { prod: (isGeral ? 6500 : 650), assert: 98.0 };
                
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

            // --- 5. Renderização ---
            // Passamos os dados brutos para o cálculo dos KPIs
            this.atualizarCardsKPI(mapProd, assertData, mapMetas, dtInicio, dtFim, isGeral);

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação (Docs)', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade (%)', '#059669', true);

        } catch (err) {
            console.error("❌ Erro Metas:", err);
        }
    },

    buscarTodosAuditados: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        const size = 1000; // Tamanho do lote
        let continuar = true;

        console.log(`🔄 Iniciando download de auditorias... (Lotes de ${size})`);

        while(continuar) {
            // Selecionamos APENAS as colunas necessárias para ficar leve e rápido
            let query = Sistema.supabase
                .from('assertividade')
                .select('data_referencia, porcentagem_assertividade, status, auditora_nome, qtd_nok') 
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .range(page * size, (page + 1) * size - 1);
            
            // Se for individual, filtra. Se for geral, pega tudo.
            if (uid) {
                query = query.eq('usuario_id', uid);
            }

            const { data, error } = await query;

            if(error) {
                console.error("Erro paginação:", error);
                throw error;
            }

            if (!data || data.length === 0) {
                continuar = false;
            } else {
                todos = todos.concat(data);
                // console.log(`📥 Página ${page} baixada: ${data.length} registros.`);
                
                if(data.length < size) {
                    continuar = false; // Fim dos dados
                } else {
                    page++;
                }
            }
        }
        return todos;
    },

    atualizarCardsKPI: function(mapProd, asserts, mapMetas, dtInicio, dtFim, isGeral) {
        let totalValidados = 0; 
        let totalMeta = 0;
        
        let somaAssertMedia = 0;
        let qtdAssertMedia = 0;
        
        let totalErros = 0; 

        const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

        let tempDate = new Date(dtInicio);
        
        for (let d = new Date(tempDate); d <= dtFim; d.setDate(d.getDate() + 1)) {
            const isFDS = (d.getDay() === 0 || d.getDay() === 6);
            const dataStr = d.toISOString().split('T')[0];
            const ano = d.getFullYear();
            const mes = d.getMonth() + 1;
            
            const metaConfig = mapMetas[ano]?.[mes] || { prod: (isGeral ? 6500 : 650), assert: 98.0 };

            const prodDia = mapProd.get(dataStr);
            const fator = prodDia ? Number(prodDia.fator) : (isFDS ? 0 : 1);
            
            if (prodDia) {
                totalValidados += Number(prodDia.quantidade || 0);
            }
            totalMeta += Math.round(metaConfig.prod * (isNaN(fator)?1:fator));
        }

        asserts.forEach(a => {
            const status = (a.status || '').toUpperCase();
            
            if (!STATUS_IGNORAR.includes(status)) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { 
                    somaAssertMedia += val; 
                    qtdAssertMedia++; 
                }
            }
            
            if (a.qtd_nok && Number(a.qtd_nok) > 0) {
                totalErros++;
            }
        });

        const mediaAssert = qtdAssertMedia > 0 ? (somaAssertMedia / qtdAssertMedia) : 0;
        const totalAuditados = asserts.length; 
        
        // Ajuste visual para evitar número negativo se a base estiver desincronizada
        const semAuditoria = Math.max(0, totalValidados - totalAuditados);
        const totalAcertos = totalAuditados - totalErros;

        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-blue-600');

        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        const metaAssertRef = 98.0; 
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-emerald-500' : 'bg-rose-500');

        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
        
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-total-nok', totalErros.toLocaleString('pt-BR')); 
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