Produtividade.Performance = {
    initialized: false,
    
    init: function() {
        if (!this.initialized) {
            this.initialized = true;
        }
        this.togglePeriodo();
    },

    togglePeriodo: function() {
        const t = document.getElementById('perf-period-type').value;
        const selQ = document.getElementById('perf-select-quarter');
        const selS = document.getElementById('perf-select-semester');
        const dateInput = document.getElementById('global-date');
        
        if(selQ) selQ.classList.add('hidden');
        if(selS) selS.classList.add('hidden');

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
        
        this.carregar(); 
    },

    carregarRanking: async function() {
        // Alias para manter compatibilidade com chamada do HTML
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        const divTop5 = document.getElementById('perf-rank-content');
        
        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando ranking...</td></tr>';
        
        // 1. Definição de Datas
        const t = document.getElementById('perf-period-type').value; 
        const dateInput = document.getElementById('global-date');
        let val = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        let [ano, mes, dia] = val.split('-').map(Number);
        const sAno = String(ano); const sMes = String(mes).padStart(2, '0');
        
        let s, e;
        if (t === 'mes') { s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (t === 'trimestre') { 
            const selQ = document.getElementById('perf-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3); 
            const mStart = ((trim-1)*3)+1; 
            s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; 
        } else if (t === 'semestre') { 
            const selS = document.getElementById('perf-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2); 
            s = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`; 
            e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; 
        } else { 
            s = `${sAno}-01-01`; e = `${sAno}-12-31`; 
        }

        try {
            // 2. Buscar Dados
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    id, quantidade, fator, data_referencia,
                    usuario:usuarios ( id, nome, perfil, funcao )
                `)
                .gte('data_referencia', s)
                .lte('data_referencia', e);

            if (error) throw error;

            // 3. Agregar Dados
            const stats = {};
            let totalTime = 0;
            let totalProdAssistentes = 0;
            let assistentesUnicas = new Set();

            data.forEach(r => {
                const uid = r.usuario.id;
                const nome = r.usuario.nome || 'Desconhecido';
                // Mapeia Funcao -> Cargo para compatibilidade com lógica antiga
                const cargo = r.usuario.funcao ? r.usuario.funcao.toUpperCase() : 'ASSISTENTE';
                const metaDiaria = 650; // Meta fixa
                
                if (!stats[uid]) {
                    stats[uid] = {
                        id: uid,
                        nome: nome,
                        cargo: cargo,
                        producao: 0,
                        dias: 0,
                        diasUteis: 0, // Soma dos fatores
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

            // 4. Transformar em Array e Ordenar
            // A tabela principal ordena por Produção Total (Volume)
            const rankingGeral = Object.values(stats).filter(u => !['AUDITORA','GESTORA'].includes(u.cargo));
            rankingGeral.sort((a, b) => b.producao - a.producao);

            // 5. Renderizar Tabela
            if(tbody) {
                tbody.innerHTML = '';
                rankingGeral.forEach((u, index) => {
                    const mediaDiaria = u.diasUteis > 0 ? u.producao / u.diasUteis : 0;
                    const atingimento = u.metaTotal > 0 ? (u.producao / u.metaTotal) * 100 : 0;
                    
                    let corBadge = 'bg-slate-100 text-slate-600';
                    if (index === 0) corBadge = 'bg-yellow-100 text-yellow-700 border-yellow-200';
                    else if (index === 1) corBadge = 'bg-slate-200 text-slate-700';
                    else if (index === 2) corBadge = 'bg-orange-100 text-orange-800';

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
                    tr.innerHTML = `
                        <td class="px-6 py-3">
                            <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border ${corBadge}">${index + 1}º</span>
                        </td>
                        <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
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

                if (rankingGeral.length === 0) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado encontrado.</td></tr>';
            }

            // 6. Atualizar KPIs Superiores
            const campeao = rankingGeral[0]; // Como já filtramos gestão, o primeiro é o campeão operacional
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

            // 7. Renderizar Top 5 (Ordenado por % de Atingimento)
            if (divTop5) {
                // Cria cópia para não estragar a ordenação da tabela principal
                let listaEficiencia = [...rankingGeral];
                
                // Ordena por % (Eficiência)
                listaEficiencia.sort((a, b) => {
                    const pctA = a.metaTotal > 0 ? a.producao / a.metaTotal : 0;
                    const pctB = b.metaTotal > 0 ? b.producao / b.metaTotal : 0;
                    return pctB - pctA; 
                });

                const top5 = listaEficiencia.slice(0, 5);
                
                if (top5.length === 0) {
                    divTop5.innerHTML = '<div class="text-center text-slate-400 py-4 italic text-xs">Sem dados</div>';
                } else {
                    let htmlTop = '';
                    top5.forEach((u, i) => {
                        const pct = u.metaTotal > 0 ? Math.round((u.producao / u.metaTotal) * 100) : 0;
                        // Cores da barra
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
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    }
};