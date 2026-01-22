/* ARQUIVO: js/produtividade/performance.js
    DESCRIÇÃO: Engine de Performance Dual (Tração vs Atrito)
    AUTOR: Equipe GupyMesa
*/

Produtividade.Performance = {
    initialized: false,
    dadosCache: [],
    mode: 'tracao', // 'tracao' | 'atrito'
    chartInstance: null,

    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js required"); return; }
        this.initialized = true;
        // Hook para garantir que o switch visual comece certo
        this.setMode('tracao', false); 
        this.carregar();
    },

    setMode: function(novoModo, recarregar = true) {
        this.mode = novoModo;
        
        // Atualiza UI dos botões
        const btnTracao = document.getElementById('btn-mode-tracao');
        const btnAtrito = document.getElementById('btn-mode-atrito');
        
        const activeClass = "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200";
        const inactiveClass = "text-slate-400 hover:text-slate-600 bg-transparent shadow-none ring-0";

        if(novoModo === 'tracao') {
            if(btnTracao) { btnTracao.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${activeClass}`; }
            if(btnAtrito) { btnAtrito.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${inactiveClass}`; }
        } else {
            if(btnTracao) { btnTracao.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${inactiveClass}`; }
            if(btnAtrito) { btnAtrito.className = `flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${activeClass.replace('indigo', 'rose')}`; } // Muda cor para vermelho no atrito
        }

        if(recarregar && this.dadosCache.length > 0) this.renderizarCenario();
    },

    carregar: async function() {
        const container = document.getElementById('performance-engine-container');
        if(container) container.innerHTML = '<div class="text-center text-slate-400 py-20 animate-pulse"><i class="fas fa-cube fa-spin mr-2"></i> Processando Analytics...</div>';

        const datas = Produtividade.getDatasFiltro();
        
        try {
            // Buscamos dados brutos. Assumimos que assertividade vem como String (ex: "98,5%") ou Number
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`id, quantidade, data_referencia, assertividade, usuario:usuarios ( id, nome, perfil, funcao )`)
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;
            this.dadosCache = data || [];
            this.renderizarCenario();

        } catch (err) {
            console.error(err);
            if(container) container.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100 text-center"><i class="fas fa-exclamation-triangle block mb-2 text-xl"></i>Erro ao carregar dados: ${err.message}</div>`;
        }
    },

    // Processa os dados brutos em métricas de negócio
    processarDados: function() {
        const stats = {
            totalProducao: 0,
            totalErrosEstimados: 0,
            diasOperacionais: new Set(),
            usuarios: {}
        };

        this.dadosCache.forEach(r => {
            if(!r.usuario) return;
            // Filtra cargos de gestão se necessário
            const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : '';
            if(['GESTORA', 'AUDITORA'].some(c => cargo.includes(c))) return;

            const qtd = Number(r.quantidade) || 0;
            // Engine de Assertividade: Converte "98,5%", "98.5", 0.985 em float percentual (0-100)
            let assertRaw = r.assertividade;
            let assertVal = 0; // Default 0 se falhar, ou 100? Vamos assumir que se tem produção e não tem assertividade, é arriscado. Vamos tentar parsear.
            
            if (typeof assertRaw === 'string') {
                assertRaw = assertRaw.replace('%', '').replace(',', '.').trim();
                assertVal = parseFloat(assertRaw);
            } else if (typeof assertRaw === 'number') {
                assertVal = assertRaw; // Assume que já está em escala 0-100 ou 0-1
                if(assertVal <= 1) assertVal = assertVal * 100; // Correção se estiver em 0.98
            }
            if(isNaN(assertVal)) assertVal = 100; // Fallback otimista ou pessimista? Otimista para não sujar o gráfico de atrito sem dados.

            // Cálculo Reverso de Erros (Já que não temos coluna de erros explícita)
            // Se produziu 100 e assertividade é 95%, erros = 5.
            const errosEstimados = qtd * ((100 - assertVal) / 100);

            stats.totalProducao += qtd;
            stats.totalErrosEstimados += errosEstimados;
            stats.diasOperacionais.add(r.data_referencia);

            if(!stats.usuarios[r.usuario.id]) {
                stats.usuarios[r.usuario.id] = {
                    id: r.usuario.id,
                    nome: r.usuario.nome,
                    total: 0,
                    erros: 0,
                    somaAssert: 0,
                    contAssert: 0
                };
            }
            stats.usuarios[r.usuario.id].total += qtd;
            stats.usuarios[r.usuario.id].erros += errosEstimados;
            stats.usuarios[r.usuario.id].somaAssert += assertVal;
            stats.usuarios[r.usuario.id].contAssert++;
        });

        // Médias Finais por Usuário
        Object.values(stats.usuarios).forEach(u => {
            u.mediaAssert = u.contAssert > 0 ? (u.somaAssert / u.contAssert) : 0;
            u.taxaErro = 100 - u.mediaAssert;
        });

        return stats;
    },

    renderizarCenario: function() {
        const container = document.getElementById('performance-engine-container');
        const stats = this.processarDados();
        const users = Object.values(stats.usuarios);

        if(users.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 py-10">Nenhum dado produtivo encontrado neste período.</div>';
            return;
        }

        let html = '';

        if(this.mode === 'tracao') {
            html = this.buildTracaoView(stats, users);
        } else {
            html = this.buildAtritoView(stats, users);
        }

        container.innerHTML = html;
        
        // Renderiza o gráfico após o HTML existir
        setTimeout(() => {
            if(this.mode === 'tracao') this.renderChartTracao(stats);
            else this.renderChartAtrito(users);
        }, 50);
    },

    // --- VIEW: TRAÇÃO (O Lado Bom) ---
    buildTracaoView: function(stats, users) {
        // Top 3 Produtividade
        const top3 = [...users].sort((a, b) => b.total - a.total).slice(0, 3);
        const mediaGeral = stats.totalProducao / (users.length || 1);
        const assertividadeMediaTime = 100 - ((stats.totalErrosEstimados / stats.totalProducao) * 100);

        return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-indigo-100 text-xs font-bold uppercase tracking-wider">Volume Total</p>
                        <h3 class="text-3xl font-black mt-1">${stats.totalProducao.toLocaleString()}</h3>
                    </div>
                    <div class="bg-white/20 p-2 rounded-lg backdrop-blur-sm"><i class="fas fa-layer-group"></i></div>
                </div>
                <div class="mt-4 text-xs text-indigo-100 font-medium">
                    <i class="fas fa-check-circle mr-1"></i> ${users.length} Colaboradores ativos
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Média / Colaborador</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${Math.round(mediaGeral).toLocaleString()}</h3>
                    </div>
                    <div class="bg-emerald-50 text-emerald-600 p-2 rounded-lg"><i class="fas fa-ruler-combined"></i></div>
                </div>
                <div class="mt-4 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-emerald-500 h-1.5 rounded-full" style="width: 75%"></div>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Qualidade Global</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${assertividadeMediaTime.toFixed(2)}%</h3>
                    </div>
                    <div class="bg-blue-50 text-blue-600 p-2 rounded-lg"><i class="fas fa-shield-alt"></i></div>
                </div>
                 <div class="mt-4 text-xs text-slate-400">
                    Sustentação operacional alta
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-chart-area text-indigo-500 mr-2"></i> Cadência de Entrega
                </h4>
                <div class="h-64">
                    <canvas id="chart-main"></canvas>
                </div>
            </div>

            <div class="bg-gradient-to-b from-slate-50 to-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-crown text-yellow-500 mr-2"></i> Top Performers
                </h4>
                <div class="space-y-4">
                    ${top3.map((u, i) => `
                        <div class="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer">
                            <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full font-black text-sm ${i===0 ? 'bg-yellow-100 text-yellow-700' : (i===1 ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-700')}">
                                ${i+1}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-bold text-slate-700 truncate">${u.nome}</p>
                                <p class="text-[10px] text-slate-400 uppercase font-bold">${u.mediaAssert.toFixed(1)}% Assertividade</p>
                            </div>
                            <div class="text-right">
                                <span class="block text-sm font-black text-indigo-600">${u.total.toLocaleString()}</span>
                                <span class="text-[9px] text-slate-400">Docs</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="mt-6 pt-4 border-t border-slate-100 text-center">
                    <p class="text-xs text-slate-400 italic">"A excelência é um hábito."</p>
                </div>
            </div>
        </div>`;
    },

    // --- VIEW: ATRITO (O Lado "Ruim") ---
    buildAtritoView: function(stats, users) {
        // Ordena por maior número de ERROS ou menor assertividade
        const atencaoList = [...users].sort((a, b) => a.mediaAssert - b.mediaAssert).slice(0, 5); // Os 5 com menor assertividade
        const totalErros = Math.round(stats.totalErrosEstimados);
        const taxaErroGlobal = (totalErros / stats.totalProducao * 100) || 0;

        return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm relative overflow-hidden">
                <div class="absolute right-0 top-0 p-10 bg-rose-50 rounded-bl-full opacity-50 -mr-6 -mt-6"></div>
                <div class="relative z-10">
                    <p class="text-rose-400 text-xs font-bold uppercase tracking-wider">Volume de Refação</p>
                    <h3 class="text-3xl font-black text-rose-600 mt-1">${totalErros.toLocaleString()}</h3>
                    <p class="text-xs text-rose-300 mt-1">Documentos com desvio (Est.)</p>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Taxa de Falha</p>
                        <h3 class="text-3xl font-black text-slate-700 mt-1">${taxaErroGlobal.toFixed(2)}%</h3>
                    </div>
                    <div class="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                        <i class="fas fa-percent"></i>
                    </div>
                </div>
            </div>

            <div class="bg-slate-800 rounded-2xl p-5 text-slate-300 shadow-lg">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Diagnóstico Rápido</p>
                <div class="mt-2 text-sm leading-relaxed">
                    <i class="fas fa-lightbulb text-yellow-400 mr-1"></i>
                    ${taxaErroGlobal > 2 ? 'A taxa de erro está acima do ideal (2%). Recomenda-se reciclagem técnica.' : 'Índices de qualidade dentro da normalidade operacional.'}
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center">
                    <i class="fas fa-crosshairs text-rose-500 mr-2"></i> Dispersão de Qualidade (Quem precisa de apoio?)
                </h4>
                <div class="h-64">
                    <canvas id="chart-main"></canvas>
                </div>
                <p class="text-[10px] text-slate-400 mt-2 text-center">Gráfico mostra relação entre Volume (Barra) e Assertividade (Linha Vermelha)</p>
            </div>

            <div class="bg-rose-50 rounded-2xl p-6 border border-rose-100 shadow-inner">
                <h4 class="font-bold text-rose-800 mb-6 flex items-center">
                    <i class="fas fa-user-nurse text-rose-600 mr-2"></i> Foco de Treinamento
                </h4>
                <div class="space-y-3">
                    ${atencaoList.map(u => `
                        <div class="bg-white p-3 rounded-lg border border-rose-100 shadow-sm flex justify-between items-center">
                            <div>
                                <p class="text-xs font-bold text-slate-700">${u.nome}</p>
                                <p class="text-[10px] text-slate-400">Produção: ${u.total}</p>
                            </div>
                            <div class="text-right">
                                <span class="block text-sm font-black ${u.mediaAssert < 95 ? 'text-rose-600' : 'text-yellow-600'}">${u.mediaAssert.toFixed(2)}%</span>
                                <span class="text-[9px] text-rose-300 font-bold uppercase">Assertividade</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    },

    // --- GRÁFICOS ---
    
    renderChartTracao: function(stats) {
        const ctx = document.getElementById('chart-main').getContext('2d');
        if(this.chartInstance) this.chartInstance.destroy();

        // Agrupa por dia para o gráfico de linha
        const dias = Array.from(stats.diasOperacionais).sort();
        const dataProd = dias.map(d => {
            // Soma produção daquele dia
            let soma = 0;
            this.dadosCache.forEach(r => { if(r.data_referencia === d) soma += (Number(r.quantidade)||0); });
            return soma;
        });

        // Formata datas
        const labels = dias.map(d => d.split('-').reverse().slice(0, 2).join('/'));

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Produção Diária',
                    data: dataProd,
                    borderColor: '#6366f1', // Indigo
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
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false } },
                    x: { grid: { display: false }, border: { display: false } }
                }
            }
        });
    },

    renderChartAtrito: function(users) {
        const ctx = document.getElementById('chart-main').getContext('2d');
        if(this.chartInstance) this.chartInstance.destroy();

        // Pega os 10 com pior assertividade para não poluir
        const bottom10 = [...users].sort((a, b) => a.mediaAssert - b.mediaAssert).slice(0, 10);

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bottom10.map(u => u.nome.split(' ')[0]), // Primeiro nome
                datasets: [
                    {
                        label: 'Assertividade (%)',
                        data: bottom10.map(u => u.mediaAssert),
                        type: 'line',
                        borderColor: '#f43f5e',
                        borderWidth: 2,
                        pointBackgroundColor: '#f43f5e',
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Volume Produzido',
                        data: bottom10.map(u => u.total),
                        backgroundColor: '#e2e8f0',
                        borderRadius: 4,
                        yAxisID: 'y'
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