{
type: "file_content",
fileName: "gupy-hub/controle-produtividade/controle-produtividade-0ee9fe2c27e96aa0d327cc7ef25749ff111b2bf7/js/produtividade/performance.js",
fullContent: `
Produtividade.Performance = {
    initialized: false,
    chartInstance: null,
    miniChartInstance: null,
    dadosProducao: [], 
    dadosAssertividade: [],
    
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
            // CORREÇÃO: Removido campo 'assertividade' que causava erro 400
            // CORREÇÃO: Sintaxe 'usuarios(...)' mais segura que alias 'usuario:usuarios'
            const [resProducao, resAssertividade] = await Promise.all([
                Sistema.supabase
                    .from('producao')
                    .select('id, quantidade, data_referencia, usuarios ( id, nome, perfil, funcao )')
                    .gte('data_referencia', s)
                    .lte('data_referencia', e)
                    .order('data_referencia', { ascending: true }),
                
                Sistema.supabase
                    .from('assertividade')
                    .select('id, data_referencia, assistente_nome, doc_name, qtd_nok, status, observacao')
                    .gte('data_referencia', s)
                    .lte('data_referencia', e)
            ]);
                
            if (resProducao.error) throw resProducao.error;
            if (resAssertividade.error) throw resAssertividade.error;

            // Normalização: Garante que 'usuario' exista mesmo sem alias
            this.dadosProducao = (resProducao.data || []).map(r => {
                r.usuario = r.usuario || r.usuarios; // Fallback
                return r;
            });
            this.dadosAssertividade = resAssertividade.data || [];

            this.renderizarVisaoGeral();
            this.analisarQualidadeDocs();
        } catch (err) {
            console.error("Erro Performance:", err);
            if(listContainer) listContainer.innerHTML = \`<div class="text-center text-red-400 py-4 text-xs">Erro: \${err.message}</div>\`;
        }
    },

    renderizarVisaoGeral: function() {
        const btnReset = document.getElementById('btn-reset-chart');
        if(btnReset) btnReset.classList.add('hidden');
        
        const elTitle = document.getElementById('chart-title');
        if(elTitle) elTitle.innerHTML = '<i class="fas fa-chart-line text-blue-500 mr-2"></i> Evolução do Time';

        const data = this.dadosProducao;
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
                producaoPorUser[uid] = { 
                    nome: r.usuario.nome, 
                    total: 0, 
                    id: uid, 
                    diasAtivos: new Set(),
                    producaoDiaria: {} 
                };
            }
            producaoPorUser[uid].total += qtd;
            producaoPorUser[uid].diasAtivos.add(date);
            producaoPorUser[uid].producaoDiaria[date] = (producaoPorUser[uid].producaoDiaria[date] || 0) + qtd;
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
        this.analisarMelhorPiorDiaGeral(producaoPorDia);
    },

    analisarQualidadeDocs: function(filtroNome = null) {
        const container = document.getElementById('analise-qualidade-docs');
        if(!container) return; // Elemento oculto estrutural

        let dados = this.dadosAssertividade;
        if(filtroNome) {
            const nomeParte = filtroNome.split(' ')[0].toLowerCase();
            dados = dados.filter(d => d.assistente_nome && d.assistente_nome.toLowerCase().includes(nomeParte));
        }

        const errosPorDoc = {};
        let totalNok = 0;

        dados.forEach(d => {
            const st = (d.status || '').toUpperCase();
            if(st.includes('NOK') || (d.qtd_nok && d.qtd_nok > 0)) {
                const doc = d.doc_name || 'Não Identificado';
                if(!errosPorDoc[doc]) errosPorDoc[doc] = 0;
                errosPorDoc[doc]++;
                totalNok++;
            }
        });

        const rankingDocs = Object.entries(errosPorDoc).sort((a, b) => b[1] - a[1]).slice(0, 5);
        this.renderizarWidgetQualidade(rankingDocs, totalNok, filtroNome);
    },

    renderizarWidgetQualidade: function(rankingDocs, totalNok, filtroNome) {
        const areaDiagnostico = document.getElementById('insight-performance');
        if(!areaDiagnostico) return;

        // Se estamos filtrando um usuário, adiciona info extra
        if(filtroNome) {
            let htmlDocs = rankingDocs.length > 0 
                ? rankingDocs.map(r => \`<span class="bg-rose-900/30 px-1 rounded text-rose-200">\${r[0]} (\${r[1]})</span>\`).join(' ')
                : "Nenhum erro crítico encontrado.";
            
            const textoExistente = areaDiagnostico.innerHTML.split('<br><br>')[0]; // Preserva texto anterior
            areaDiagnostico.innerHTML = \`\${textoExistente}<br><br><strong class="text-rose-300">⚠️ Erros Frequentes (\${filtroNome.split(' ')[0]}):</strong><br> \${htmlDocs}\`;
        }
    },

    analisarMelhorPiorDiaGeral: function(producaoPorDia) {
        const dias = Object.entries(producaoPorDia);
        if(dias.length === 0) return;
        dias.sort((a, b) => b[1] - a[1]);
        const melhor = dias[0];
        const pior = dias[dias.length - 1];
        
        const sub = document.getElementById('chart-subtitle');
        if(sub) {
            const fmt = d => d.split('-').reverse().slice(0,2).join('/');
            sub.innerHTML = \`Melhor: <b class="text-emerald-500">\${fmt(melhor[0])}</b> (\${melhor[1]}) | Pior: <b class="text-rose-500">\${fmt(pior[0])}</b> (\${pior[1]})\`;
        }
    },

    analisarExtremos: function(usersArray) {
        if (usersArray.length < 2) return;
        const ordenados = [...usersArray].sort((a, b) => b.total - a.total);
        const top = ordenados[0];
        const bottom = ordenados[ordenados.length - 1];

        const container = document.getElementById('analise-extremos-content');
        const gapPercentual = bottom.total > 0 ? ((top.total / bottom.total - 1) * 100).toFixed(1) : '∞';
        const getMelhorDia = (user) => Object.entries(user.producaoDiaria).sort((a,b)=>b[1]-a[1])[0] || ['-',0];
        const topDia = getMelhorDia(top);

        container.innerHTML = \`
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between text-xs bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                    <div>
                        <div class="font-bold text-emerald-700">🏆 Top: \${top.nome.split(' ')[0]}</div>
                        <div class="text-[9px] text-emerald-600">Recorde: \${topDia[1]} docs em \${topDia[0].split('-').reverse().slice(0,2).join('/')}</div>
                    </div>
                    <span class="font-black text-emerald-800 text-lg">\${top.total.toLocaleString()}</span>
                </div>
                <div class="flex items-center justify-between text-xs bg-rose-50 p-2 rounded-lg border border-rose-100">
                    <span class="font-bold text-rose-700">📉 Base: \${bottom.nome.split(' ')[0]}</span>
                    <span class="font-black text-rose-800 text-lg">\${bottom.total.toLocaleString()}</span>
                </div>
                <div class="text-[10px] font-bold text-slate-500 uppercase pt-1 px-1 flex justify-between">
                    <span>GAP Performance:</span>
                    <span class="text-slate-800 bg-slate-200 px-1 rounded">\${gapPercentual}%</span>
                </div>
            </div>
        \`;

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
            if(badge) { badge.innerText = "DISPARIDADE ALTA"; badge.className = "ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold bg-rose-500 text-white"; }
            texto = \`Gap crítico. **\${top.nome.split(' ')[0]}** (\${mTop.toFixed(0)}/dia) vs **\${bottom.nome.split(' ')[0]}** (\${mBottom.toFixed(0)}/dia).\`;
        } else {
            if(badge) { badge.innerText = "EQUILIBRADO"; badge.className = "ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-500 text-white"; }
            texto = \`Produção coesa. Variação orgânica entre os extremos.\`;
        }
        if(insight) insight.innerHTML = texto;
    },

    renderMiniChart: function(top, bottom) {
        const ctx = document.getElementById('chartMiniComparativo').getContext('2d');
        if (this.miniChartInstance) this.miniChartInstance.destroy();
        this.miniChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: [top.nome, bottom.nome], datasets: [{ data: [top.total, bottom.total], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, cutout: '70%' }] },
            options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: false }
        });
    },

    renderRankingList: function(usersArray) {
        const container = document.getElementById('ranking-list-container');
        usersArray.sort((a, b) => b.total - a.total);
        let html = '';
        usersArray.forEach((u, index) => {
            let icon = \`<div class="w-6 text-[10px] font-bold text-slate-400">#\${index + 1}</div>\`;
            if (index === 0) icon = \`<i class="fas fa-crown text-yellow-500 w-6 text-center"></i>\`;
            html += \`<div onclick="Produtividade.Performance.renderizarVisaoIndividual('\${u.id}', '\${u.nome}')" class="flex items-center justify-between p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition group border-b border-slate-50">
                <div class="flex items-center gap-2">\${icon}<span class="text-xs font-bold text-slate-700 truncate w-24 sm:w-32">\${u.nome}</span></div>
                <div class="flex items-center"><span class="text-xs font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded">\${u.total.toLocaleString()}</span></div>
            </div>\`;
        });
        container.innerHTML = html;
    },

    renderizarVisaoIndividual: function(uid, nome) {
        const btnReset = document.getElementById('btn-reset-chart');
        if(btnReset) btnReset.classList.remove('hidden');
        document.getElementById('chart-title').innerHTML = \`<i class="fas fa-user text-blue-500 mr-2"></i> Análise: \${nome}\`;

        const userRecs = this.dadosProducao.filter(r => (r.usuario && r.usuario.id === uid));
        const userMap = {};
        userRecs.forEach(r => { userMap[r.data_referencia] = (userMap[r.data_referencia] || 0) + Number(r.quantidade); });

        const labels = Object.keys(userMap).sort();
        const dataUser = labels.map(d => userMap[d]);
        const dataMedia = labels.map(d => {
            let soma = 0; let count = 0;
            this.dadosProducao.forEach(r => { if(r.data_referencia === d && r.quantidade > 0) { soma += Number(r.quantidade); count++; } });
            return count > 0 ? (soma / count).toFixed(0) : 0;
        });

        this.renderChart(labels, [
            { label: nome, data: dataUser, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)', borderWidth: 2, tension: 0.3, fill: true },
            { label: 'Média do Time', data: dataMedia, borderColor: '#94a3b8', borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 }
        ]);
        this.analisarQualidadeDocs(nome);
    },

    renderChart: function(labels, datasets) {
        this.destroyChart();
        const ctx = document.getElementById('evolutionChart').getContext('2d');
        const fmtLabels = labels.map(d => { const p = d.split('-'); return \`\${p[2]}/\${p[1]}\`; });
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: fmtLabels, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } }
        });
    },

    destroyChart: function() { if (this.chartInstance) this.chartInstance.destroy(); },
    resetChart: function() { this.renderizarVisaoGeral(); }
};
`
}