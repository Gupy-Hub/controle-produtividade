MinhaArea.Comparativo = {
    chart: null,

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        // Mês Atual
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

        try {
            // Busca TUDO do mês (Time inteiro)
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
        let meuTotal = 0;
        let timeTotal = 0;
        let meusDias = 0;

        // Agrega dados
        data.forEach(r => {
            const dt = r.data_referencia;
            if (!dias[dt]) dias[dt] = { meu: 0, timeSoma: 0, timeCount: 0 };
            
            dias[dt].timeSoma += r.quantidade;
            dias[dt].timeCount += 1;
            timeTotal += r.quantidade;

            if (r.usuario_id == meuId) {
                dias[dt].meu += r.quantidade;
                meuTotal += r.quantidade;
                meusDias++;
            }
        });

        // Ordena datas
        const labels = Object.keys(dias).sort();
        const meuData = [];
        const timeData = [];

        labels.forEach(dt => {
            const d = dias[dt];
            meuData.push(d.meu);
            // Média do time no dia
            timeData.push(d.timeCount > 0 ? Math.round(d.timeSoma / d.timeCount) : 0);
        });

        // Atualiza Cards
        const elMeuTotal = document.getElementById('comp-meu-total');
        if(elMeuTotal) elMeuTotal.innerText = meuTotal.toLocaleString();
        
        const elMinhaMedia = document.getElementById('comp-minha-media');
        if(elMinhaMedia) elMinhaMedia.innerText = meusDias > 0 ? Math.round(meuTotal/meusDias) : 0;

        const uniqueUsers = new Set(data.map(r => r.usuario_id)).size;
        const mediaTimeTotal = uniqueUsers > 0 ? Math.round(timeTotal / uniqueUsers) : 0;
        const elTimeTotal = document.getElementById('comp-time-total');
        if(elTimeTotal) elTimeTotal.innerText = mediaTimeTotal.toLocaleString();

        this.renderizarGrafico(labels, meuData, timeData);
    },

    renderizarGrafico: function(labelsRaw, meuData, timeData) {
        const ctx = document.getElementById('graficoComparativo');
        if (!ctx) return;
        if (this.chart) this.chart.destroy();

        const labels = labelsRaw.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Você',
                        data: meuData,
                        backgroundColor: '#2563eb',
                        borderRadius: 4
                    },
                    {
                        label: 'Média Time',
                        data: timeData,
                        backgroundColor: '#94a3b8',
                        borderRadius: 4
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