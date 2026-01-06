MinhaArea.Evolucao = {
    chartInstance: null,

    carregar: async function() {
        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;

        try {
            // Busca dados
            const { data: producao } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia');

            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // Prepara datasets
            const labels = [];
            const dataProd = [];
            const dataMeta = [];

            producao.forEach(p => {
                const dia = p.data_referencia.split('-')[2]; // Pega só o dia
                labels.push(dia);
                dataProd.push(p.quantidade);

                // Acha meta
                const m = metas.find(x => x.data_inicio <= p.data_referencia) || { valor_meta: 0 };
                const fator = p.fator_multiplicador !== null ? p.fator_multiplicador : 1;
                dataMeta.push(Math.round(m.valor_meta * fator));
            });

            this.renderizarGrafico(labels, dataProd, dataMeta);

        } catch (e) { console.error(e); }
    },

    renderizarGrafico: function(labels, prod, meta) {
        const ctx = document.getElementById('chart-evolucao').getContext('2d');
        
        if (this.chartInstance) this.chartInstance.destroy();

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Minha Produção',
                        data: prod,
                        borderColor: '#2563eb', // Blue 600
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 3,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Meta Diária',
                        data: meta,
                        borderColor: '#94a3b8', // Slate 400
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
};