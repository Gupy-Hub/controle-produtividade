MinhaArea.Metas = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio } = MinhaArea.getDatasFiltro();
        const ano = new Date(inicio).getFullYear();

        try {
            const { data: producoes } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', `${ano}-01-01`)
                .lte('data_referencia', `${ano}-12-31`);

            const { data: metas } = await Sistema.supabase
                .from('metas')
                .select('mes, meta')
                .eq('usuario_id', uid)
                .eq('ano', ano);

            const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const dadosProducao = new Array(12).fill(0);
            
            // Padrão 650 * 22 dias se não houver meta
            const dadosMeta = new Array(12).fill(650 * 22);

            if (metas) {
                metas.forEach(m => {
                    // CORREÇÃO: Multiplica meta diária (ex: 450) por 22 para projetar o mês no gráfico
                    if(m.mes >= 1 && m.mes <= 12) dadosMeta[m.mes - 1] = m.meta * 22;
                });
            }

            if (producoes) {
                producoes.forEach(p => {
                    const mes = new Date(p.data_referencia).getMonth();
                    dadosProducao[mes] += (Number(p.quantidade) || 0);
                });
            }

            this.renderizarGrafico(labels, dadosProducao, dadosMeta);

        } catch (err) {
            console.error("Erro metas:", err);
        }
    },

    renderizarGrafico: function(labels, prod, metas) {
        const ctx = document.getElementById('graficoEvolucao');
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
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Meta Projetada (x22 dias)',
                        data: metas,
                        type: 'line',
                        borderColor: '#059669',
                        borderWidth: 2,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#059669',
                        pointRadius: 4,
                        tension: 0.3,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};