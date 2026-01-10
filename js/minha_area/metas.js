MinhaArea.Metas = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        // Pega o ano do filtro atual
        const { inicio } = MinhaArea.getDatasFiltro();
        const ano = new Date(inicio).getFullYear();

        try {
            // 1. Busca Produção Agrupada (Simulação de agrupamento via JS, pois Supabase não tem group by nativo simples no cliente)
            const { data: producoes } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', `${ano}-01-01`)
                .lte('data_referencia', `${ano}-12-31`);

            // 2. Busca Metas do ano
            const { data: metas } = await Sistema.supabase
                .from('metas')
                .select('mes, valor')
                .eq('usuario_id', uid)
                .eq('ano', ano);

            // 3. Consolida Dados (Jan-Dez)
            const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const dadosProducao = new Array(12).fill(0);
            const dadosMeta = new Array(12).fill(650 * 22); // Valor padrão inicial (ex: 14300)

            // Preenche Metas Reais
            if (metas) {
                metas.forEach(m => {
                    if(m.mes >= 1 && m.mes <= 12) dadosMeta[m.mes - 1] = m.valor;
                });
            }

            // Soma Produção por Mês
            if (producoes) {
                producoes.forEach(p => {
                    const mes = new Date(p.data_referencia).getMonth(); // 0 a 11
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
                        label: 'Minha Produção',
                        data: prod,
                        backgroundColor: '#2563eb', // Blue 600
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Meta',
                        data: metas,
                        type: 'line',
                        borderColor: '#059669', // Emerald 600
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
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};