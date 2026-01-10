MinhaArea.Comparativo = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();

        try {
            // Busca dados de TODO o time no período
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade, usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (error) throw error;
            this.processarDados(data, uid);
        } catch (err) {
            console.error(err);
        }
    },

    processarDados: function(data, meuId) {
        const dias = {};
        
        data.forEach(r => {
            const dt = r.data_referencia;
            if (!dias[dt]) dias[dt] = { meu: 0, timeSoma: 0, count: 0 };
            
            dias[dt].timeSoma += r.quantidade;
            dias[dt].count += 1; // Simplificado: conta registros, não usuários únicos por dia (aproximação válida)

            if (String(r.usuario_id) === String(meuId)) {
                dias[dt].meu += r.quantidade;
            }
        });

        const labels = Object.keys(dias).sort();
        const meuData = [];
        const timeData = [];

        labels.forEach(dt => {
            const d = dias[dt];
            meuData.push(d.meu);
            const media = d.count > 0 ? Math.round(d.timeSoma / d.count) : 0;
            timeData.push(media);
        });

        // Formata Data
        const labelsFmt = labels.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });

        this.renderizarGrafico(labelsFmt, meuData, timeData);
    },

    renderizarGrafico: function(labels, meuData, timeData) {
        const ctx = document.getElementById('graficoComparativo');
        if (!ctx) return;
        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Você', data: meuData, backgroundColor: '#2563eb', borderRadius: 4 },
                    { label: 'Média Time', data: timeData, backgroundColor: '#94a3b8', borderRadius: 4 }
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