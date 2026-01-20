Produtividade.Performance = {
    chartInstance: null,
    dadosCache: [],

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const datas = Produtividade.getDatasFiltro();
        try {
            // Buscando dados incluindo a relação com assertividade detalhada se houver
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    quantidade, data_referencia, assertividade,
                    usuario:usuarios ( id, nome, funcao )
                `)
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim);

            if (error) throw error;
            this.dadosCache = data;
            this.processarEletivas();
        } catch (err) {
            console.error("Erro na Performance:", err);
        }
    },

    processarEletivas: function() {
        const stats = {};
        const empresaErros = {};

        this.dadosCache.forEach(r => {
            if (!r.usuario || ['AUDITORA', 'GESTORA'].includes(r.usuario.funcao?.toUpperCase())) return;

            const uid = r.usuario.id;
            if (!stats[uid]) {
                stats[uid] = { 
                    nome: r.usuario.nome, 
                    totalProd: 0, 
                    somaAssert: 0, 
                    contagem: 0,
                    errosEstimados: 0
                };
            }

            const qtd = Number(r.quantidade) || 0;
            const asserNum = parseFloat(String(r.assertividade).replace('%', '').replace(',', '.')) || 0;

            stats[uid].totalProd += qtd;
            stats[uid].somaAssert += asserNum;
            stats[uid].contagem++;
            // Cálculo de erro: se assertividade é 90%, erros = 10% da produção
            stats[uid].errosEstimados += (qtd * (100 - asserNum)) / 100;
        });

        const listaFinal = Object.values(stats).map(u => ({
            ...u,
            mediaAssert: u.somaAssert / u.contagem
        }));

        this.renderRankings(listaFinal);
        this.renderScatterChart(listaFinal);
        this.renderDiagnostico(listaFinal);
    },

    renderRankings: function(dados) {
        // Ordenar por Produção e Assertividade (Score Misto)
        const ranking = [...dados].sort((a, b) => (b.totalProd * b.mediaAssert) - (a.totalProd * a.mediaAssert));
        
        const top3 = ranking.slice(0, 3);
        const bottom3 = ranking.slice(-3).reverse();

        const renderCard = (u, color) => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-700">${u.nome}</span>
                    <span class="text-[10px] text-slate-500">${u.totalProd.toLocaleString()} docs</span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-black text-${color}-600">${u.mediaAssert.toFixed(1)}%</span>
                    <p class="text-[9px] text-slate-400 uppercase font-bold">Assertividade</p>
                </div>
            </div>
        `;

        document.getElementById('top-3-container').innerHTML = top3.map(u => renderCard(u, 'emerald')).join('');
        document.getElementById('bottom-3-container').innerHTML = bottom3.map(u => renderCard(u, 'rose')).join('');
    },

    renderScatterChart: function(dados) {
        const ctx = document.getElementById('performanceScatterChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        this.chartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Assistentes',
                    data: dados.map(u => ({ x: u.totalProd, y: u.mediaAssert, label: u.nome })),
                    backgroundColor: '#3b82f6',
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Volume de Produção', font: { size: 10, weight: 'bold' } } },
                    y: { 
                        min: 80, max: 100,
                        title: { display: true, text: 'Assertividade %', font: { size: 10, weight: 'bold' } } 
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.label}: ${ctx.raw.x} docs | ${ctx.raw.y.toFixed(1)}%`
                        }
                    }
                }
            }
        });
    },

    renderDiagnostico: function(dados) {
        const totalErros = dados.reduce((acc, u) => acc + u.errosEstimados, 0);
        const assistenteMaisErros = [...dados].sort((a, b) => b.errosEstimados - a.errosEstimados)[0];
        
        document.getElementById('diagnostico-qualidade').innerHTML = `
            <div class="p-3 bg-slate-800 rounded border-l-4 border-blue-500">
                <p class="italic">"A estimativa de retrabalho do período é de <b>${Math.round(totalErros)} documentos</b>. 
                O assistente <b>${assistenteMaisErros?.nome.split(' ')[0]}</b> apresenta o maior volume absoluto de divergências, 
                indicando necessidade de reciclagem técnica."</p>
            </div>
        `;
    }
};