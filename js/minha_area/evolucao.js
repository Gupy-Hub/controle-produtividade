MinhaArea.Evolucao = {
    chart: null,

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const hoje = new Date();
        // Pega últimos 30 dias para o gráfico ficar bonito
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().split('T')[0]; 
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
            console.error(err);
        }
    },

    renderizarGrafico: function(dados) {
        const canvas = document.getElementById('graficoEvolucaoPessoal');
        if (!canvas) return;
        
        if (this.chart) this.chart.destroy();

        const labels = dados.map(d => {
            const p = d.data_referencia.split('-'); return `${p[2]}/${p[1]}`;
        });
        const values = dados.map(d => d.quantidade);

        const ctx = canvas.getContext('2d');
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
                    tension: 0.4,
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