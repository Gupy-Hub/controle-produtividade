MinhaArea.Comparativo = {
    chart: null,

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

        try {
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
            if (!dias[dt]) dias[dt] = { meu: 0, timeSoma: 0, timeCount: 0, users: new Set() };
            
            dias[dt].timeSoma += r.quantidade;
            dias[dt].users.add(r.usuario_id);

            if (r.usuario_id == meuId) {
                dias[dt].meu += r.quantidade;
            }
        });

        const labelsRaw = Object.keys(dias).sort();
        const labels = labelsRaw.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
        const meuData = [];
        const timeData = [];

        labelsRaw.forEach(dt => {
            const d = dias[dt];
            meuData.push(d.meu);
            const count = d.users.size;
            timeData.push(count > 0 ? Math.round(d.timeSoma / count) : 0);
        });

        this.renderizarGrafico(labels, meuData, timeData);
    },

    renderizarGrafico: function(labels, meuData, timeData) {
        const canvas = document.getElementById('graficoComparativoPessoal');
        if (!canvas) return;
        
        if (this.chart) this.chart.destroy();

        const ctx = canvas.getContext('2d');
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