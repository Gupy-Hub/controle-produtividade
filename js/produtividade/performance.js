Produtividade.Performance = {
    initialized: false,
    charts: {}, // Armazena instâncias: evolution, scatter, comparison
    dadosCache: [], 
    stats: {}, // Estatísticas calculadas

    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js não carregou."); return; }
        this.initialized = true;
        this.carregar();
    },

    carregar: async function() {
        const listContainer = document.getElementById('ranking-list-container');
        if(listContainer) listContainer.innerHTML = '<div class="text-center text-slate-400 py-10 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i> Processando Analytics...</div>';
        
        const datas = Produtividade.getDatasFiltro();
        
        try {
            // Buscamos dados brutos
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`id, quantidade, data_referencia, assertividade, usuario:usuarios ( id, nome, perfil, funcao )`)
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: true });
                
            if (error) throw error;
            
            // Processamento Inicial
            this.dadosCache = data;
            this.processarEstatisticas(data);
            this.renderizarDashboard();
            
        } catch (err) {
            console.error(err);
            if(listContainer) listContainer.innerHTML = `<div class="text-center text-red-400 py-4 text-xs">Erro ao carregar dados: ${err.message}</div>`;
        }
    },

    // --- MOTOR DE CÁLCULO ESTATÍSTICO ---
    processarEstatisticas: function(data) {
        const users = {};
        const days = {};
        let totalVol = 0;
        let totalAssertSum = 0;
        let totalAssertCount = 0;

        data.forEach(r => {
            if(!r.usuario) return;
            // Filtro de cargos (opcional, ajustável conforme regra de negócio)
            const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (['AUDITORA', 'GESTORA'].includes(cargo)) return;

            const uid = r.usuario.id;
            const date = r.data_referencia;
            const qtd = Number(r.quantidade) || 0;
            
            // Parsing Assertividade
            let assertVal = 0;
            let hasAssert = false;
            if (r.assertividade) {
                const clean = String(r.assertividade).replace('%', '').replace(',', '.').trim();
                const parsed = parseFloat(clean);
                if (!isNaN(parsed)) { assertVal = parsed; hasAssert = true; }
            }

            // Agregado por Usuário
            if (!users[uid]) {
                users[uid] = { 
                    id: uid, nome: r.usuario.nome, 
                    totalVol: 0, dias: 0, 
                    somaAssert: 0, qtdAssert: 0, 
                    mediaAssert: 0,
                    historico: [] 
                };
            }
            users[uid].totalVol += qtd;
            users[uid].dias++;
            users[uid].historico.push({ date, qtd, assertVal });
            if (hasAssert) {
                users[uid].somaAssert += assertVal;
                users[uid].qtdAssert++;
            }

            // Agregado por Dia (Time)
            if (!days[date]) { days[date] = { vol: 0, somaAssert: 0, qtdAssert: 0 }; }
            days[date].vol += qtd;
            if (hasAssert) {
                days[date].somaAssert += assertVal;
                days[date].qtdAssert++;
            }

            totalVol += qtd;
        });

        // Finalizar médias
        const userList = Object.values(users).map(u => {
            u.mediaAssert = u.qtdAssert > 0 ? (u.somaAssert / u.qtdAssert) : 0;
            u.mediaVol = u.totalVol / (u.dias || 1);
            return u;
        });

        const dayList = Object.keys(days).sort().map(d => {
            const info = days[d];
            return {
                data: d,
                vol: info.vol,
                mediaAssert: info.qtdAssert > 0 ? (info.somaAssert / info.qtdAssert) : 0
            };
        });

        this.stats = {
            users: userList,
            days: dayList,
            mediaGlobalVol: userList.length > 0 ? totalVol / userList.length : 0,
            mediaGlobalAssert: totalAssertCount > 0 ? totalAssertSum / totalAssertCount : 0 // Simplificado
        };
    },

    renderizarDashboard: function() {
        if (!this.stats.users || this.stats.users.length === 0) {
            this.limparGraficos();
            document.getElementById('ranking-list-container').innerHTML = '<div class="text-center text-slate-400 p-4 text-xs">Sem dados para o período.</div>';
            return;
        }

        this.renderizarKPIs();
        this.renderizarGraficoEvolucao();
        this.renderizarGraficoDispersao();
        this.renderizarRanking();
        // Reset comparativo
        document.getElementById('comparativo-container').innerHTML = `
            <div class="text-center text-slate-300">
                <i class="fas fa-mouse-pointer text-4xl mb-2 opacity-50"></i>
                <p class="text-xs font-bold">Selecione um assistente no ranking</p>
            </div>`;
    },

    renderizarKPIs: function() {
        const u = this.stats.users;
        const d = this.stats.days;

        // Ordenações para Produtividade
        const topVol = [...u].sort((a,b) => b.totalVol - a.totalVol)[0];
        const botVol = [...u].sort((a,b) => a.totalVol - b.totalVol)[0];
        const bestDayVol = [...d].sort((a,b) => b.vol - a.vol)[0];

        // Ordenações para Assertividade (Considerando apenas quem tem assertividade registrada)
        const uAssert = u.filter(x => x.mediaAssert > 0);
        const topAss = [...uAssert].sort((a,b) => b.mediaAssert - a.mediaAssert)[0] || { nome: '-', mediaAssert: 0 };
        const botAss = [...uAssert].sort((a,b) => a.mediaAssert - b.mediaAssert)[0] || { nome: '-', mediaAssert: 0 };
        const bestDayAss = [...d].filter(x => x.mediaAssert > 0).sort((a,b) => b.mediaAssert - a.mediaAssert)[0];

        // Preencher DOM
        const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.innerHTML = txt; };
        
        // Produtividade
        setTxt('stat-prod-max', `${topVol.nome.split(' ')[0]} <span class="text-[9px] text-slate-400 ml-1">(${topVol.totalVol})</span>`);
        setTxt('stat-prod-min', `${botVol.nome.split(' ')[0]} <span class="text-[9px] text-slate-400 ml-1">(${botVol.totalVol})</span>`);
        if(bestDayVol) {
            const p = bestDayVol.data.split('-');
            setTxt('stat-prod-best-day', `${p[2]}/${p[1]} <span class="text-[9px] text-blue-800 ml-1 font-black">(${bestDayVol.vol})</span>`);
        }

        // Assertividade
        setTxt('stat-assert-max', `${topAss.nome.split(' ')[0]} <span class="text-[9px] text-slate-400 ml-1">(${topAss.mediaAssert.toFixed(2)}%)</span>`);
        setTxt('stat-assert-min', `${botAss.nome.split(' ')[0]} <span class="text-[9px] text-slate-400 ml-1">(${botAss.mediaAssert.toFixed(2)}%)</span>`);
        if(bestDayAss) {
            const p = bestDayAss.data.split('-');
            setTxt('stat-assert-best-day', `${p[2]}/${p[1]} <span class="text-[9px] text-emerald-800 ml-1 font-black">(${bestDayAss.mediaAssert.toFixed(2)}%)</span>`);
        }

        // Diagnóstico Inteligente
        const gap = ((topVol.totalVol / botVol.totalVol - 1) * 100).toFixed(0);
        setTxt('gap-stat', `${gap}%`);
        
        let insight = "";
        const badge = document.getElementById('badge-tendencia');
        
        if (gap > 50) {
            badge.className = "text-[10px] px-2 py-0.5 rounded bg-rose-500 text-white font-bold";
            badge.innerText = "ALTA DISPARIDADE";
            insight = `Detectamos um desequilíbrio significativo. O volume de <b>${topVol.nome.split(' ')[0]}</b> é ${gap}% superior ao de <b>${botVol.nome.split(' ')[0]}</b>. Verifique se há diferenças na complexidade das tarefas ou necessidade de treinamento.`;
        } else {
            badge.className = "text-[10px] px-2 py-0.5 rounded bg-emerald-500 text-white font-bold";
            badge.innerText = "EQUILIBRADO";
            insight = `A equipe apresenta homogeneidade operacional. A variação de produtividade está dentro dos limites orgânicos esperados. O foco pode ser direcionado para elevar a média geral de assertividade.`;
        }
        setTxt('insight-performance', insight);
    },

    renderizarGraficoEvolucao: function() {
        const ctx = document.getElementById('evolutionChart').getContext('2d');
        if(this.charts.evolution) this.charts.evolution.destroy();

        const labels = this.stats.days.map(d => { const p = d.data.split('-'); return `${p[2]}/${p[1]}`; });
        const dataVol = this.stats.days.map(d => d.vol);
        const dataAss = this.stats.days.map(d => d.mediaAssert);

        this.charts.evolution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Volume (Docs)',
                        data: dataVol,
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        yAxisID: 'y',
                        order: 2,
                        borderRadius: 4
                    },
                    {
                        type: 'line',
                        label: 'Qualidade Média (%)',
                        data: dataAss,
                        borderColor: '#10b981',
                        backgroundColor: '#10b981',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 9 } } },
                    y: { type: 'linear', display: true, position: 'left', grid: { color: '#f1f5f9' }, title: { display: true, text: 'Volume', font: { size: 9 } } },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Qualidade %', font: { size: 9 } }, suggestedMin: 80, suggestedMax: 100 }
                }
            }
        });
    },

    renderizarGraficoDispersao: function() {
        const ctx = document.getElementById('scatterChart').getContext('2d');
        if(this.charts.scatter) this.charts.scatter.destroy();

        // Preparar dados XY
        // X = Volume Médio/Dia, Y = Assertividade Média
        const dataset = this.stats.users.map(u => ({
            x: u.mediaVol,
            y: u.mediaAssert,
            r: (u.totalVol / 100) + 5, // Raio baseado no total produzido (visual)
            user: u // Referência para tooltip
        }));

        this.charts.scatter = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Assistentes',
                    data: dataset,
                    backgroundColor: dataset.map(p => p.y >= 98 ? 'rgba(16, 185, 129, 0.6)' : (p.y < 95 ? 'rgba(244, 63, 94, 0.6)' : 'rgba(59, 130, 246, 0.6)')),
                    borderColor: 'transparent'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const p = context.raw;
                                return `${p.user.nome}: ${p.x.toFixed(1)} docs/dia | ${p.y.toFixed(2)}%`;
                            }
                        }
                    },
                    annotation: { // Linhas de quadrante simuladas
                        annotations: {
                            line1: { type: 'line', yMin: 98, yMax: 98, borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderDash: [4,4] },
                            line2: { type: 'line', xMin: this.stats.mediaGlobalVol, xMax: this.stats.mediaGlobalVol, borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderDash: [4,4] }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Média Produção/Dia', font: { size: 9 } } },
                    y: { title: { display: true, text: 'Assertividade %', font: { size: 9 } }, suggestedMin: 90, suggestedMax: 100 }
                }
            }
        });
    },

    renderizarRanking: function() {
        const container = document.getElementById('ranking-list-container');
        const sorted = [...this.stats.users].sort((a,b) => b.totalVol - a.totalVol);
        
        let html = '';
        sorted.forEach((u, idx) => {
            const isTop = idx === 0;
            const medal = isTop ? '<i class="fas fa-crown text-yellow-500"></i>' : `<span class="text-slate-400 font-bold text-[10px]">#${idx+1}</span>`;
            
            // Barra de progresso visual para volume
            const pct = (u.totalVol / sorted[0].totalVol) * 100;
            
            html += `
            <div onclick="Produtividade.Performance.selecionarParaComparacao('${u.id}')" 
                 class="group relative cursor-pointer p-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all mb-1">
                <div class="flex items-center justify-between relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-6 text-center">${medal}</div>
                        <div>
                            <div class="text-xs font-bold text-slate-700 group-hover:text-blue-700">${u.nome}</div>
                            <div class="text-[9px] text-slate-400 flex gap-2">
                                <span><i class="fas fa-layer-group mr-1"></i>${u.totalVol}</span>
                                <span><i class="fas fa-check-circle mr-1"></i>${u.mediaAssert.toFixed(2)}%</span>
                            </div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right text-slate-200 group-hover:text-blue-400 text-xs"></i>
                </div>
                <div class="absolute bottom-0 left-0 h-0.5 bg-blue-200 rounded-full transition-all group-hover:bg-blue-500" style="width: ${pct}%"></div>
            </div>`;
        });
        container.innerHTML = html;
    },

    selecionarParaComparacao: function(uid) {
        const user = this.stats.users.find(u => u.id == uid);
        if(!user) return;

        document.getElementById('comparativo-subtitle').innerHTML = `Comparando <b>${user.nome}</b> vs Média da Equipe vs Top Performer`;
        
        const container = document.getElementById('comparativo-container');
        container.innerHTML = '<canvas id="comparisonChart"></canvas>'; // Reset canvas
        
        const ctx = document.getElementById('comparisonChart').getContext('2d');
        if(this.charts.comparison) this.charts.comparison.destroy();

        // Dados Comparativos
        // Vamos normalizar os dados para escala 0-100 para o gráfico de radar funcionar bem
        // Mas como Volume e % são escalas diferentes, Radar pode distorcer. Vamos usar Bar Grouped ou Radar Normalizado.
        // Vamos usar Bar Chart Grouped para clareza (Volume) e Line para Qualidade? Não, Radar é melhor para "Perfil".
        
        // Vamos criar métricas normalizadas:
        // 1. Volume Total (Normalizado pelo Top)
        // 2. Assertividade (Já é 0-100)
        // 3. Consistência (100 - Desvio Padrão do volume diário - simulado aqui como Dias Ativos/Dias Úteis)
        // 4. Velocidade (Média/Dia normalizada)

        const topVol = [...this.stats.users].sort((a,b) => b.totalVol - a.totalVol)[0];
        const maxVol = topVol.totalVol || 1;
        const maxMedia = topVol.mediaVol || 1;

        // Média da Equipe
        const avgVol = this.stats.users.reduce((acc, c) => acc + c.totalVol, 0) / this.stats.users.length;
        const avgAssert = this.stats.users.reduce((acc, c) => acc + c.mediaAssert, 0) / this.stats.users.length;

        const getData = (u) => [
            (u.totalVol / maxVol) * 100, // Volume Relativo
            u.mediaAssert,               // Qualidade Real
            (u.mediaVol / maxMedia) * 100, // Velocidade Relativa
            (u.dias / (topVol.dias || 1)) * 100 // Assiduidade Relativa
        ];

        this.charts.comparison = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Volume Total', 'Qualidade', 'Velocidade (Dia)', 'Assiduidade'],
                datasets: [
                    {
                        label: user.nome.split(' ')[0],
                        data: getData(user),
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderColor: '#3b82f6',
                        pointBackgroundColor: '#3b82f6',
                        borderWidth: 2
                    },
                    {
                        label: 'Média Equipe',
                        data: [ (avgVol/maxVol)*100, avgAssert, ((avgVol/(topVol.dias||1))/maxMedia)*100, 85 ], // Aproximado
                        backgroundColor: 'rgba(148, 163, 184, 0.2)',
                        borderColor: '#94a3b8',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        borderWidth: 1
                    },
                    {
                        label: 'Top Performer',
                        data: getData(topVol),
                        backgroundColor: 'transparent',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: '#f1f5f9' },
                        grid: { color: '#f1f5f9' },
                        pointLabels: { font: { size: 10, weight: 'bold' }, color: '#64748b' },
                        suggestedMin: 0, suggestedMax: 100
                    }
                },
                plugins: { legend: { position: 'bottom' } }
            }
        });
    },

    limparGraficos: function() {
        if(this.charts.evolution) this.charts.evolution.destroy();
        if(this.charts.scatter) this.charts.scatter.destroy();
        if(this.charts.comparison) this.charts.comparison.destroy();
    },

    resetChart: function() { this.carregar(); }
};