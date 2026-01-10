MinhaArea.Metas = {
    chart: null,

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        // Pega o ano da data global
        const dateInput = document.getElementById('global-date');
        let ano = new Date().getFullYear();
        if(dateInput && dateInput.value) ano = parseInt(dateInput.value.split('-')[0]);

        const inicio = `${ano}-01-01`;
        const fim = `${ano}-12-31`;

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;
            
            // Agrega por Mês
            const meses = new Array(12).fill(0);
            data.forEach(r => {
                const mesIdx = parseInt(r.data_referencia.split('-')[1]) - 1;
                if(mesIdx >= 0 && mesIdx < 12) meses[mesIdx] += r.quantidade;
            });

            this.renderizarGrafico(meses);

        } catch (err) {
            console.error(err);
        }
    },

    renderizarGrafico: function(valoresMeses) {
        const canvas = document.getElementById('graficoEvolucao');
        if (!canvas) return;
        
        if (this.chart) this.chart.destroy();

        const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        const ctx = canvas.getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Produção Mensal',
                    data: valoresMeses,
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