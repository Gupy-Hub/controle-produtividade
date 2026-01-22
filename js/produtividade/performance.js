/* ARQUIVO: js/produtividade/performance.js
   DESCRIÇÃO: Engine de Performance V2 (Híbrida: RPC + Raw Data)
   CORREÇÃO: Removeu dependência de coluna inexistente 'assertividade' na tabela 'producao'
*/

Produtividade.Performance = {
    initialized: false,
    dadosRPC: [],     // Dados sumarizados por usuário (vem do Banco)
    dadosTimeline: [], // Dados brutos para o gráfico de linha
    mode: 'tracao',   // 'tracao' | 'atrito'
    chartInstance: null,

    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js required"); return; }
        this.initialized = true;
        this.setMode('tracao', false); 
        this.carregar();
    },

    setMode: function(novoModo, recarregar = true) {
        this.mode = novoModo;
        
        // Atualiza UI dos botões (Toggle Visual)
        const btnTracao = document.getElementById('btn-mode-tracao');
        const btnAtrito = document.getElementById('btn-mode-atrito');
        
        const activeClass = "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200";
        const inactiveClass = "text-slate-400 hover:text-slate-600 bg-transparent shadow-none ring-0";

        if(btnTracao && btnAtrito) {
            if(novoModo === 'tracao') {
                btnTracao.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${activeClass}`;
                btnAtrito.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${inactiveClass}`;
            } else {
                btnTracao.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${inactiveClass}`;
                btnAtrito.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${activeClass.replace('indigo', 'rose').replace('text-indigo-600', 'text-rose-600')}`;
            }
        }

        if(recarregar && this.dadosRPC.length > 0) this.renderizarCenario();
    },

    carregar: async function() {
        const container = document.getElementById('performance-engine-container');
        if(container) container.innerHTML = '<div class="text-center text-slate-400 py-20 animate-pulse"><i class="fas fa-circle-notch fa-spin mr-2"></i> Cruzando dados de performance...</div>';

        const datas = Produtividade.getDatasFiltro();
        
        try {
            // --- ESTRATÉGIA HÍBRIDA ---
            // 1. Busca Dados Sumarizados (KPIs e Rankings) via RPC (Mesma lógica da aba Geral)
            const reqRPC = Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: datas.inicio, 
                    data_fim: datas.fim 
                });

            // 2. Busca Dados Brutos APENAS para o Gráfico de Evolução (Timeline)
            // Removemos 'assertividade' daqui para corrigir o Erro 400
            const reqTimeline = Sistema.supabase
                .from('producao')
                .select('quantidade, data_referencia')
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: true });

            const [resRPC, resTimeline] = await Promise.all([reqRPC, reqTimeline]);

            if (resRPC.error) throw resRPC.error;
            if (resTimeline.error) throw resTimeline.error;

            this.dadosRPC = resRPC.data || [];
            this.dadosTimeline = resTimeline.data || [];

            this.renderizarCenario();

        } catch (err) {
            console.error("Erro Performance:", err);
            if(container) container.innerHTML = `
                <div class="bg-red-50 text-red-600 p-6 rounded-xl border border-red-100 text-center max-w-lg mx-auto mt-10">
                    <i class="fas fa-bug text-3xl mb-3 block"></i>
                    <h3 class="font-bold">Falha no processamento</h3>
                    <p class="text-sm mt-1">${err.message}</p>
                    <button onclick="Produtividade.Performance.carregar()" class="mt-4 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-xs font-bold transition">Tentar Novamente</button>
                </div>`;
        }
    },

    processarDados: function() {
        // Stats Globais
        const stats = {
            totalProducao: 0,
            totalMeta: 0,
            totalErrosEstimados: 0,
            somaAssert: 0,
            qtdAuditorias: 0,
            usuarios: []
        };

        // Processa dados vindos da RPC (Já agrupados por usuário)
        this.dadosRPC.forEach(row => {
            // Filtra cargos de gestão
            const funcao = (row.funcao || '').toUpperCase();
            if(['GESTORA', 'AUDITORA'].includes(funcao)) return;

            const qty = Number(row.total_qty) || 0;
            const meta = Number(row.meta_producao || 0) * Number(row.total_dias_uteis || 0); // Meta proporcional
            const somaAud = Number(row.soma_auditorias) || 0;
            const qtdAud = Number(row.qtd_auditorias) || 0;
            
            // Cálculos Individuais
            const mediaAssert = qtdAud > 0 ? (somaAud / qtdAud) : 100; // Se não tem auditoria, assume 100% para não penalizar injustamente
            const errosEst = qty * ((100 - mediaAssert) / 100);

            stats.totalProducao += qty;
            stats.totalMeta += meta;
            stats.somaAssert += somaAud;
            stats.qtdAuditorias += qtdAud;
            stats.totalErrosEstimados += errosEst;

            stats.usuarios.push({
                id: row.usuario_id,
                nome: row.nome,
                total: qty,
                meta: meta,
                mediaAssert: mediaAssert,
                qtdAud: qtdAud,
                erros: errosEst
            });
        });

        // Média Global de Assertividade
        stats.mediaGlobalAssert = stats.qtdAuditorias > 0 
            ? (stats.somaAssert / stats.qtdAuditorias) 
            : 0; // Se ninguém foi auditado, média é 0 ou deveria ser N/A? Vamos deixar 0 para alertar.
            
        // Se não houver produção, assertividade é 100 (padrão visual)
        if(stats.totalProducao === 0 && stats.qtdAuditorias === 0) stats.mediaGlobalAssert = 100;

        return stats;
    },

    renderizarCenario: function() {
        const container = document.getElementById('performance-engine-container');
        const stats = this.processarDados();
        
        if(stats.usuarios.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                    <i class="fas fa-inbox text-4xl mb-3 text-slate-300"></i>
                    <p>Sem dados produtivos para análise neste período.</p>
                </div>`;
            return;
        }

        let html = '';
        if(this.mode === 'tracao') {
            html = this.buildTracaoView(stats);
        } else {
            html = this.buildAtritoView(stats);
        }

        container.innerHTML = html;
        
        // Renderiza gráfico com pequeno delay para o DOM estar pronto
        setTimeout(() => {
            if(this.mode === 'tracao') this.renderChartTracao(stats);
            else this.renderChartAtrito(stats.usuarios);
        }, 50);
    },

    // --- VIEW: TRAÇÃO ---
    buildTracaoView: function(stats) {
        const users = stats.usuarios;
        const top3 = [...users].sort((a, b) => b.total - a.total).slice(0, 3);
        const mediaGeral = stats.totalProducao / (users.length || 1);
        
        return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
            <div class="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200 transform hover:scale-[1.02] transition duration-300">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-indigo-100 text-xs font-bold uppercase tracking-wider">Volume Total</p>
                        <h3 class="text-3xl font-black mt-1">${stats.totalProducao.toLocaleString()}</h3>
                    </div>
                    <div class="bg-white/20 p-2 rounded-lg backdrop-blur-sm"><i class="fas fa-rocket"></i></div>
                </div>
                <div class="mt-4 text-xs text-indigo-100 font-medium">
                    <i class="fas fa-users mr-1"></i> ${users.length} Colaboradores ativos
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Média / Colaborador</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${Math.round(mediaGeral).toLocaleString()}</h3>
                    </div>
                    <div class="bg-emerald-50 text-emerald-600 p-2 rounded-lg"><i class="fas fa-chart-bar"></i></div>
                </div>
                <div class="mt-4 text-xs text-slate-400">
                    Capacidade individual média
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Qualidade Global</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${stats.mediaGlobalAssert.toFixed(2)}%</h3>
                    </div>
                    <div class="bg-blue-50 text-blue-600 p-2 rounded-lg"><i class="fas fa-check-double"></i></div>
                </div>
                 <div class="mt-4 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-blue-500 h-1.5 rounded-full" style="width: ${Math.min(stats.mediaGlobalAssert, 100)}%"></div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-chart-area text-indigo-500 mr-2"></i> Fluxo de Entrega Diária
                </h4>
                <div class="h-72">
                    <canvas id="chart-main"></canvas>
                </div>
            </div>

            <div class="bg-gradient-to-b from-slate-50 to-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-crown text-yellow-500 mr-2"></i> Top Performers
                </h4>
                <div class="space-y-4">
                    ${top3.map((u, i) => `
                        <div class="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer group">
                            <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full font-black text-sm ${i===0 ? 'bg-yellow-100 text-yellow-700' : (i===1 ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-700')}">
                                ${i+1}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-600 transition">${u.nome}</p>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <span class="text-[10px] bg-slate-100 px-1.5 rounded text-slate-500 font-bold">${u.mediaAssert.toFixed(1)}% Qualidade</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="block text-sm font-black text-indigo-600">${u.total.toLocaleString()}</span>
                                <span class="text-[9px] text-slate-400 uppercase">Docs</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    },

    // --- VIEW: ATRITO ---
    buildAtritoView: function(stats) {
        // Ordena por menor assertividade, mas filtra quem tem produção relevante (>0)
        const atencaoList = [...stats.usuarios]
            .filter(u => u.qtdAud > 0) // Só mostra quem foi auditado
            .sort((a, b) => a.mediaAssert - b.mediaAssert)
            .slice(0, 5);
        
        const totalErros = Math.round(stats.totalErrosEstimados);
        const taxaErroGlobal = stats.totalProducao > 0 ? (totalErros / stats.totalProducao * 100) : 0;

        return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
            <div class="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm relative overflow-hidden group">
                <div class="absolute right-0 top-0 p-10 bg-rose-50 rounded-bl-full opacity-50 -mr-6 -mt-6 transition group-hover:scale-110"></div>
                <div class="relative z-10">
                    <p class="text-rose-400 text-xs font-bold uppercase tracking-wider">Desvios Estimados</p>
                    <h3 class="text-3xl font-black text-rose-600 mt-1">${totalErros.toLocaleString()}</h3>
                    <p class="text-xs text-rose-300 mt-1">Refações potenciais</p>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Taxa de Erro</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${taxaErroGlobal.toFixed(2)}%</h3>
                    </div>
                    <div class="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                        <i class="fas fa-percent"></i>
                    </div>
                </div>
            </div>

            <div class="bg-slate-800 rounded-2xl p-5 text-slate-300 shadow-lg">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Diagnóstico IA</p>
                <div class="mt-2 text-sm leading-relaxed flex items-start gap-2">
                    <i class="fas fa-robot text-blue-400 mt-1"></i>
                    <div>
                    ${taxaErroGlobal > 2 
                        ? 'Alerta: A taxa de erro excede o limite de controle (2%). Sugere-se revisão de processos.' 
                        : 'A operação está estável. Os índices de qualidade estão dentro da zona segura.'}
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-exclamation-triangle text-rose-500 mr-2"></i> Pontos de Atenção (Baixa Assertividade)
                </h4>
                <div class="h-72">
                    <canvas id="chart-main"></canvas>
                </div>
            </div>

            <div class="bg-rose-50 rounded-2xl p-6 border border-rose-100 shadow-inner">
                <h4 class="font-bold text-rose-800 mb-6 flex items-center">
                    <i class="fas fa-user-nurse text-rose-600 mr-2"></i> Prioridade de Treinamento
                </h4>
                <div class="space-y-3">
                    ${atencaoList.length === 0 ? '<p class="text-xs text-rose-400 italic">Nenhum desvio crítico encontrado.</p>' : ''}
                    ${atencaoList.map(u => `
                        <div class="bg-white p-3 rounded-lg border border-rose-100 shadow-sm flex justify-between items-center">
                            <div>
                                <p class="text-xs font-bold text-slate-700">${u.nome}</p>
                                <p class="text-[10px] text-slate-400">Vol: ${u.total.toLocaleString()}</p>
                            </div>
                            <div class="text-right">
                                <span class="block text-sm font-black ${u.mediaAssert < 95 ? 'text-rose-600' : 'text-amber-500'}">${u.mediaAssert.toFixed(2)}%</span>
                                <span class="text-[9px] text-rose-300 font-bold uppercase">Assertividade</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    },

    // --- CHART LOGIC ---
    
    renderChartTracao: function(stats) {
        const ctx = document.getElementById('chart-main').getContext('2d');
        if(this.chartInstance) this.chartInstance.destroy();

        // Agrupa os dados brutos da Timeline por Data
        const producaoPorDia = {};
        this.dadosTimeline.forEach(row => {
            const data = row.data_referencia;
            producaoPorDia[data] = (producaoPorDia[data] || 0) + (Number(row.quantidade) || 0);
        });

        const labels = Object.keys(producaoPorDia).sort();
        const dataValues = labels.map(d => producaoPorDia[d]);
        const labelsFmt = labels.map(d => d.split('-').reverse().slice(0, 2).join('/')); // DD/MM

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsFmt,
                datasets: [{
                    label: 'Produção Total',
                    data: dataValues,
                    borderColor: '#6366f1',
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
                        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
                        return gradient;
                    },
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#6366f1',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false } },
                    x: { grid: { display: false }, border: { display: false } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
    },

    renderChartAtrito: function(users) {
        const ctx = document.getElementById('chart-main').getContext('2d');
        if(this.chartInstance) this.chartInstance.destroy();

        // Pega os 10 usuários com MENOR assertividade (que tenham auditoria)
        const bottomUsers = [...users]
            .filter(u => u.qtdAud > 0)
            .sort((a, b) => a.mediaAssert - b.mediaAssert)
            .slice(0, 10);

        if(bottomUsers.length === 0) return; // Nada para plotar

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bottomUsers.map(u => u.nome.split(' ')[0]),
                datasets: [
                    {
                        label: 'Assertividade (%)',
                        data: bottomUsers.map(u => u.mediaAssert),
                        type: 'line',
                        borderColor: '#f43f5e',
                        borderWidth: 2,
                        pointBackgroundColor: '#f43f5e',
                        yAxisID: 'y1',
                        order: 0
                    },
                    {
                        label: 'Volume Produzido',
                        data: bottomUsers.map(u => u.total),
                        backgroundColor: '#cbd5e1',
                        borderRadius: 4,
                        yAxisID: 'y',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { 
                        type: 'linear', display: true, position: 'left', grid: { display: false } 
                    },
                    y1: { 
                        type: 'linear', display: true, position: 'right', min: 80, max: 100,
                        grid: { color: '#fff1f2', borderDash: [5, 5] }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};