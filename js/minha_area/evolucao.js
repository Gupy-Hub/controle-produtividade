MinhaArea.Evolucao = {
    chart: null,

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        // Data Atual (Mês) - Simplificado para Mês Atual
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

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
            console.error("Erro Evolução:", err);
        }
    },

    renderizarGrafico: function(dados) {
        const ctx = document.getElementById('graficoEvolucao');
        if (!ctx) return;

        if (this.chart) this.chart.destroy();

        const labels = dados.map(d => {
            const parts = d.data_referencia.split('-');
            return `${parts[2]}/${parts[1]}`;
        });
        const values = dados.map(d => d.quantidade);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Minha Produção',
                    data: values,
                    borderColor: '#2563eb', // Blue 600
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};