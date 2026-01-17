// ARQUIVO: js/minha_area/metas.js
MinhaArea.Metas = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        // 1. Prepara Datas e Reset
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // 2. Buscas (Produção, Metas, Assertividade)
            const [prodRes, assertRes, metasRes] = await Promise.all([
                Sistema.supabase.from('producao').select('*').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim),
                Sistema.supabase.from('assertividade').select('data_auditoria, porcentagem').eq('usuario_id', uid).gte('data_auditoria', inicio).lte('data_auditoria', fim).not('porcentagem', 'is', null).neq('porcentagem', ''),
                Sistema.supabase.from('metas').select('mes, ano, meta, meta_assertividade').eq('usuario_id', uid).gte('ano', anoInicio).lte('ano', anoFim)
            ]);

            if (prodRes.error) throw prodRes.error;
            if (assertRes.error) throw assertRes.error;

            // 3. Organização dos Dados
            const mapMetas = {};
            (metasRes.data || []).forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                mapMetas[m.ano][m.mes] = { prod: Number(m.meta), assert: Number(m.meta_assertividade) };
            });

            const mapProd = new Map();
            prodRes.data.forEach(p => mapProd.set(p.data_referencia, p));

            // 4. Cálculo dos Acumulados
            let totalReal = 0, totalMetaEsperada = 0, totalFator = 0;
            let somaAssert = 0, qtdAssert = 0;
            let somaMetaAssert = 0, diasMetaAssert = 0;

            // Para o gráfico
            const labelsGrafico = [];
            const dataRealGrafico = [];
            const dataMetaGrafico = [];
            
            // Define granularidade do gráfico (Se diff > 35 dias -> Mensal, senão Diário)
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            
            const acumuladorGrafico = new Map(); // Chave: "YYYY-MM" ou "YYYY-MM-DD"

            // Loop Calendário
            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                // Pula FDS apenas no cálculo de metas esperadas vazias, mas se tiver produção no FDS, conta.
                const isFDS = (d.getDay() === 0 || d.getDay() === 6);
                
                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;
                
                // Meta Configurada (ou padrão)
                const metaConfig = mapMetas[ano]?.[mes] || { prod: 650, assert: 98.0 };
                
                // Dados Reais
                const prodDia = mapProd.get(dataStr);
                let qtd = 0, fator = 0;

                if (prodDia) {
                    qtd = Number(prodDia.quantidade || 0);
                    fator = Number(prodDia.fator);
                    if (isNaN(fator)) fator = 1.0;
                } else if (!isFDS) {
                    // Sem dados e dia útil: Meta cheia, Real 0
                    fator = 1.0; 
                }

                // Acumula Gerais
                const metaDia = Math.round(metaConfig.prod * fator);
                totalReal += qtd;
                totalMetaEsperada += metaDia;
                if (prodDia) totalFator += fator; // Soma fator apenas se trabalhado

                // Acumula Meta Assertividade (para média ponderada da meta)
                if (!isFDS || prodDia) {
                    somaMetaAssert += metaConfig.assert;
                    diasMetaAssert++;
                }

                // Agrega para Gráfico
                const chaveGrafico = modoMensal ? `${ano}-${String(mes).padStart(2,'0')}` : `${String(d.getDate()).padStart(2,'0')}/${String(mes).padStart(2,'0')}`;
                
                if (!acumuladorGrafico.has(chaveGrafico)) acumuladorGrafico.set(chaveGrafico, { real: 0, meta: 0 });
                const slot = acumuladorGrafico.get(chaveGrafico);
                slot.real += qtd;
                slot.meta += metaDia;
            }

            // Cálculo Assertividade Realizada
            assertRes.data.forEach(a => {
                let val = String(a.porcentagem).replace('%','').replace(',','.');
                val = parseFloat(val);
                if (!isNaN(val)) {
                    somaAssert += val;
                    qtdAssert++;
                }
            });

            // 5. Atualização da Interface (Cards)
            
            // Assertividade
            const mediaAssertReal = qtdAssert > 0 ? (somaAssert / qtdAssert) : 0;
            const mediaAssertMeta = diasMetaAssert > 0 ? (somaMetaAssert / diasMetaAssert) : 98.0;
            
            this.setTxt('meta-assert-real', mediaAssertReal.toLocaleString('pt-BR', {minimumFractionDigits: 2}) + '%');
            this.setTxt('meta-assert-meta', mediaAssertMeta.toLocaleString('pt-BR', {minimumFractionDigits: 1}) + '%');
            
            const barAssert = document.getElementById('bar-meta-assert');
            if(barAssert) {
                const pctBar = (mediaAssertReal / mediaAssertMeta) * 100;
                barAssert.style.width = Math.min(pctBar, 100) + '%';
                barAssert.className = `h-full rounded-full transition-all duration-1000 ${mediaAssertReal >= mediaAssertMeta ? 'bg-emerald-500' : 'bg-rose-500'}`;
            }

            // Produtividade
            this.setTxt('meta-prod-real', totalReal.toLocaleString('pt-BR'));
            this.setTxt('meta-prod-meta', totalMetaEsperada.toLocaleString('pt-BR'));
            
            const barProd = document.getElementById('bar-meta-prod');
            if(barProd) {
                const pctBar = totalMetaEsperada > 0 ? (totalReal / totalMetaEsperada) * 100 : 0;
                barProd.style.width = Math.min(pctBar, 100) + '%';
                barProd.className = `h-full rounded-full transition-all duration-1000 ${pctBar >= 100 ? 'bg-blue-600' : (pctBar >= 80 ? 'bg-blue-400' : 'bg-rose-400')}`;
            }

            // Acumulado
            this.setTxt('meta-acum-total', totalReal.toLocaleString('pt-BR'));
            const mediaDiaria = totalFator > 0 ? Math.round(totalReal / totalFator) : 0;
            this.setTxt('meta-acum-media', mediaDiaria.toLocaleString('pt-BR'));
            this.setTxt('meta-acum-dias', totalFator.toLocaleString('pt-BR', {maximumFractionDigits: 1}));

            // 6. Renderização do Gráfico
            acumuladorGrafico.forEach((val, key) => {
                labelsGrafico.push(key);
                dataRealGrafico.push(val.real);
                dataMetaGrafico.push(val.meta);
            });

            this.setTxt('meta-periodo-label', modoMensal ? 'Mensal' : 'Diária');
            this.renderizarGrafico(labelsGrafico, dataRealGrafico, dataMetaGrafico, modoMensal);

        } catch (err) {
            console.error("Erro Metas:", err);
        }
    },

    renderizarGrafico: function(labels, prod, metas, modoMensal) {
        const ctx = document.getElementById('graficoEvolucaoMeta');
        if (!ctx) return;
        
        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Produção Realizada',
                        data: prod,
                        backgroundColor: '#2563eb', // Blue 600
                        borderRadius: 4,
                        barPercentage: 0.6,
                        order: 2
                    },
                    {
                        label: 'Meta Esperada',
                        data: metas,
                        type: 'line',
                        borderColor: '#059669', // Emerald 600
                        borderWidth: 2,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#059669',
                        pointRadius: modoMensal ? 4 : 2,
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
                                return ctx.dataset.label + ': ' + ctx.raw.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    },

    resetarCards: function() {
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta','meta-acum-total','meta-acum-media','meta-acum-dias'].forEach(id => this.setTxt(id, '--'));
        ['bar-meta-assert','bar-meta-prod'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};