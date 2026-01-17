MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // 1. Buscas Otimizadas
            const [prodRes, assertRes, metasRes] = await Promise.all([
                // Produção: Trazemos tudo para somar o volume total validado
                Sistema.supabase.from('producao').select('*').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim),
                
                // Assertividade: FILTRAGEM NO BANCO (Traz apenas quem TEM auditora preenchida)
                // Isso evita baixar as 14 mil linhas vazias e resolve o problema do limite de 1000
                Sistema.supabase
                    .from('assertividade')
                    .select('*')
                    .eq('usuario_id', uid)
                    .gte('data_auditoria', inicio)
                    .lte('data_auditoria', fim)
                    .neq('auditora', null) // Filtra nulos
                    .neq('auditora', '')   // Filtra vazios
                    .limit(10000),         // Limite de segurança aumentado
                
                Sistema.supabase.from('metas').select('mes, ano, meta, meta_assertividade').eq('usuario_id', uid).gte('ano', anoInicio).lte('ano', anoFim)
            ]);

            if (prodRes.error) throw prodRes.error;
            if (assertRes.error) throw assertRes.error;

            // 2. Mapas e Estruturas
            const mapMetas = {};
            (metasRes.data || []).forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                mapMetas[m.ano][m.mes] = { prod: Number(m.meta), assert: Number(m.meta_assertividade) };
            });

            const mapProd = new Map();
            (prodRes.data || []).forEach(p => mapProd.set(p.data_referencia, p));

            const mapAssert = new Map();
            // Como já filtramos no banco, tudo que veio aqui É auditado
            (assertRes.data || []).forEach(a => {
                if(!mapAssert.has(a.data_auditoria)) mapAssert.set(a.data_auditoria, []);
                let val = String(a.porcentagem).replace('%','').replace(',','.');
                mapAssert.get(a.data_auditoria).push(parseFloat(val));
            });

            // 3. Processamento para Gráficos
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            
            const labels = [];
            const dataProdReal = [];
            const dataProdMeta = [];
            const dataAssertReal = [];
            const dataAssertMeta = [];

            const aggMensal = new Map(); 
            const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

            // Loop Calendário
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
                        const mediaDia = assertsDia.reduce((a,b)=>a+b,0) / assertsDia.length;
                        dataAssertReal.push(mediaDia);
                    } else {
                        dataAssertReal.push(null);
                    }
                    dataAssertMeta.push(metaConfig.assert);
                }
            }

            if (modoMensal) {
                for (const [key, val] of aggMensal.entries()) {
                    labels.push(val.label); 
                    dataProdReal.push(val.prodReal);
                    dataProdMeta.push(val.prodMeta);
                    const mediaMensal = val.assertQtd > 0 ? (val.assertSoma / val.assertQtd) : null; 
                    dataAssertReal.push(mediaMensal);
                    dataAssertMeta.push(val.assertMetaSoma); 
                }
            }

            // 6. Atualização dos Cards
            this.atualizarCardsKPI(prodRes.data, assertRes.data, mapMetas, dtInicio, dtFim);

            // 7. Renderiza Gráficos
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');

            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação (Docs)', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade (%)', '#059669', true);

        } catch (err) {
            console.error("Erro Metas:", err);
        }
    },

    atualizarCardsKPI: function(prods, asserts, mapMetas, dtInicio, dtFim) {
        let totalValidados = 0; 
        let totalMeta = 0;
        let somaAssert = 0, qtdAssert = 0;
        
        const mapProd = new Map();
        (prods || []).forEach(p => mapProd.set(p.data_referencia, p));

        // 1. Calcula Validados (Produção)
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

        // 2. Calcula Auditados (Apenas contar o array, pois já foi filtrado no banco)
        const totalAuditados = (asserts || []).length;

        // 3. Calcula Média Assertividade
        (asserts || []).forEach(a => {
            let val = parseFloat(String(a.porcentagem).replace('%','').replace(',','.'));
            if(!isNaN(val)) { somaAssert += val; qtdAssert++; }
        });

        const mediaAssert = qtdAssert > 0 ? (somaAssert / qtdAssert) : 0;
        
        // --- ATUALIZAÇÃO DA INTERFACE ---

        // Card 1: Validação
        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-blue-600');

        // Card 2: Assertividade
        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2})+'%');
        const metaAssertRef = 98.0; 
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 1})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-emerald-500' : 'bg-rose-500');

        // Card 3: Auditoria
        // Lógica: Validados (Total) - Auditados (Amostra) = Sem Auditoria
        const semAuditoria = Math.max(0, totalValidados - totalAuditados);

        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
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
                        tension: 0.3,
                        order: 1
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
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta','auditoria-total-validados','auditoria-total-auditados','auditoria-sem-audit'].forEach(id => this.setTxt(id, '--'));
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