const Perf = {
    selectedUserId: null,
    dadosCarregados: [],
    initialized: false,

    carregarRanking: async function(forcar = false) {
        const tbody = document.getElementById('perf-ranking-body'); 
        
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();

        const tipo = document.getElementById('perf-period-type').value; 
        const globalInput = document.getElementById('global-date');
        const dataGlobal = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
        const [gAno, gMes] = dataGlobal.split('-').map(Number);

        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando Performance...</td></tr>';
        
        try {
            let s, e, labelTexto;
            const ano = gAno;

            if (tipo === 'mes') { 
                s = `${ano}-${String(gMes).padStart(2,'0')}-01`; 
                e = `${ano}-${String(gMes).padStart(2,'0')}-${new Date(ano, gMes, 0).getDate()}`;
                labelTexto = `Mensal: ${gMes}/${ano}`;
            } else if (tipo === 'trimestre') { 
                const tri = Math.ceil(gMes / 3);
                const mStart = ((tri-1)*3)+1; 
                s = `${ano}-${String(mStart).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`;
                labelTexto = `${tri}º Trimestre de ${ano}`;
            } else if (tipo === 'semestre') { 
                const sem = gMes <= 6 ? 1 : 2;
                s = sem === 1 ? `${ano}-01-01` : `${ano}-07-01`; 
                e = sem === 1 ? `${ano}-06-30` : `${ano}-12-31`; 
                labelTexto = `${sem}º Semestre de ${ano}`;
            } else { 
                s = `${ano}-01-01`; e = `${ano}-12-31`; 
                labelTexto = `Ano de ${ano}`;
            }
            
            const elRange = document.getElementById('perf-range-label');
            if(elRange) elRange.innerText = labelTexto;

            const { data: prods, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade')
                .gte('data_referencia', s)
                .lte('data_referencia', e); 
            
            if(error) throw error;
            
            let stats = {};
            let prodTotalGeral = 0, prodCLT = 0, prodPJ = 0;
            let namesCLT = new Set(), namesPJ = new Set();

            prods.forEach(item => {
                const user = Sistema.Dados.usuariosCache[item.usuario_id];
                if (!user || user.funcao !== 'Assistente') return;

                const nome = user.nome.trim(); 
                const qtd = Number(item.quantidade) || 0;
                const metaDoDia = Sistema.Dados.obterMetaVigente(item.usuario_id, item.data_referencia);

                prodTotalGeral += qtd;
                
                if (user.contrato && user.contrato.includes('CLT')) { 
                    prodCLT += qtd; namesCLT.add(nome); 
                } else { 
                    prodPJ += qtd; namesPJ.add(nome); 
                }

                if (!stats[nome]) stats[nome] = { id: item.usuario_id, nome: nome, total: 0, metaAcc: 0, dias: new Set() };
                
                stats[nome].total += qtd; 
                stats[nome].metaAcc += metaDoDia;
                stats[nome].dias.add(item.data_referencia);
            });
            
            const atualizarElemento = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
            atualizarElemento('perf-pct-clt', (prodTotalGeral > 0 ? Math.round((prodCLT / prodTotalGeral) * 100) : 0) + '%');
            atualizarElemento('perf-count-clt', namesCLT.size);
            atualizarElemento('perf-pct-pj', (prodTotalGeral > 0 ? Math.round((prodPJ / prodTotalGeral) * 100) : 0) + '%');
            atualizarElemento('perf-count-pj', namesPJ.size);

            this.dadosCarregados = Object.values(stats).sort((a, b) => {
                const pctA = a.metaAcc > 0 ? a.total / a.metaAcc : 0;
                const pctB = b.metaAcc > 0 ? b.total / b.metaAcc : 0;
                return pctB - pctA; 
            });

            this.renderRanking();
        } catch (err) { 
            console.error(err); 
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-400">Erro ao carregar dados.</td></tr>'; 
        }
    },

    renderRanking: function() {
        const tbody = document.getElementById('perf-ranking-body'); 
        if (!this.dadosCarregados.length) { 
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado encontrado.</td></tr>'; 
            this.atualizarCards(null); 
            const divTop5 = document.getElementById('perf-rank-content');
            if(divTop5) divTop5.innerHTML = '<div class="text-center text-slate-400 py-4 italic">Sem dados</div>';
            return; 
        }
        
        let html = ''; 
        let selectedStats = null;
        
        const sessaoAtual = JSON.parse(localStorage.getItem('usuario'));
        const currentUserId = sessaoAtual ? sessaoAtual.id : null;

        this.dadosCarregados.forEach((u, idx) => {
            const dias = u.dias.size || 1; 
            const media = Math.round(u.total / dias); 
            const meta = u.metaAcc;
            const pct = meta > 0 ? Math.round((u.total / meta) * 100) : 0;
            
            const isSelected = String(this.selectedUserId) === String(u.id); 
            if (isSelected) selectedStats = { ...u, media, meta, rank: idx + 1 };
            
            const isMe = currentUserId && String(u.id) === String(currentUserId); 
            let rowClass = isSelected ? "selected-row" : (isMe ? "me-row bg-blue-50/50 border-l-4 border-blue-300" : "hover:bg-slate-50");
            let trofeu = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''));

            html += `
                <tr class="${rowClass} transition border-b border-slate-100 cursor-pointer" onclick="Perf.toggleUsuario('${u.id}')">
                    <td class="px-6 py-4 font-bold text-slate-600">${trofeu} #${idx + 1}</td>
                    <td class="px-6 py-4 font-bold text-slate-800">${u.nome} ${isMe ? '<span class="text-xs text-blue-600 ml-1">(Você)</span>' : ''}</td>
                    <td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center text-slate-500">${dias}</td>
                    <td class="px-6 py-4 text-center">${media.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center text-slate-400">${meta.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="${pct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} text-xs font-bold px-2 py-1 rounded-full">
                            ${pct}%
                        </span>
                    </td>
                </tr>`;
        });
        
        if(tbody) tbody.innerHTML = html; 

        // Top 5
        const divTop5 = document.getElementById('perf-rank-content');
        if (divTop5) {
            const top5 = this.dadosCarregados.slice(0, 5);
            let htmlTop = '';
            top5.forEach((u, i) => {
                const meta = u.metaAcc;
                const pct = meta > 0 ? Math.round((u.total / meta) * 100) : 0;
                const corBarra = pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500';
                
                htmlTop += `
                <div class="flex items-center gap-2 mb-3">
                    <div class="w-5 text-center text-[10px] font-bold text-slate-400 border border-slate-200 rounded">${i + 1}º</div>
                    <div class="flex-1">
                        <div class="flex justify-between text-[10px] mb-0.5">
                            <span class="font-bold text-slate-700 truncate w-28">${u.nome}</span>
                            <span class="font-bold text-slate-500">${pct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div class="${corBarra} h-full transition-all duration-500" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                    </div>
                </div>`;
            });
            divTop5.innerHTML = htmlTop;
        }

        this.atualizarCards(selectedStats);
    },

    toggleUsuario: function(id) { 
        const strId = String(id);
        this.selectedUserId = (this.selectedUserId === strId) ? null : strId; 
        
        const btnLimpar = document.getElementById('perf-btn-limpar');
        if(btnLimpar) btnLimpar.classList.toggle('hidden', !this.selectedUserId);
        
        this.renderRanking(); 
    },

    limparSelecao: function() {
        this.selectedUserId = null;
        document.getElementById('perf-btn-limpar').classList.add('hidden');
        this.renderRanking();
    },

    atualizarCards: function(userStats) {
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };

        const total = userStats ? userStats.total : this.dadosCarregados.reduce((a, b) => a + b.total, 0);
        const meta = userStats ? userStats.metaAcc : this.dadosCarregados.reduce((a, b) => a + b.metaAcc, 0);
        const pct = meta > 0 ? Math.round((total / meta) * 100) : 0;
        
        let media = 0;
        if (userStats) {
            media = userStats.media;
        } else {
            const totalDiasSomados = this.dadosCarregados.reduce((a,b) => a + (b.dias.size||1), 0);
            media = totalDiasSomados > 0 ? Math.round(total / totalDiasSomados) : 0;
        }

        safeSet('perf-card-total', total.toLocaleString());
        safeSet('perf-card-media', media.toLocaleString());
        safeSet('perf-card-meta', meta.toLocaleString());
        safeSet('perf-label-real-total', total.toLocaleString());
        safeSet('perf-label-meta-total', meta.toLocaleString());

        const txtPct = document.getElementById('perf-txt-pct');
        const cardPct = document.getElementById('perf-card-pct');
        const iconPct = document.getElementById('perf-icon-pct');
        
        if (txtPct) txtPct.innerText = pct + '%';
        if (cardPct && iconPct) {
            cardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
            if (pct >= 100) {
                cardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                iconPct.className = "fas fa-check-circle text-2xl text-white/80";
            } else {
                cardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                iconPct.className = "fas fa-chart-line text-2xl text-white/80";
            }
        }
    }
};