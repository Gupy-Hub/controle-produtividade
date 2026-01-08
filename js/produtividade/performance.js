Produtividade.Performance = {
    
    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        const periodType = document.getElementById('perf-period-type').value;
        const dateInput = document.getElementById('global-date').value;
        
        if (!tbody) return;

        // Define as datas com base no filtro
        let [ano, mes, dia] = dateInput.split('-').map(Number);
        let dataInicio, dataFim;
        const sAno = String(ano);
        const sMes = String(mes).padStart(2, '0');

        if (periodType === 'mes') {
            dataInicio = `${sAno}-${sMes}-01`;
            dataFim = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`;
        } else if (periodType === 'trimestre') {
            const trim = Math.ceil(mes / 3);
            const mStart = ((trim - 1) * 3) + 1;
            dataInicio = `${sAno}-${String(mStart).padStart(2,'0')}-01`;
            dataFim = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`;
        } else if (periodType === 'semestre') {
            const sem = mes <= 6 ? 1 : 2;
            dataInicio = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`;
            dataFim = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`;
        } else { // ano
            dataInicio = `${sAno}-01-01`;
            dataFim = `${sAno}-12-31`;
        }

        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando ranking...</td></tr>';

        try {
            // CORREÇÃO: Usa Sistema.supabase
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    id, quantidade, fator, data_referencia,
                    usuario:usuarios ( id, nome, perfil, cargo, meta_diaria )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);

            if (error) throw error;

            // Processamento dos dados
            const stats = {};
            let totalTime = 0;
            let totalMetaTime = 0;
            
            // Variáveis para Média Ajustada (Sem Auditoras/Gestoras)
            let totalProdAssistentes = 0;
            let assistentesUnicas = new Set();

            data.forEach(r => {
                const uid = r.usuario.id;
                const nome = r.usuario.nome || 'Desconhecido';
                const cargo = r.usuario.cargo ? r.usuario.cargo.toUpperCase() : 'ASSISTENTE';
                const metaDiaria = Number(r.usuario.meta_diaria) || 650;
                
                if (!stats[uid]) {
                    stats[uid] = {
                        id: uid,
                        nome: nome,
                        cargo: cargo,
                        producao: 0,
                        dias: 0,
                        diasUteis: 0,
                        metaTotal: 0
                    };
                }

                const qtd = Number(r.quantidade) || 0;
                const fator = Number(r.fator) || 0;

                stats[uid].producao += qtd;
                stats[uid].dias += 1;
                stats[uid].diasUteis += fator; // Soma dos fatores (ex: 0.5 + 1 = 1.5)
                stats[uid].metaTotal += (metaDiaria * fator);

                // Totais Gerais
                totalTime += qtd;
                totalMetaTime += (metaDiaria * fator);

                // Totais para Média (Exclui Liderança)
                if (cargo !== 'AUDITORA' && cargo !== 'GESTORA') {
                    totalProdAssistentes += qtd;
                    assistentesUnicas.add(uid);
                }
            });

            // Converte para array e ordena
            const ranking = Object.values(stats).sort((a, b) => b.producao - a.producao);

            // Renderiza Tabela
            tbody.innerHTML = '';
            
            ranking.forEach((u, index) => {
                const mediaDiaria = u.diasUteis > 0 ? u.producao / u.diasUteis : 0;
                const atingimento = u.metaTotal > 0 ? (u.producao / u.metaTotal) * 100 : 0;
                
                let corBadge = 'bg-slate-100 text-slate-600';
                if (index === 0) corBadge = 'bg-yellow-100 text-yellow-700 border-yellow-200';
                else if (index === 1) corBadge = 'bg-slate-200 text-slate-700';
                else if (index === 2) corBadge = 'bg-orange-100 text-orange-800';

                // Ícone de cargo se for liderança
                let iconCargo = '';
                if(u.cargo === 'AUDITORA') iconCargo = '<span class="ml-2 text-[9px] bg-purple-100 text-purple-700 px-1 rounded border border-purple-200">AUD</span>';
                if(u.cargo === 'GESTORA') iconCargo = '<span class="ml-2 text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded border border-indigo-200">GEST</span>';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
                tr.innerHTML = `
                    <td class="px-6 py-3">
                        <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border ${corBadge}">
                            ${index + 1}º
                        </span>
                    </td>
                    <td class="px-6 py-3 font-bold text-slate-700 flex items-center">
                        ${u.nome} ${iconCargo}
                    </td>
                    <td class="px-6 py-3 text-center font-black text-blue-700">${Math.round(u.producao).toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-3 text-center text-slate-500 text-xs">${u.diasUteis}</td>
                    <td class="px-6 py-3 text-center text-slate-600 font-bold">${Math.round(mediaDiaria)}</td>
                    <td class="px-6 py-3 text-center text-slate-400 text-xs">${Math.round(u.metaTotal).toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="${atingimento >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'} px-2 py-1 rounded text-xs font-black border border-opacity-50 ${atingimento >= 100 ? 'border-emerald-200' : 'border-amber-200'}">
                            ${Math.round(atingimento)}%
                        </span>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            if (ranking.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado encontrado para este período.</td></tr>';
            }

            // --- ATUALIZA CARDS SUPERIORES ---
            
            // 1. Campeão (Ignora Auditoras/Gestoras para o prêmio)
            const campeao = ranking.find(u => u.cargo !== 'AUDITORA' && u.cargo !== 'GESTORA');
            
            const elCampNome = document.getElementById('perf-kpi-campeao');
            const elCampVal = document.getElementById('perf-kpi-campeao-val');
            
            if (campeao) {
                elCampNome.innerText = campeao.nome;
                elCampVal.innerText = `${Math.round(campeao.producao).toLocaleString()} Docs`;
            } else {
                elCampNome.innerText = "--";
                elCampVal.innerText = "";
            }

            // 2. Produção Total do Time (Soma Tudo)
            document.getElementById('perf-kpi-total').innerText = totalTime.toLocaleString('pt-BR');

            // 3. Média por Assistente (Exclui Liderança)
            const numAssistentes = assistentesUnicas.size;
            const mediaGeral = numAssistentes > 0 ? Math.round(totalProdAssistentes / numAssistentes) : 0;
            document.getElementById('perf-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR');

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    }
};