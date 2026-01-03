// js/produtividade_performance.js

const Perf = {
    selectedUserId: null, // Armazena o ID principal ou Nome para seleção
    dadosCarregados: [],
    initialized: false,

    init: function() { 
        this.uiChange();
        this.carregarRanking(); 
    },

    uiChange: function() {
        const tipo = document.getElementById('perf-period-type').value;
        const inpMonth = document.getElementById('perf-input-month');
        const inpQuarter = document.getElementById('perf-input-quarter');
        const inpSemester = document.getElementById('perf-input-semester');
        const inpYear = document.getElementById('perf-input-year');

        inpMonth.classList.add('hidden');
        inpQuarter.classList.add('hidden');
        inpSemester.classList.add('hidden');
        inpYear.classList.add('hidden');

        if (tipo === 'mes') {
            inpMonth.classList.remove('hidden');
        } else if (tipo === 'trimestre') {
            inpQuarter.classList.remove('hidden');
            inpYear.classList.remove('hidden');
        } else if (tipo === 'semestre') {
            inpSemester.classList.remove('hidden');
            inpYear.classList.remove('hidden');
        } else if (tipo === 'ano') {
            inpYear.classList.remove('hidden');
        }
        
        this.carregarRanking(); 
    },

    limparSelecao: function() { 
        this.selectedUserId = null; 
        document.getElementById('perf-btn-limpar').classList.add('hidden'); 
        this.carregarRanking(); 
    },

    toggleUsuario: function(id) { 
        // id aqui será o ID principal do agrupamento
        if (this.selectedUserId === id) { 
            this.selectedUserId = null; 
            document.getElementById('perf-btn-limpar').classList.add('hidden'); 
        } else { 
            this.selectedUserId = id; 
            document.getElementById('perf-btn-limpar').classList.remove('hidden'); 
        } 
        this.renderRanking(); 
    },
    
    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body'); 
        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">A carregar dados...</td></tr>';
        
        try {
            const tipo = document.getElementById('perf-period-type').value; 
            const valMonth = document.getElementById('perf-input-month').value; 
            const valYear = document.getElementById('perf-input-year').value;
            const valQuarter = document.getElementById('perf-input-quarter').value;
            const valSemester = document.getElementById('perf-input-semester').value;

            if((tipo === 'mes' && !valMonth) || (tipo !== 'mes' && !valYear)) return;

            let s, e, labelTexto;
            let ano = parseInt(valYear);

            if (tipo === 'mes') { 
                const parts = valMonth.split('-');
                ano = parseInt(parts[0]);
                const mes = parseInt(parts[1]); 
                s = `${ano}-${String(mes).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`;
                const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                labelTexto = `Mensal: ${nomesMeses[mes-1]} de ${ano}`;

            } else if (tipo === 'trimestre') { 
                const q = parseInt(valQuarter);
                const mStart = ((q-1)*3)+1; 
                const mEnd = mStart+2; 
                s = `${ano}-${String(mStart).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mEnd).padStart(2,'0')}-${new Date(ano, mEnd, 0).getDate()}`;
                labelTexto = `${q}º Trimestre de ${ano}`;

            } else if (tipo === 'semestre') { 
                const sem = parseInt(valSemester);
                s = sem === 1 ? `${ano}-01-01` : `${ano}-07-01`; 
                e = sem === 1 ? `${ano}-06-30` : `${ano}-12-31`; 
                labelTexto = `${sem}º Semestre de ${ano}`;

            } else { 
                s = `${ano}-01-01`; 
                e = `${ano}-12-31`; 
                labelTexto = `Ano de ${ano}`;
            }
            
            const elLabel = document.getElementById('perf-range-label');
            if(elLabel) elLabel.innerText = labelTexto;

            const { data: prods, error } = await _supabase.from('producao').select('*').gte('data_referencia', s).lte('data_referencia', e); 
            if(error) throw error;
            
            // --- LÓGICA DE AGRUPAMENTO (SOLUÇÃO DO PROBLEMA DE DUPLICIDADE) ---
            let stats = {}; 
            let prodTotalGeral = 0;
            let prodCLT = 0;
            let prodPJ = 0;
            
            // Sets para contar Headcount Único (baseado no nome)
            let uniqueNamesCLT = new Set();
            let uniqueNamesPJ = new Set();

            prods.forEach(item => {
                const uid = item.usuario_id;
                const user = USERS_CACHE[uid];
                
                if (!user || user.funcao !== 'Assistente') return;

                const nomeChave = user.nome.trim(); // Chave de agrupamento é o NOME
                const qtd = Number(item.quantidade) || 0;
                
                prodTotalGeral += qtd;
                
                // Contagem de Produção e Headcount por Contrato
                if (user.contrato && user.contrato.includes('CLT')) {
                    prodCLT += qtd;
                    uniqueNamesCLT.add(nomeChave);
                } else {
                    prodPJ += qtd;
                    uniqueNamesPJ.add(nomeChave);
                }

                // Se ainda não existe registro para esse NOME, cria
                if (!stats[nomeChave]) {
                    stats[nomeChave] = { 
                        id: uid, // Guarda um ID para referência (toggle)
                        nome: user.nome, 
                        total: 0, 
                        dias: new Set() // Set evita contagem duplicada de dias
                    };
                }
                
                // Soma a produção
                stats[nomeChave].total += qtd; 
                // Adiciona a data ao Set (se já existir data de outro ID para a mesma pessoa, o Set ignora)
                stats[nomeChave].dias.add(item.data_referencia);
            });
            
            // Atualiza Card CLT vs PJ
            const pctCLT = prodTotalGeral > 0 ? Math.round((prodCLT / prodTotalGeral) * 100) : 0;
            const pctPJ = prodTotalGeral > 0 ? Math.round((prodPJ / prodTotalGeral) * 100) : 0;
            
            document.getElementById('perf-pct-clt').innerText = pctCLT + '%';
            document.getElementById('perf-count-clt').innerText = uniqueNamesCLT.size; // Usa o tamanho do Set de Nomes
            
            document.getElementById('perf-pct-pj').innerText = pctPJ + '%';
            document.getElementById('perf-count-pj').innerText = uniqueNamesPJ.size;

            // Ordenação por % Meta
            this.dadosCarregados = Object.values(stats).sort((a, b) => {
                const diasA = a.dias.size || 1;
                const metaA = diasA * 650;
                const pctA = metaA > 0 ? a.total / metaA : 0;

                const diasB = b.dias.size || 1;
                const metaB = diasB * 650;
                const pctB = metaB > 0 ? b.total / metaB : 0;

                return pctB - pctA; 
            });

            this.renderRanking();
        } catch (err) { 
            console.error(err); 
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-400">Erro ao carregar ranking.</td></tr>'; 
        }
    },

    renderRanking: function() {
        const tbody = document.getElementById('perf-ranking-body'); 
        if (!this.dadosCarregados.length) { 
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado encontrado para o período.</td></tr>'; 
            this.atualizarCards(null); 
            return; 
        }
        
        let html = ''; 
        let userStats = null;
        
        this.dadosCarregados.forEach((u, idx) => {
            const dias = u.dias.size || 1; // Dias unificados pelo Set
            const media = Math.round(u.total / dias); 
            const meta = 650 * dias; 
            const pct = Math.round((u.total / meta) * 100);
            
            const isSelected = this.selectedUserId === u.id; 
            if (isSelected) userStats = { ...u, media, meta, rank: idx + 1 };
            
            const isMe = (typeof sessao !== 'undefined' && sessao) && u.nome === sessao.nome; // Comparação por nome é mais segura aqui
            
            let rowClass = "hover:bg-slate-50 transition border-b border-slate-100 cursor-pointer "; 
            if (isSelected) rowClass += "selected-row"; 
            else if (isMe) rowClass += "me-row";

            let iconTrofeu = '';
            if (idx === 0) { rowClass += " rank-1"; iconTrofeu = '🥇'; }
            else if (idx === 1) { rowClass += " rank-2"; iconTrofeu = '🥈'; }
            else if (idx === 2) { rowClass += " rank-3"; iconTrofeu = '🥉'; }
            else if (idx < 5) { rowClass += " rank-top"; iconTrofeu = '🏅'; }

            let badgeClass = pct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
            
            html += `
            <tr class="${rowClass}" onclick="Perf.toggleUsuario(${u.id})">
                <td class="px-6 py-4 font-bold text-slate-600">${iconTrofeu} #${idx + 1}</td>
                <td class="px-6 py-4 font-bold text-slate-800">${u.nome} ${isMe ? '(Você)' : ''}</td>
                <td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td>
                <td class="px-6 py-4 text-center text-slate-500">${dias}</td>
                <td class="px-6 py-4 text-center font-medium">${media.toLocaleString()}</td>
                <td class="px-6 py-4 text-center text-slate-400">${meta.toLocaleString()}</td>
                <td class="px-6 py-4 text-center"><span class="${badgeClass} text-xs font-bold px-2 py-1 rounded-full">${pct}%</span></td>
            </tr>`;
        });
        
        if(tbody) tbody.innerHTML = html; 
        this.atualizarCards(userStats);
    },

    atualizarCards: function(userStats) {
        const elTotal = document.getElementById('perf-card-total');
        const elLabelMetaTotal = document.getElementById('perf-label-meta-total');
        const elMedia = document.getElementById('perf-card-media');
        const elCardPct = document.getElementById('perf-card-pct');
        const elPctVal = document.getElementById('perf-card-pct-val');
        const elPctDetail = document.getElementById('perf-card-pct-detail');
        const elIconPct = document.getElementById('perf-icon-pct');
        const elRankContent = document.getElementById('perf-rank-content');
        const elCardMeta = document.getElementById('perf-card-meta');
        const labelRealTotal = document.getElementById('perf-label-real-total');

        if (userStats) {
            // Individual
            if(elTotal) elTotal.innerText = userStats.total.toLocaleString(); 
            if(elLabelMetaTotal) elLabelMetaTotal.innerText = userStats.meta.toLocaleString();
            if(elMedia) elMedia.innerText = userStats.media.toLocaleString(); 
            if(elCardMeta) elCardMeta.innerText = userStats.meta.toLocaleString(); 
            if(labelRealTotal) labelRealTotal.innerText = userStats.total.toLocaleString();
        } else {
            // Geral (Time)
            const totalGeral = this.dadosCarregados.reduce((acc, curr) => acc + curr.total, 0); 
            // Dias Gerais: Soma dos dias únicos de CADA pessoa
            const diasGeral = this.dadosCarregados.reduce((acc, curr) => acc + (curr.dias.size||1), 0); 
            
            let metaGeral = 0;
            this.dadosCarregados.forEach(u => { metaGeral += (u.dias.size || 0) * 650; });

            const mediaGeral = diasGeral ? Math.round(totalGeral / diasGeral) : 0;
            
            if(elTotal) elTotal.innerText = totalGeral.toLocaleString(); 
            if(elLabelMetaTotal) elLabelMetaTotal.innerText = metaGeral.toLocaleString();
            if(elMedia) elMedia.innerText = mediaGeral.toLocaleString(); 
            if(elCardMeta) elCardMeta.innerText = metaGeral.toLocaleString(); 
            if(labelRealTotal) labelRealTotal.innerText = totalGeral.toLocaleString();
            
            const pctAtingimento = metaGeral > 0 ? Math.round((totalGeral / metaGeral) * 100) : 0;
            
            if(elPctVal) elPctVal.innerText = pctAtingimento + '%';
            if(elPctDetail) elPctDetail.innerText = `${totalGeral.toLocaleString()} / ${metaGeral.toLocaleString()}`;

            if (elCardPct) {
                elCardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
                if (pctAtingimento < 100) {
                    elCardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                    if(elIconPct) elIconPct.innerHTML = '<i class="fas fa-times-circle text-white/50"></i>';
                } else {
                    elCardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                    if(elIconPct) elIconPct.innerHTML = '<i class="fas fa-check-circle text-white/50"></i>';
                }
            }
            
            // Top 5
            let topHtml = '<div class="flex flex-col gap-1.5">'; 
            this.dadosCarregados.slice(0, 5).forEach((u, i) => { 
                const dias = u.dias.size || 1;
                const meta = dias * 650;
                const pct = Math.round((u.total / meta) * 100);
                let color = i===0 ? 'text-amber-500' : (i===1 ? 'text-slate-400' : (i===2 ? 'text-orange-400' : 'text-slate-600'));
                let icon = i < 3 ? '<i class="fas fa-trophy text-[9px]"></i>' : '<i class="fas fa-medal text-[9px]"></i>';
                let pctColor = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
                topHtml += `<div class="flex justify-between items-center text-xs border-b border-slate-100 pb-1 last:border-0"><div class="flex items-center gap-1.5"><span class="${color}">${icon}</span> <span class="font-bold text-slate-700 truncate max-w-[80px]">${u.nome.split(' ')[0]}</span></div> <span class="font-bold ${pctColor} px-1.5 rounded">${pct}%</span></div>`; 
            }); 
            topHtml += '</div>'; 
            if(elRankContent) elRankContent.innerHTML = topHtml;
        }
    }
};