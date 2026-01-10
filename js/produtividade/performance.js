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

    carregar: async function() {
        const tbody = document.getElementById('ranking-body');
        const podium = document.getElementById('podium-container');
        
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando ranking...</td></tr>';
        
        // 1. Definição de Datas (Igual Consolidado)
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
                    quantidade, fator,
                    usuario:usuarios ( id, nome, perfil, funcao )
                `)
                .gte('data_referencia', s)
                .lte('data_referencia', e);

            if (error) throw error;

            // 3. Processar Ranking
            let ranking = {};
            
            data.forEach(r => {
                // REGRA: Excluir Gestão/Auditoria do Ranking
                const cargo = r.usuario && r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
                if (['AUDITORA', 'GESTORA'].includes(cargo)) return;

                const uid = r.usuario.id;
                if (!ranking[uid]) {
                    ranking[uid] = {
                        nome: r.usuario.nome,
                        producao: 0,
                        dias: 0
                    };
                }
                
                ranking[uid].producao += (Number(r.quantidade) || 0);
                ranking[uid].dias += (Number(r.fator) || 0);
            });

            let lista = Object.values(ranking).map(u => {
                const metaDiaria = 650;
                const metaTotal = u.dias * metaDiaria;
                const pct = metaTotal > 0 ? (u.producao / metaTotal) * 100 : 0;
                const media = u.dias > 0 ? u.producao / u.dias : 0;
                
                return { ...u, pct, media, metaTotal };
            });

            // Ordenar por % de Atingimento (Performance)
            lista.sort((a, b) => b.pct - a.pct);

            this.renderizar(lista, tbody, podium);

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    },

    renderizar: function(lista, tbody, podium) {
        tbody.innerHTML = '';
        podium.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-12 text-slate-400 italic">Sem dados de performance para este período.</td></tr>';
            return;
        }

        // --- 1. RENDERIZAR PÓDIO (Top 3) ---
        const top3 = lista.slice(0, 3);
        const medals = [
            { color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200', label: '1º Lugar', icon: 'fa-trophy' },
            { color: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: '2º Lugar', icon: 'fa-medal' },
            { color: 'text-amber-700', bg: 'bg-orange-50', border: 'border-orange-200', label: '3º Lugar', icon: 'fa-medal' }
        ];

        top3.forEach((u, i) => {
            const style = medals[i];
            const html = `
                <div class="rounded-xl border ${style.border} ${style.bg} p-4 flex items-center justify-between shadow-sm relative overflow-hidden">
                    <div class="flex items-center gap-4 z-10">
                        <div class="w-12 h-12 rounded-full bg-white flex items-center justify-center border ${style.border} shadow-sm">
                            <i class="fas ${style.icon} ${style.color} text-xl"></i>
                        </div>
                        <div>
                            <span class="text-[10px] uppercase font-bold ${style.color} tracking-wider block mb-0.5">${style.label}</span>
                            <h4 class="font-bold text-slate-800 text-sm leading-tight truncate max-w-[120px]">${u.nome}</h4>
                            <span class="text-xs font-bold text-slate-500">${Math.round(u.pct)}% Atingimento</span>
                        </div>
                    </div>
                    <div class="text-right z-10">
                        <span class="block text-2xl font-black ${style.color}">${u.producao.toLocaleString('pt-BR')}</span>
                        <span class="text-[9px] text-slate-400 font-bold uppercase">Produção Total</span>
                    </div>
                    <i class="fas ${style.icon} absolute -right-4 -bottom-4 text-8xl opacity-10 ${style.color}"></i>
                </div>
            `;
            podium.innerHTML += html;
        });

        // --- 2. RENDERIZAR TABELA ---
        const commonCell = "px-4 py-3 text-center text-xs text-slate-600 border-b border-slate-100";
        
        lista.forEach((u, index) => {
            const pos = index + 1;
            let rankIcon = `<span class="font-bold text-slate-400">#${pos}</span>`;
            
            if(pos === 1) rankIcon = '<i class="fas fa-crown text-yellow-500"></i>';
            if(pos === 2) rankIcon = '<i class="fas fa-medal text-slate-400"></i>';
            if(pos === 3) rankIcon = '<i class="fas fa-medal text-amber-700"></i>';

            // Cores da Barra de Progresso
            let barColor = 'bg-emerald-500';
            let txtColor = 'text-emerald-700';
            if (u.pct < 90) { barColor = 'bg-amber-500'; txtColor = 'text-amber-700'; }
            if (u.pct < 70) { barColor = 'bg-rose-500'; txtColor = 'text-rose-700'; }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition";
            tr.innerHTML = `
                <td class="${commonCell} font-bold">${rankIcon}</td>
                <td class="px-4 py-3 text-left border-b border-slate-100">
                    <span class="font-bold text-slate-700 text-sm">${u.nome}</span>
                </td>
                <td class="${commonCell} font-bold text-blue-700 bg-blue-50/30">${u.producao.toLocaleString('pt-BR')}</td>
                <td class="${commonCell}">${u.dias}</td>
                <td class="${commonCell}">${Math.round(u.media).toLocaleString('pt-BR')}</td>
                <td class="${commonCell} bg-slate-50">${Math.round(u.metaTotal).toLocaleString('pt-BR')}</td>
                <td class="px-4 py-3 border-b border-slate-100 w-[15%]">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-black ${txtColor} w-10 text-right">${Math.round(u.pct)}%</span>
                        <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} rounded-full" style="width: ${Math.min(u.pct, 100)}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};