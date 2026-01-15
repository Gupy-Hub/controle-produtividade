Produtividade.Performance = {
    initialized: false,
    chartInstance: null,
    dadosCache: [], 
    
    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js não carregou."); return; }
        // Se já inicializou, apenas recarrega os dados com as novas datas
        this.initialized = true;
        this.carregar();
    },

    carregar: async function() {
        const listContainer = document.getElementById('ranking-list-container');
        if(listContainer) listContainer.innerHTML = '<div class="text-center text-slate-400 py-10 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados...</div>';
        
        // --- INTEGRAÇÃO COM MAIN.JS ---
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio;
        const e = datas.fim;

        console.log(`🚀 Performance: Buscando de ${s} a ${e}`);

        try {
            // ADICIONADO: 'assertividade' na seleção para a lógica de qualidade
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`id, quantidade, fator, data_referencia, assertividade, usuario:usuarios ( id, nome, perfil, funcao )`)
                .gte('data_referencia', s)
                .lte('data_referencia', e)
                .order('data_referencia', { ascending: true });
                
            if (error) throw error;
            this.dadosCache = data;
            this.renderizarVisaoGeral();
        } catch (err) {
            console.error(err);
            if(listContainer) listContainer.innerHTML = `<div class="text-center text-red-400 py-4 text-xs">Erro: ${err.message}</div>`;
        }
    },

    renderizarVisaoGeral: function() {
        // Limpa estado anterior
        const btnReset = document.getElementById('btn-reset-chart');
        if(btnReset) btnReset.classList.add('hidden');
        
        const elTitle = document.getElementById('chart-title');
        if(elTitle) elTitle.innerHTML = '<i class="fas fa-chart-line text-blue-500 mr-2"></i> Evolução do Time';
        
        const elSub = document.getElementById('chart-subtitle');
        if(elSub) elSub.innerText = 'Soma da produção diária de toda a equipe';

        const data = this.dadosCache;
        if (!data || data.length === 0) {
            this.destroyChart();
            const listContainer = document.getElementById('ranking-list-container');
            if(listContainer) listContainer.innerHTML = '<div class="text-center text-slate-400 py-10 text-xs">Sem dados no período.</div>';
            return;
        }

        const producaoPorDia = {}; const diasSet = new Set(); const producaoPorUser = {};
        
        data.forEach(r => {
            if(!r.usuario) return;
            const date = r.data_referencia; const qtd = Number(r.quantidade) || 0; const uid = r.usuario.id;
            const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            
            // Ignora Gestores na Performance Operacional
            if (['AUDITORA', 'GESTORA'].includes(cargo)) return;
            
            diasSet.add(date);
            if (!producaoPorDia[date]) producaoPorDia[date] = 0; producaoPorDia[date] += qtd;
            
            if (!producaoPorUser[uid]) producaoPorUser[uid] = { nome: r.usuario.nome, total: 0, id: uid, somaAssert: 0, qtdAssert: 0 }; 
            producaoPorUser[uid].total += qtd;

            // --- LÓGICA DE ASSERTIVIDADE (BLINDADA) ---
            let pRaw = r.assertividade;
            if (pRaw) {
                let pClean = String(pRaw).replace('%', '').replace(',', '.').trim();
                if(pClean && pClean !== '-' && pClean !== '') {
                    let pVal = parseFloat(pClean);
                    // Valida range 0-100
                    if (!isNaN(pVal) && pVal >= 0 && pVal <= 100) {
                        producaoPorUser[uid].somaAssert += pVal;
                        producaoPorUser[uid].qtdAssert++;
                    }
                }
            }
        });

        // Calcula média final (opcional para exibir na lista)
        Object.values(producaoPorUser).forEach(u => {
            u.mediaAssert = u.qtdAssert > 0 ? (u.somaAssert / u.qtdAssert).toFixed(2) : '-';
        });

        const labels = Array.from(diasSet).sort();
        const values = labels.map(d => producaoPorDia[d] || 0);
        
        this.renderChart(labels, [{ 
            label: 'Produção Total do Time', 
            data: values, 
            borderColor: '#3b82f6', 
            backgroundColor: 'rgba(59, 130, 246, 0.1)', 
            borderWidth: 2, 
            tension: 0.3, 
            fill: true, 
            pointRadius: 3, 
            pointHoverRadius: 6 
        }]);
        
        this.renderRankingList(Object.values(producaoPorUser));
    },

    renderizarVisaoIndividual: function(userId, userNameRaw) {
        const userName = userNameRaw ? userNameRaw.replace(/'/g, "") : "Usuário";
        
        const btnReset = document.getElementById('btn-reset-chart');
        if(btnReset) btnReset.classList.remove('hidden');
        
        document.getElementById('chart-title').innerHTML = `<i class="fas fa-user text-emerald-500 mr-2"></i> ${userName}`;
        document.getElementById('chart-subtitle').innerText = 'Comparativo: Individual vs Média do Time';

        const data = this.dadosCache; const diasSet = new Set(); const userProd = {}; const teamProd = {}; const teamCount = {}; 
        
        data.forEach(r => {
            if(!r.usuario) return;
            const date = r.data_referencia; const qtd = Number(r.quantidade) || 0; const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (['AUDITORA', 'GESTORA'].includes(cargo)) return;
            
            diasSet.add(date);
            if (!teamProd[date]) { teamProd[date] = 0; teamCount[date] = new Set(); } 
            teamProd[date] += qtd; 
            teamCount[date].add(r.usuario.id);
            
            if (String(r.usuario.id) === String(userId)) { 
                if (!userProd[date]) userProd[date] = 0; 
                userProd[date] += qtd; 
            }
        });

        const labels = Array.from(diasSet).sort();
        const userValues = labels.map(d => userProd[d] || 0);
        const avgValues = labels.map(d => { 
            const total = teamProd[d] || 0; 
            const count = teamCount[d] ? teamCount[d].size : 1; 
            return count > 0 ? Math.round(total / count) : 0; 
        });

        this.renderChart(labels, [
            { label: 'Produção: ' + userName.split(' ')[0], data: userValues, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, tension: 0.3, fill: true },
            { label: 'Média do Time', data: avgValues, borderColor: '#94a3b8', borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 }
        ]);
    },

    renderRankingList: function(usersArray) {
        const container = document.getElementById('ranking-list-container');
        if(!container) return;
        usersArray.sort((a, b) => b.total - a.total);
        let html = '';
        usersArray.forEach((u, index) => {
            let medal = `<div class="w-6 text-center text-xs font-bold text-slate-400">#${index + 1}</div>`;
            if (index === 0) medal = `<i class="fas fa-crown text-yellow-500 w-6 text-center"></i>`;
            if (index === 1) medal = `<i class="fas fa-medal text-slate-400 w-6 text-center"></i>`;
            if (index === 2) medal = `<i class="fas fa-medal text-amber-700 w-6 text-center"></i>`;
            const safeName = u.nome.replace(/'/g, "\\'");
            
            // Exibindo Assertividade Média se disponível
            let assertTag = "";
            if (u.mediaAssert !== '-') {
                let cor = parseFloat(u.mediaAssert) >= 98 ? 'text-emerald-600' : 'text-rose-500';
                assertTag = `<span class="text-[9px] font-bold ${cor} ml-2 bg-slate-50 px-1 rounded border">Avg: ${u.mediaAssert}%</span>`;
            }

            html += `<div onclick="Produtividade.Performance.renderizarVisaoIndividual('${u.id}', '${safeName}')" class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 group transition"><div class="flex items-center gap-2">${medal}<div class="flex flex-col"><span class="text-xs font-bold text-slate-700 group-hover:text-blue-600 transition truncate w-32">${u.nome}</span>${assertTag}</div></div><span class="text-xs font-black text-slate-600">${u.total.toLocaleString()}</span></div>`;
        });
        container.innerHTML = html || '<div class="text-center text-slate-400 py-10 text-xs">Nenhum dado.</div>';
    },

    renderChart: function(labels, datasets) {
        this.destroyChart();
        const canvas = document.getElementById('evolutionChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const formattedLabels = labels.map(d => { const parts = d.split('-'); return `${parts[2]}/${parts[1]}`; });
        const finalLabels = formattedLabels.length > 0 ? formattedLabels : ['Sem Dados'];
        const finalDatasets = datasets.length > 0 ? datasets : [{ label: 'Vazio', data: [0] }];

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: finalLabels, datasets: finalDatasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, family: "'Nunito', sans-serif" } } }, tooltip: { backgroundColor: 'rgba(30, 41, 59, 0.9)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10, displayColors: true, mode: 'index', intersect: false } },
                scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 15, maxRotation: 0 } } }
            }
        });
    },

    destroyChart: function() { if (this.chartInstance) { this.chartInstance.destroy(); this.chartInstance = null; } },
    resetChart: function() { this.renderizarVisaoGeral(); }
};