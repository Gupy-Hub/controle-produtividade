// js/produtividade_performance.js

const Perf = {
    selectedUserId: null,
    dadosCarregados: [],
    initialized: false,

    init: function() { 
        if(!this.initialized) { 
            Sistema.Datas.criarInputInteligente('data-perf', KEY_DATA_GLOBAL, () => { this.carregarRanking(); }); 
            this.initialized = true; 
        } 
        this.carregarRanking(); 
    },

    limparSelecao: function() { 
        this.selectedUserId = null; 
        document.getElementById('perf-btn-limpar').classList.add('hidden'); 
        this.carregarRanking(); 
    },

    toggleUsuario: function(id) { 
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
            const refDate = Sistema.Datas.lerInput('data-perf');
            const ano = refDate.getFullYear(); const mes = refDate.getMonth() + 1;
            let s, e;
            
            if (tipo === 'mes') { 
                s = `${ano}-${String(mes).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`; 
            } else if (tipo === 'trimestre') { 
                const trim = Math.ceil(mes / 3); 
                const mStart = ((trim-1)*3)+1; 
                const mEnd = mStart+2; 
                s = `${ano}-${String(mStart).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mEnd).padStart(2,'0')}-${new Date(ano, mEnd, 0).getDate()}`; 
            } else if (tipo === 'semestre') { 
                const sem = Math.ceil(mes / 6); 
                s = sem === 1 ? `${ano}-01-01` : `${ano}-07-01`; 
                e = sem === 1 ? `${ano}-06-30` : `${ano}-12-31`; 
            } else { 
                s = `${ano}-01-01`; 
                e = `${ano}-12-31`; 
            }
            
            const { data: prods, error } = await _supabase.from('producao').select('*, usuarios(nome, funcao, contrato)').gte('data_referencia', s).lte('data_referencia', e); 
            if(error) throw error;
            
            let stats = {};
            
            // Variáveis para o Card CLT vs PJ
            let prodTotalGeral = 0;
            let prodCLT = 0;
            let prodPJ = 0;
            let usersCLT = new Set();
            let usersPJ = new Set();

            prods.forEach(item => {
                // Tenta pegar usuario do join ou do cache
                let user = item.usuarios;
                const uid = item.usuario_id;
                
                // Fallback para cache se o join falhar (devido a estrutura do supabase)
                if (!user && USERS_CACHE[uid]) user = USERS_CACHE[uid];
                
                if (!user || user.funcao !== 'Assistente') return;

                const qtd = Number(item.quantidade) || 0;
                
                // Lógica CLT vs PJ
                prodTotalGeral += qtd;
                if (user.contrato && user.contrato.includes('CLT')) {
                    prodCLT += qtd;
                    usersCLT.add(uid);
                } else {
                    prodPJ += qtd;
                    usersPJ.add(uid);
                }

                if (!stats[uid]) stats[uid] = { id: uid, nome: user.nome, total: 0, dias: new Set() };
                stats[uid].total += qtd; 
                stats[uid].dias.add(item.data_referencia);
            });
            
            // Atualiza Card CLT vs PJ (Visual)
            const pctCLT = prodTotalGeral > 0 ? Math.round((prodCLT / prodTotalGeral) * 100) : 0;
            const pctPJ = prodTotalGeral > 0 ? Math.round((prodPJ / prodTotalGeral) * 100) : 0;
            
            document.getElementById('perf-pct-clt').innerText = pctCLT + '%';
            document.getElementById('perf-count-clt').innerText = usersCLT.size;
            
            document.getElementById('perf-pct-pj').innerText = pctPJ + '%';
            document.getElementById('perf-count-pj').innerText = usersPJ.size;

            // Ordenação: Agora por % de Atingimento da Meta, não Total Bruto
            this.dadosCarregados = Object.values(stats).sort((a, b) => {
                const diasA = a.dias.size || 1;
                const metaA = diasA * 650;
                const pctA = a.total / metaA;

                const diasB = b.dias.size || 1;
                const metaB = diasB * 650;
                const pctB = b.total / metaB;

                return pctB - pctA; // Decrescente por %
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
            const dias = u.dias.size || 1; 
            const media = Math.round(u.total / dias); 
            const meta = 650 * dias; 
            const pct = Math.round((u.total / meta) * 100);
            
            const isSelected = this.selectedUserId === u.id; 
            if (isSelected) userStats = { ...u, media, meta, rank: idx + 1 };
            
            const isMe = (typeof sessao !== 'undefined' && sessao) && u.id === sessao.id; 
            
            let rowClass = "hover:bg-slate-50 transition border-b border-slate-100 cursor-pointer "; 
            if (isSelected) rowClass += "selected-row"; 
            else if (isMe) rowClass += "me-row";

            // Destaque Top 5
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
        const elMedia = document.getElementById('perf-card-media');
        const elMeta = document.getElementById('perf-card-meta');
        const labelMetaTotal = document.getElementById('perf-label-meta-total');
        const labelRealTotal = document.getElementById('perf-label-real-total');
        const elRankContent = document.getElementById('perf-rank-content');

        if (userStats) {
            // Visão Individual
            if(elTotal) elTotal.innerText = userStats.total.toLocaleString(); 
            if(labelMetaTotal) labelMetaTotal.innerText = userStats.meta.toLocaleString();

            if(elMedia) elMedia.innerText = userStats.media.toLocaleString(); 
            
            if(elMeta) elMeta.innerText = userStats.meta.toLocaleString(); 
            if(labelRealTotal) labelRealTotal.innerText = userStats.total.toLocaleString();
        } else {
            // Visão Geral do Time
            const totalGeral = this.dadosCarregados.reduce((acc, curr) => acc + curr.total, 0); 
            const diasGeral = this.dadosCarregados.reduce((acc, curr) => acc + (curr.dias.size||1), 0); 
            
            // Meta Geral = Soma das Metas Individuais (Dias trabalhados * 650)
            let metaGeral = 0;
            this.dadosCarregados.forEach(u => {
                metaGeral += (u.dias.size || 0) * 650;
            });

            const mediaGeral = diasGeral ? Math.round(totalGeral / diasGeral) : 0;
            
            if(elTotal) elTotal.innerText = totalGeral.toLocaleString(); 
            if(labelMetaTotal) labelMetaTotal.innerText = metaGeral.toLocaleString();
            
            if(elMedia) elMedia.innerText = mediaGeral.toLocaleString(); 
            
            if(elMeta) elMeta.innerText = metaGeral.toLocaleString(); 
            if(labelRealTotal) labelRealTotal.innerText = totalGeral.toLocaleString();
            
            // Top 5 Mini List (Visual do Card)
            let topHtml = '<div class="flex flex-col gap-1.5">'; 
            this.dadosCarregados.slice(0, 5).forEach((u, i) => { 
                const dias = u.dias.size || 1;
                const meta = dias * 650;
                const pct = Math.round((u.total / meta) * 100);

                let color = i===0 ? 'text-amber-500' : (i===1 ? 'text-slate-400' : (i===2 ? 'text-orange-400' : 'text-slate-600'));
                let icon = i < 3 ? '<i class="fas fa-trophy text-[9px]"></i>' : '<i class="fas fa-medal text-[9px]"></i>';
                
                // Cor da porcentagem no card pequeno
                let pctColor = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';

                topHtml += `
                <div class="flex justify-between items-center text-xs border-b border-slate-100 pb-1 last:border-0">
                    <div class="flex items-center gap-1.5">
                        <span class="${color}">${icon}</span> 
                        <span class="font-bold text-slate-700 truncate max-w-[80px]">${u.nome.split(' ')[0]}</span>
                    </div> 
                    <span class="${pctColor} font-bold px-1.5 rounded">${pct}%</span>
                </div>`; 
            }); 
            topHtml += '</div>'; 
            if(elRankContent) elRankContent.innerHTML = topHtml;
        }
    }
};