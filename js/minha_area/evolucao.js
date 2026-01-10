MinhaArea.Evolucao = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;
            this.renderizarGrafico(data);
        } catch (err) {
            console.error(err);
        }
    },

    renderizarGrafico: function(dados) {
        const ctx = document.getElementById('graficoEvolucao');
        if (!ctx) return;
        if (this.chart) this.chart.destroy();

        const labels = dados.map(d => {
            const p = d.data_referencia.split('-'); return `${p[2]}/${p[1]}`;
        });
        const values = dados.map(d => d.quantidade);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Minha Produção',
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};