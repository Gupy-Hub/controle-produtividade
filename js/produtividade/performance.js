Produtividade.Performance = {
    init: function() {
        this.carregarRanking();
    },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Calculando...</td></tr>';

        try {
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)');

            if (error) throw error;

            if (!data || data.length === 0) {
                this.zerarCards();
                if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Sem dados para ranking.</td></tr>';
                return;
            }

            // Agrupa e Soma
            const ranking = {};
            let totalTime = 0;

            data.forEach(d => {
                const uid = d.usuario_id;
                const nomeUser = d.usuarios && d.usuarios.nome ? d.usuarios.nome : `(ID: ${uid})`;

                if(!ranking[uid]) ranking[uid] = { nome: nomeUser, total: 0, dias: 0 };
                
                const qtd = Number(d.quantidade) || 0;
                // Fator null vira 1, fator numérico respeita o valor
                const diaContabil = d.fator_multiplicador === null ? 1 : (Number(d.fator_multiplicador) || 0);

                ranking[uid].total += qtd;
                ranking[uid].dias += diaContabil;
                
                totalTime += qtd;
            });

            const arrayRank = Object.values(ranking).sort((a, b) => b.total - a.total);
            const qtdAssistentes = arrayRank.length;

            // --- CÁLCULO DOS CARDS (KPIs) ---
            const elCampeao = document.getElementById('perf-kpi-campeao');
            const elCampeaoVal = document.getElementById('perf-kpi-campeao-val');
            const elTotal = document.getElementById('perf-kpi-total');
            const elMedia = document.getElementById('perf-kpi-media');

            // 1. Campeão
            if (arrayRank.length > 0) {
                const campeao = arrayRank[0];
                if(elCampeao) elCampeao.innerText = campeao.nome;
                if(elCampeaoVal) elCampeaoVal.innerText = `${campeao.total.toLocaleString('pt-BR')} docs`;
            } else {
                if(elCampeao) elCampeao.innerText = "-";
                if(elCampeaoVal) elCampeaoVal.innerText = "";
            }

            // 2. Total Time
            if(elTotal) elTotal.innerText = totalTime.toLocaleString('pt-BR');

            // 3. Média por Assistente (Total / N Pessoas)
            const mediaGeral = qtdAssistentes > 0 ? Math.round(totalTime / qtdAssistentes) : 0;
            if(elMedia) elMedia.innerText = mediaGeral.toLocaleString('pt-BR');


            // --- RENDERIZA TABELA ---
            let html = '';
            arrayRank.forEach((u, index) => {
                const dias = u.dias || 1;
                const media = Math.round(u.total / dias);
                
                let medalha = '';
                if(index === 0) medalha = '🥇';
                if(index === 1) medalha = '🥈';
                if(index === 2) medalha = '🥉';

                html += `<tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="px-6 py-3 font-bold text-slate-500">${index + 1} ${medalha}</td>
                    <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-6 py-3 text-center font-black text-blue-700">${u.total.toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-3 text-center">${u.dias.toFixed(1)}</td>
                    <td class="px-6 py-3 text-center text-emerald-600 font-bold">${media.toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-3 text-center text-slate-400">-</td>
                    <td class="px-6 py-3 text-center text-slate-400">-</td>
                </tr>`;
            });
            
            if(tbody) tbody.innerHTML = html || '<tr><td colspan="7" class="text-center py-4">Sem dados.</td></tr>';

        } catch (e) {
            console.error("Erro Performance:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    zerarCards: function() {
        const ids = ['perf-kpi-campeao', 'perf-kpi-total', 'perf-kpi-media'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = '--';
        });
        const elVal = document.getElementById('perf-kpi-campeao-val');
        if(elVal) elVal.innerText = '';
    }
};