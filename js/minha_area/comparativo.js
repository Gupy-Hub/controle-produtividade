MinhaArea.Comparativo = {
    chartInstance: null,

    carregar: async function() {
        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;

        try {
            // 1. Busca TODA a produção do mês (para calcular média da equipe)
            const { data: todos, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            if(error) throw error;

            let somaUser = 0, diasUser = 0;
            let somaTeam = 0, diasTeam = 0;

            todos.forEach(d => {
                const fator = d.fator_multiplicador !== null ? d.fator_multiplicador : 1;
                if (fator <= 0) return; // Ignora dias de abono

                if (d.usuario_id === uid) {
                    somaUser += d.quantidade;
                    diasUser += 1; // Conta dias trabalhados (independente se foi 0.5 ou 1)
                } else {
                    somaTeam += d.quantidade;
                    diasTeam += 1;
                }
            });

            const mediaUser = diasUser > 0 ? Math.round(somaUser / diasUser) : 0;
            const mediaTeam = diasTeam > 0 ? Math.round(somaTeam / diasTeam) : 0;

            // Atualiza Textos
            document.getElementById('comp-media-user').innerText = mediaUser;
            document.getElementById('comp-media-team').innerText = mediaTeam;

            // Mensagem de Feedback
            const diff = mediaUser - mediaTeam;
            const icon = document.getElementById('comp-icon');
            const msg = document.getElementById('comp-msg');

            if (diff > 50) {
                icon.innerHTML = '<i class="fas fa-trophy text-emerald-500"></i>';
                msg.innerText = "Você está acima da média!";
                msg.className = "text-sm font-bold text-emerald-600";
            } else if (diff < -50) {
                icon.innerHTML = '<i class="fas fa-arrow-down text-red-500"></i>';
                msg.innerText = "Abaixo da média da equipe.";
                msg.className = "text-sm font-bold text-red-600";
            } else {
                icon.innerHTML = '<i class="fas fa-equals text-blue-500"></i>';
                msg.innerText = "Alinhado com a equipe.";
                msg.className = "text-sm font-bold text-blue-600";
            }

            this.renderizarGrafico(mediaUser, mediaTeam);

        } catch (e) { console.error(e); }
    },

    renderizarGrafico: function(user, team) {
        const ctx = document.getElementById('chart-comparativo').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Você', 'Média Equipe'],
                datasets: [{
                    label: 'Produção Média',
                    data: [user, team],
                    backgroundColor: ['#3b82f6', '#cbd5e1'],
                    borderRadius: 8,
                    barThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
};