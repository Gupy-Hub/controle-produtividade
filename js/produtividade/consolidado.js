window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,
    chartInstance: null,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Engine V4 (Padronização)...");
        this.carregar(); // Renomeado de carregarDados
        this.initialized = true;
    },

    // FUNÇÃO RENOMEADA: carregarDados -> carregar (Para corrigir o erro do log)
    carregar: async function() {
        const container = document.getElementById('grafico-consolidado-container');
        
        // Busca datas do Filtros.js (com fallback de segurança)
        const datas = (Produtividade.Filtros && typeof Produtividade.Filtros.getDatas === 'function')
            ? Produtividade.Filtros.getDatas()
            : { inicio: new Date().toISOString().split('T')[0], fim: new Date().toISOString().split('T')[0] };

        const { inicio, fim } = datas;
        console.log(`📡 [CONSOLIDADO] Buscando de ${inicio} até ${fim}`);

        if (container) container.innerHTML = '<div class="flex h-64 items-center justify-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';

        try {
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: inicio, 
                    data_fim: fim 
                });

            if (error) throw error;

            console.log(`✅ Dados recebidos: ${data.length} linhas`);
            this.processarDados(data);

        } catch (error) {
            console.error(error);
            if (container) container.innerHTML = `<div class="text-center text-rose-500 py-10">Erro: ${error.message}</div>`;
        }
    },

    processarDados: function(data) {
        const assistentes = data.filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));

        let totalProducao = 0;
        let totalDias = 0;
        
        const ranking = assistentes.map(u => {
            totalProducao += Number(u.total_qty);
            totalDias += Number(u.total_dias_uteis);
            
            return {
                nome: u.nome.split(' ')[0], 
                total: Number(u.total_qty),
                meta: Number(u.meta_producao) * Number(u.total_dias_uteis), 
                atingimento: (Number(u.meta_producao) * Number(u.total_dias_uteis)) > 0 
                    ? (Number(u.total_qty) / (Number(u.meta_producao) * Number(u.total_dias_uteis)) * 100) 
                    : 0
            };
        });

        ranking.sort((a,b) => b.total - a.total);

        const elTotal = document.getElementById('kpi-consolidado-total');
        const elMedia = document.getElementById('kpi-consolidado-media');
        
        if(elTotal) elTotal.innerText = totalProducao.toLocaleString('pt-BR');
        if(elMedia) elMedia.innerText = totalDias > 0 ? Math.round(totalProducao / totalDias).toLocaleString('pt-BR') : 0;

        this.renderizarGrafico(ranking);
    },

    renderizarGrafico: function(dados) {
        const ctx = document.getElementById('grafico-consolidado');
        if (!ctx) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const labels = dados.map(d => d.nome);
        const valores = dados.map(d => d.total);
        const metas = dados.map(d => d.meta);
        const cores = dados.map(d => d.atingimento >= 100 ? '#10b981' : '#f43f5e');

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Produção Real',
                        data: valores,
                        backgroundColor: cores,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Meta Esperada',
                        data: metas,
                        type: 'line',
                        borderColor: '#94a3b8', 
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        order: 1,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR');
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }
};