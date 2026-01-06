Produtividade.Performance = {
    init: function() {
        this.carregarRanking();
    },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Calculando...</td></tr>';

        try {
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)');

            if (error) throw error;

            // Agrupa e Soma
            const ranking = {};
            let totalTime = 0;
            let diasTotaisSomados = 0;

            data.forEach(d => {
                const uid = d.usuario_id;
                if(!ranking[uid]) ranking[uid] = { nome: d.usuarios.nome, total: 0, dias: 0 };
                ranking[uid].total += d.quantidade;
                ranking[uid].dias += (d.fator_multiplicador || 1);
                
                totalTime += d.quantidade;
            });

            const arrayRank = Object.values(ranking).sort((a, b) => b.total - a.total);
            const qtdAssistentes = arrayRank.length;

            // --- CÁLCULO DOS CARDS (KPIs) ---
            // 1. Campeão
            if (arrayRank.length > 0) {
                const campeao = arrayRank[0];
                document.getElementById('perf-kpi-campeao').innerText = campeao.nome;
                document.getElementById('perf-kpi-campeao-val').innerText = `${campeao.total.toLocaleString('pt-BR')} docs`;
            } else {
                document.getElementById('perf-kpi-campeao').innerText = "-";
                document.getElementById('perf-kpi-campeao-val').innerText = "";
            }

            // 2. Total Time
            document.getElementById('perf-kpi-total').innerText = totalTime.toLocaleString('pt-BR');

            // 3. Média por Assistente (Total / N Pessoas)
            const mediaGeral = qtdAssistentes > 0 ? Math.round(totalTime / qtdAssistentes) : 0;
            document.getElementById('perf-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR');


            // --- RENDERIZA TABELA ---
            let html = '';
            arrayRank.forEach((u, index) => {
                const media = u.dias > 0 ? Math.round(u.total / u.dias) : 0;
                let medalha = '';
                if(index === 0) medalha = '🥇';
                if(index === 1) medalha = '🥈';
                if(index === 2) medalha = '🥉';

                html += `<tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="px-6 py-3 font-bold text-slate-500">${index + 1} ${medalha}</td>
                    <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-6 py-3 text-center font-black text-blue-700">${u.total}</td>
                    <td class="px-6 py-3 text-center">${u.dias.toFixed(1)}</td>
                    <td class="px-6 py-3 text-center text-emerald-600 font-bold">${media}</td>
                    <td class="px-6 py-3 text-center text-slate-400">-</td>
                    <td class="px-6 py-3 text-center text-slate-400">-</td>
                </tr>`;
            });
            tbody.innerHTML = html || '<tr><td colspan="7" class="text-center py-4">Sem dados.</td></tr>';

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500">${e.message}</td></tr>`;
        }
    }
};