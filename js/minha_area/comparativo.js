MinhaArea.Comparativo = {
    chart: null,

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();

        try {
            // 1. Minha Produção no Período
            const { data: meusDados } = await Sistema.supabase
                .from('producao')
                .select('quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            const meuTotal = meusDados ? meusDados.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0) : 0;

            // 2. Produção do Time Inteiro no Período
            // Nota: Em produção real com muitos dados, use uma RPC (função SQL). Aqui faremos via JS.
            const { data: timeDados } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, quantidade')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            // Calcula Média do Time
            // Primeiro agrupa por usuário para saber o total de cada um
            const producaoPorUsuario = {};
            timeDados.forEach(d => {
                if(!producaoPorUsuario[d.usuario_id]) producaoPorUsuario[d.usuario_id] = 0;
                producaoPorUsuario[d.usuario_id] += (Number(d.quantidade) || 0);
            });

            const usuariosIds = Object.keys(producaoPorUsuario);
            const somaTime = Object.values(producaoPorUsuario).reduce((a, b) => a + b, 0);
            const mediaTime = usuariosIds.length > 0 ? Math.round(somaTime / usuariosIds.length) : 0;

            // Calcula Melhor do Time (Top Performer)
            const melhorDoTime = usuariosIds.length > 0 ? Math.max(...Object.values(producaoPorUsuario)) : 0;

            this.renderizarGrafico(meuTotal, mediaTime, melhorDoTime);

        } catch (err) {
            console.error("Erro comparativo:", err);
        }
    },

    renderizarGrafico: function(eu, media, melhor) {
        const ctx = document.getElementById('graficoComparativo');
        if (!ctx) return;

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Minha Produção', 'Média da Equipe', 'Gap para o Topo'],
                datasets: [{
                    data: [eu, media, Math.max(0, melhor - eu)],
                    backgroundColor: [
                        '#2563eb', // Eu (Azul)
                        '#94a3b8', // Média (Cinza)
                        '#f1f5f9'  // Gap (Claro)
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom' },
                    title: { display: true, text: 'Posicionamento no Período' }
                }
            }
        });
    }
};