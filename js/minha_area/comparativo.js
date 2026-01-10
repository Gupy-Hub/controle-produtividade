MinhaArea.Comparativo = {
    chart: null,
    init: function() { this.carregar(); },
    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, quantidade, usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (error) throw error;
            this.processar(data, uid);
        } catch(e) { console.error(e); }
    },
    processar: function(data, meuId) {
        const dias = {};
        data.forEach(r => {
            const dt = r.data_referencia;
            if(!dias[dt]) dias[dt] = { meu: 0, timeSoma: 0, count: 0 };
            dias[dt].timeSoma += r.quantidade; 
            // Para média precisa, o ideal é contar quantos usuários únicos produziram no dia
            // Aqui simplificamos incrementando count a cada registro (funciona se 1 reg por pessoa/dia)
            dias[dt].count++; 
            if(String(r.usuario_id) === String(meuId)) dias[dt].meu += r.quantidade;
        });
        const labels = Object.keys(dias).sort();
        const meuData = [], timeData = [];
        labels.forEach(dt => {
            const d = dias[dt];
            meuData.push(d.meu);
            timeData.push(d.count > 0 ? Math.round(d.timeSoma/d.count) : 0);
        });
        const labelsFmt = labels.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
        this.renderizar(labelsFmt, meuData, timeData);
    },
    renderizar: function(labels, meuData, timeData) {
        const ctx = document.getElementById('graficoComparativo');
        if(!ctx) return;
        if(this.chart) this.chart.destroy();
        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Você', data: meuData, backgroundColor: '#2563eb' },
                    { label: 'Média Time', data: timeData, backgroundColor: '#94a3b8' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
};