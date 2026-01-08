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
                selQ.value = Math.ceil(m / 3); 
            }
        } 
        else if (t === 'semestre' && selS) {
            selS.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selS.value = m <= 6 ? 1 : 2; 
            }
        }
        
        // Recarrega os dados
        this.carregarRanking(); 
    },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        const divTop5 = document.getElementById('perf-rank-content'); // Container do Top 5
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
            const selQ = document.getElementById('perf-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3);
            const mStart = ((trim - 1) * 3) + 1;
            dataInicio = `${sAno}-${String(mStart).padStart(2,'0')}-01`;
            dataFim = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`;
        } else if (periodType === 'semestre') {
            const selS = document.getElementById('perf-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2);
            dataInicio = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`;
            dataFim = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`;
        } else { 
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
            let totalTime = 0;
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
                stats[uid].diasUteis += fator;
                stats[uid].metaTotal += (metaDiaria * fator);

                totalTime += qtd;

                if (cargo !== 'AUDITORA' && cargo !== 'GESTORA') {
                    totalProdAssistentes += qtd;
                    assistentesUnicas.add(uid);
                }
            });

            // Ordena ranking geral por Produção
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

            // --- CARDS SUPERIORES ---
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

            document.getElementById('perf-kpi-total').innerText = totalTime.toLocaleString('pt-BR');
            const numAssistentes = assistentesUnicas.size;
            const mediaGeral = numAssistentes > 0 ? Math.round(totalProdAssistentes / numAssistentes) : 0;
            document.getElementById('perf-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR');

            // --- RENDERIZA O TOP 5 (Layout Solicitado) ---
            if (divTop5) {
                // 1. Filtra apenas assistentes
                let listaTop5 = ranking.filter(u => u.cargo !== 'AUDITORA' && u.cargo !== 'GESTORA');
                
                // 2. Ordena por % de Atingimento
                listaTop5.sort((a, b) => {
                    const pctA = a.metaTotal > 0 ? a.producao / a.metaTotal : 0;
                    const pctB = b.metaTotal > 0 ? b.producao / b.metaTotal : 0;
                    return pctB - pctA; 
                });

                // 3. Pega os 5 primeiros
                const top5 = listaTop5.slice(0, 5);
                
                if (top5.length === 0) {
                    divTop5.innerHTML = '<div class="text-center text-slate-400 py-4 italic text-xs">Sem dados</div>';
                } else {
                    let htmlTop = '';
                    top5.forEach((u, i) => {
                        const pct = u.metaTotal > 0 ? Math.round((u.producao / u.metaTotal) * 100) : 0;
                        const corBarra = pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500';
                        
                        htmlTop += `
                        <div class="flex items-center gap-2 mb-2 last:mb-0">
                            <div class="w-4 text-[10px] font-bold text-slate-400">#${i + 1}</div>
                            <div class="flex-1">
                                <div class="flex justify-between text-[9px] mb-0.5">
                                    <span class="font-bold text-slate-700 truncate w-24">${u.nome}</span>
                                    <span class="font-bold text-slate-500">${pct}%</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div class="${corBarra} h-full" style="width: ${Math.min(pct, 100)}%"></div>
                                </div>
                            </div>
                        </div>`;
                    });
                    divTop5.innerHTML = htmlTop;
                }
            }

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    }
};