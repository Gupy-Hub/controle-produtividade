Produtividade.Performance = {
    initialized: false,
    chartInstance: null,
    miniChartInstance: null,
    dadosCache: [], 
    
    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js não carregou."); return; }
        this.initialized = true;
        this.carregar();
    },

    carregar: async function() {
        const listContainer = document.getElementById('ranking-list-container');
        if(listContainer) listContainer.innerHTML = '<div class="text-center text-slate-400 py-10 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados...</div>';
        
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio;
        const e = datas.fim;

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`id, quantidade, data_referencia, assertividade, usuario:usuarios ( id, nome, perfil, funcao )`)
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
        const btnReset = document.getElementById('btn-reset-chart');
        if(btnReset) btnReset.classList.add('hidden');
        
        const elTitle = document.getElementById('chart-title');
        if(elTitle) elTitle.innerHTML = '<i class="fas fa-chart-line text-blue-500 mr-2"></i> Evolução do Time';

        const data = this.dadosCache;
        if (!data || data.length === 0) {
            this.destroyChart();
            return;
        }

        const producaoPorDia = {}; const diasSet = new Set(); const producaoPorUser = {};
        
        data.forEach(r => {
            if(!r.usuario) return;
            const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (['AUDITORA', 'GESTORA'].includes(cargo)) return;
            
            const date = r.data_referencia; const qtd = Number(r.quantidade) || 0; const uid = r.usuario.id;
            diasSet.add(date);
            if (!producaoPorDia[date]) producaoPorDia[date] = 0; producaoPorDia[date] += qtd;
            
            if (!producaoPorUser[uid]) {
                producaoPorUser[uid] = { nome: r.usuario.nome, total: 0, id: uid, somaAssert: 0, qtdAssert: 0, diasAtivos: new Set() };
            }
            producaoPorUser[uid].total += qtd;
            producaoPorUser[uid].diasAtivos.add(date);

            if (r.assertividade) {
                let pClean = String(r.assertividade).replace('%', '').replace(',', '.').trim();
                let pVal = parseFloat(pClean);
                if (!isNaN(pVal)) { producaoPorUser[uid].somaAssert += pVal; producaoPorUser[uid].qtdAssert++; }
            }
        });

        const labels = Array.from(diasSet).sort();
        const values = labels.map(d => producaoPorDia[d] || 0);
        
        this.renderChart(labels, [{ 
            label: 'Produção Total do Time', data: values, borderColor: '#3b82f6', 
            backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, tension: 0.3, fill: true 
        }]);
        
        const usersArray = Object.values(producaoPorUser);
        this.renderRankingList(usersArray);
        this.analisarExtremos(usersArray);
    },

    analisarExtremos: function(usersArray) {
        if (usersArray.length < 2) return;
        const ordenados = [...usersArray].sort((a, b) => b.total - a.total);
        const top = ordenados[0];
        const bottom = ordenados[ordenados.length - 1];

        const container = document.getElementById('analise-extremos-content');
        const gapPercentual = ((top.total / bottom.total - 1) * 100).toFixed(1);

        container.innerHTML = `
            <div class="flex items-center justify-between text-xs bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                <span class="font-bold text-emerald-700">🏆 Top: ${top.nome.split(' ')[0]}</span>
                <span class="font-black text-emerald-800">${top.total.toLocaleString()} docs</span>
            </div>
            <div class="flex items-center justify-between text-xs bg-rose-50 p-2 rounded-lg border border-rose-100">
                <span class="font-bold text-rose-700">📉 Base: ${bottom.nome.split(' ')[0]}</span>
                <span class="font-black text-rose-800">${bottom.total.toLocaleString()} docs</span>
            </div>
            <div class="text-[10px] font-bold text-slate-500 uppercase pt-1 px-1">
                GAP de Performance: <span class="text-slate-800">${gapPercentual}%</span>
            </div>
        `;

        this.renderMiniChart(top, bottom);
        this.gerarDiagnostico(top, bottom, gapPercentual);
    },

    gerarDiagnostico: function(top, bottom, gap) {
        const badge = document.getElementById('badge-tendencia');
        const insight = document.getElementById('insight-performance');
        const mTop = top.total / (top.diasAtivos.size || 1);
        const mBottom = bottom.total / (bottom.diasAtivos.size || 1);

        let texto = "";
        if (gap > 40) {
            badge.innerText = "TENDÊNCIA: DISPARIDADE";
            badge.className = "ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold bg-rose-500 text-white";
            texto = `Análise detectou um gap crítico. Enquanto **${top.nome.split(' ')[0]}** opera com média de ${mTop.toFixed(1)}/dia, **${bottom.nome.split(' ')[0]}** entrega ${mBottom.toFixed(1)}/dia. Esta variação sugere necessidade de nivelamento técnico ou revisão de carga horária.`;
        } else {
            badge.innerText = "TENDÊNCIA: EQUILÍBRIO";
            badge.className = "ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-500 text-white";
            texto = `O time apresenta alta coesão produtiva. A variação de ${gap}% entre os extremos é considerada orgânica. O fluxo de trabalho está distribuído de forma equitativa entre a equipe.`;
        }
        insight.innerHTML = texto;
    },

    renderMiniChart: function(top, bottom) {
        const ctx = document.getElementById('chartMiniComparativo').getContext('2d');
        if (this.miniChartInstance) this.miniChartInstance.destroy();
        this.miniChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [top.nome, bottom.nome],
                datasets: [{ data: [top.total, bottom.total], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, cutout: '75%' }]
            },
            options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
        });
    },

    renderRankingList: function(usersArray) {
        const container = document.getElementById('ranking-list-container');
        usersArray.sort((a, b) => b.total - a.total);
        let html = '';
        usersArray.forEach((u, index) => {
            let icon = `<div class="w-6 text-[10px] font-bold text-slate-400">#${index + 1}</div>`;
            if (index === 0) icon = `<i class="fas fa-crown text-yellow-500 w-6 text-center"></i>`;
            html += `<div onclick="Produtividade.Performance.renderizarVisaoIndividual('${u.id}', '${u.nome}')" class="flex items-center justify-between p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition group border-b border-slate-50">
                <div class="flex items-center gap-2">${icon}<span class="text-xs font-bold text-slate-700 truncate w-32">${u.nome}</span></div>
                <span class="text-xs font-black text-slate-600">${u.total.toLocaleString()}</span>
            </div>`;
        });
        container.innerHTML = html;
    },

    renderChart: function(labels, datasets) {
        this.destroyChart();
        const ctx = document.getElementById('evolutionChart').getContext('2d');
        const fmtLabels = labels.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: fmtLabels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
                plugins: { legend: { position: 'bottom' } }
            }
        });
    },

    destroyChart: function() { if (this.chartInstance) this.chartInstance.destroy(); },
    resetChart: function() { this.renderizarVisaoGeral(); }
};