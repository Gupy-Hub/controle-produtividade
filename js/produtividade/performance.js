Produtividade.Performance = {
    
    // Controla visibilidade dos seletores extras
    togglePeriodo: function() {
        const typeEl = document.getElementById('perf-period-type');
        if(!typeEl) return;

        const t = typeEl.value;
        const selQ = document.getElementById('perf-select-quarter');
        const selS = document.getElementById('perf-select-semester');
        const dateInput = document.getElementById('global-date');
        
        // Esconde ambos inicialmente
        if(selQ) selQ.classList.add('hidden');
        if(selS) selS.classList.add('hidden');

        // Mostra o específico
        if (t === 'trimestre' && selQ) {
            selQ.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selQ.value = Math.ceil(m / 3); // Auto-seleciona trimestre atual
            }
        } 
        else if (t === 'semestre' && selS) {
            selS.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selS.value = m <= 6 ? 1 : 2; // Auto-seleciona semestre atual
            }
        }
        
        // Recarrega os dados
        this.carregarRanking(); 
    },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        const periodType = document.getElementById('perf-period-type').value;
        const dateInput = document.getElementById('global-date').value;
        
        if (!tbody) return;

        // --- Definição de Datas ---
        let [ano, mes, dia] = dateInput.split('-').map(Number);
        let dataInicio, dataFim;
        const sAno = String(ano);
        const sMes = String(mes).padStart(2, '0');

        if (periodType === 'mes') {
            dataInicio = `${sAno}-${sMes}-01`;
            dataFim = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`;
        } else if (periodType === 'trimestre') {
            // Pega do seletor específico
            const selQ = document.getElementById('perf-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3);
            
            const mStart = ((trim - 1) * 3) + 1;
            dataInicio = `${sAno}-${String(mStart).padStart(2,'0')}-01`;
            dataFim = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`;
        } else if (periodType === 'semestre') {
            // Pega do seletor específico
            const selS = document.getElementById('perf-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2);
            
            dataInicio = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`;
            dataFim = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`;
        } else { // ano
            dataInicio = `${sAno}-01-01`;
            dataFim = `${sAno}-12-31`;
        }

        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando ranking...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    id, quantidade, fator, data_referencia,
                    usuario:usuarios ( id, nome, perfil, cargo, meta_diaria )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);

            if (error) throw error;

            const stats = {};
            
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
                stats[uid].diasUteis += fator;
                stats[uid].metaTotal += (metaDiaria * fator);
            });

            const ranking = Object.values(stats).sort((a, b) => b.producao - a.producao);

            // --- RENDERIZA TABELA ---
            tbody.innerHTML = '';
            ranking.forEach((u, index) => {
                const mediaDiaria = u.diasUteis > 0 ? u.producao / u.diasUteis : 0;
                const atingimento = u.metaTotal > 0 ? (u.producao / u.metaTotal) * 100 : 0;
                
                let corBadge = 'bg-slate-100 text-slate-600';
                if (index === 0) corBadge = 'bg-yellow-100 text-yellow-700 border-yellow-200';
                else if (index === 1) corBadge = 'bg-slate-200 text-slate-700';
                else if (index === 2) corBadge = 'bg-orange-100 text-orange-800';

                let iconCargo = '';
                if(u.cargo === 'AUDITORA') iconCargo = '<span class="ml-2 text-[9px] bg-purple-100 text-purple-700 px-1 rounded border border-purple-200">AUD</span>';
                if(u.cargo === 'GESTORA') iconCargo = '<span class="ml-2 text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded border border-indigo-200">GEST</span>';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
                tr.innerHTML = `
                    <td class="px-6 py-3">
                        <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border ${corBadge}">${index + 1}º</span>
                    </td>
                    <td class="px-6 py-3 font-bold text-slate-700 flex items-center">${u.nome} ${iconCargo}</td>
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

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    }
};