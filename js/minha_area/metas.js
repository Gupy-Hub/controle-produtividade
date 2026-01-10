MinhaArea.Metas = {
    chart: null,

    init: function() { this.carregar(); },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        // Na aba Metas/Evolução, geralmente queremos ver o ANO TODO para tendência,
        // mas vamos respeitar o filtro para consistência ou forçar Ano se preferir.
        // Aqui vou forçar ANO para mostrar a "Evolução" completa.
        const dateInput = document.getElementById('global-date');
        let ano = new Date().getFullYear();
        if(dateInput) ano = parseInt(dateInput.value.split('-')[0]);

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
        } catch (err) { console.error(err); }
    },

    renderizarGrafico: function(dadosMes) {
        const ctx = document.getElementById('graficoEvolucao');
        if(!ctx) return;
        if(this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [{
                    label: 'Minha Produção',
                    data: dadosMes,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
};