Produtividade.Performance = {
    init: function() {
        this.carregarRanking();
    },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Calculando ranking...</td></tr>';

        try {
            // Busca todo o histórico para ranking (poderia filtrar por mês)
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .order('quantidade', { ascending: false });

            if (error) throw error;

            // Agrupa
            const ranking = {};
            data.forEach(d => {
                const uid = d.usuario_id;
                if(!ranking[uid]) ranking[uid] = { nome: d.usuarios.nome, total: 0, dias: 0 };
                ranking[uid].total += d.quantidade;
                ranking[uid].dias += (d.fator_multiplicador || 1);
            });

            // Converte para array e ordena
            const arrayRank = Object.values(ranking).sort((a, b) => b.total - a.total);

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
                    <td class="px-6 py-3 text-center">${u.dias}</td>
                    <td class="px-6 py-3 text-center text-emerald-600 font-bold">${media}</td>
                    <td class="px-6 py-3 text-center">-</td>
                    <td class="px-6 py-3 text-center">-</td>
                </tr>`;
            });
            tbody.innerHTML = html;

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500">${e.message}</td></tr>`;
        }
    }
};