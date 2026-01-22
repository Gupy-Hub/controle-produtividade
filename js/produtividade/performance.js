/* ARQUIVO: js/produtividade/performance.js
   DESCRIÇÃO: Engine de Performance V3 (Tração Premium + Master/Detail UX)
   AUTOR: Equipe GupyMesa
*/

Produtividade.Performance = {
    initialized: false,
    dadosRPC: [],        // KPIs gerais do RPC
    dadosTimeline: [],   // Produção dia-a-dia para gráficos
    dadosDocs: [],       // Dados de assertividade para análise de documentos
    
    usuarioSelecionado: null, // null = Visão Time Global
    mode: 'tracao',      // 'tracao' | 'atrito'
    chartInstance: null,
    chartDocsInstance: null,

    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js required"); return; }
        this.initialized = true;
        this.setMode('tracao', false); 
        this.carregar();
    },

    setMode: function(novoModo, recarregar = true) {
        this.mode = novoModo;
        // Atualiza botões (Toggle Visual)
        const btnTracao = document.getElementById('btn-mode-tracao');
        const btnAtrito = document.getElementById('btn-mode-atrito');
        const activeClass = "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 transform scale-105";
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
        if(container) container.innerHTML = '<div class="text-center text-slate-400 py-24 animate-pulse"><i class="fas fa-circle-notch fa-spin text-2xl mb-4 text-indigo-400"></i><p class="font-medium">Carregando inteligência de dados...</p></div>';

        const datas = Produtividade.getDatasFiltro();
        this.usuarioSelecionado = null; // Reseta seleção ao recarregar período

        try {
            // 1. KPIs Gerais
            const reqRPC = Sistema.supabase.rpc('get_painel_produtividade', { 
                data_inicio: datas.inicio, data_fim: datas.fim 
            });

            // 2. Timeline (Evolução) - Trazendo usuario_id para filtro local
            const reqTimeline = Sistema.supabase.from('producao')
                .select('quantidade, data_referencia, usuario_id')
                .gte('data_referencia', datas.inicio).lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: true });

            // 3. Documentos (Assertividade) - Para o ranking de docs
            // Buscamos 'doc_name' e status. Tentamos usar assistente_nome para linkar depois.
            const reqDocs = Sistema.supabase.from('assertividade')
                .select('doc_name, status, assistente_nome, data_referencia')
                .gte('data_referencia', datas.inicio).lte('data_referencia', datas.fim)
                .limit(2000); // Limite de segurança para performance

            const [resRPC, resTimeline, resDocs] = await Promise.all([reqRPC, reqTimeline, reqDocs]);

            if (resRPC.error) throw resRPC.error;
            if (resTimeline.error) throw resTimeline.error;

            this.dadosRPC = resRPC.data || [];
            this.dadosTimeline = resTimeline.data || [];
            this.dadosDocs = resDocs.data || [];

            this.renderizarCenario();

        } catch (err) {
            console.error("Erro Performance:", err);
            if(container) container.innerHTML = `<div class="bg-red-50 text-red-600 p-6 rounded-xl border border-red-100 text-center"><p>Erro ao processar dados: ${err.message}</p></div>`;
        }
    },

    selecionarUsuario: function(id) {
        // Se clicar no mesmo, desseleciona (volta pro global)
        this.usuarioSelecionado = (this.usuarioSelecionado === id) ? null : id;
        this.renderizarCenario();
    },

    // --- PROCESSAMENTO PRINCIPAL ---
    processarDadosAtuais: function() {
        // Filtra os dados baseados no usuarioSelecionado
        const usuariosFiltrados = this.usuarioSelecionado 
            ? this.dadosRPC.filter(u => u.usuario_id == this.usuarioSelecionado)
            : this.dadosRPC;

        const producaoFiltrada = this.usuarioSelecionado
            ? this.dadosTimeline.filter(p => p.usuario_id == this.usuarioSelecionado)
            : this.dadosTimeline;

        // Para docs, precisamos filtrar por nome aproximado pois a tabela assertividade pode não ter ID
        // Vamos tentar pegar o nome do usuário selecionado
        let nomeUsuarioSel = null;
        if(this.usuarioSelecionado) {
            const u = this.dadosRPC.find(x => x.usuario_id == this.usuarioSelecionado);
            if(u) nomeUsuarioSel = u.nome;
        }

        const docsFiltrados = nomeUsuarioSel
            ? this.dadosDocs.filter(d => d.assistente_nome && d.assistente_nome.toLowerCase().includes(nomeUsuarioSel.toLowerCase().split(' ')[0].toLowerCase())) // Match básico pelo primeiro nome
            : this.dadosDocs;

        // --- CÁLCULOS ---
        const stats = {
            totalProducao: 0,
            somaAssert: 0,
            qtdAud: 0,
            mediaAssert: 0,
            usuarios: [],
            melhorDia: { data: '-', qtd: 0 },
            topDocs: []
        };

        // 1. KPIs Básicos
        usuariosFiltrados.forEach(u => {
            const cargo = (u.funcao || '').toUpperCase();
            if(['GESTORA', 'AUDITORA'].includes(cargo) && !this.usuarioSelecionado) return; // Se global, ignora gestão

            stats.totalProducao += (Number(u.total_qty) || 0);
            stats.somaAssert += (Number(u.soma_auditorias) || 0);
            stats.qtdAud += (Number(u.qtd_auditorias) || 0);
            stats.usuarios.push(u);
        });
        
        stats.mediaAssert = stats.qtdAud > 0 ? (stats.somaAssert / stats.qtdAud) : (stats.totalProducao > 0 ? 100 : 0);

        // 2. Melhor Dia
        const prodPorDia = {};
        producaoFiltrada.forEach(p => {
            prodPorDia[p.data_referencia] = (prodPorDia[p.data_referencia] || 0) + (Number(p.quantidade) || 0);
        });
        Object.entries(prodPorDia).forEach(([data, qtd]) => {
            if (qtd > stats.melhorDia.qtd) stats.melhorDia = { data, qtd };
        });

        // 3. Top Docs (Assertividade)
        const docsMap = {};
        docsFiltrados.forEach(d => {
            const nomeDoc = d.doc_name || 'Outros';
            if(!docsMap[nomeDoc]) docsMap[nomeDoc] = { nome: nomeDoc, ok: 0, total: 0 };
            docsMap[nomeDoc].total++;
            if(['OK', 'VALIDO'].includes((d.status||'').toUpperCase())) docsMap[nomeDoc].ok++;
        });
        stats.topDocs = Object.values(docsMap)
            .sort((a,b) => b.ok - a.ok) // Ordena por volume de acertos
            .slice(0, 5);

        return stats;
    },

    renderizarCenario: function() {
        const container = document.getElementById('performance-engine-container');
        const stats = this.processarDadosAtuais();
        const isGlobal = !this.usuarioSelecionado;

        if (this.dadosRPC.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 py-20">Sem dados para análise.</div>';
            return;
        }

        // --- LAYOUT GRID: SIDEBAR (Ranking) + MAIN CONTENT ---
        let html = `
        <div class="grid grid-cols-12 gap-6 h-full">
            
            <div class="col-span-12 lg:col-span-3 flex flex-col gap-4">
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[800px]">
                    <div class="p-4 border-b border-slate-100 bg-slate-50">
                        <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider flex justify-between items-center">
                            <span>🏆 Top Performers</span>
                            ${!isGlobal ? `<button onclick="Produtividade.Performance.selecionarUsuario(null)" class="text-[10px] bg-white border border-slate-300 px-2 py-1 rounded text-slate-500 hover:text-indigo-600 transition">Ver Todos</button>` : ''}
                        </h4>
                    </div>
                    <div class="overflow-y-auto custom-scrollbar p-2 space-y-1">
                        ${this.renderSidebarList()}
                    </div>
                </div>
                
                <div class="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                    <i class="fas fa-trophy absolute -bottom-4 -right-4 text-6xl text-white/10"></i>
                    <p class="text-indigo-200 text-xs font-bold uppercase mb-1">Dica de Gestão</p>
                    <p class="text-sm font-medium leading-relaxed">
                        ${isGlobal ? 'Clique em um nome na lista acima para filtrar todos os gráficos.' : 'Você está visualizando os dados individuais. Clique em "Ver Todos" para voltar.'}
                    </p>
                </div>
            </div>

            <div class="col-span-12 lg:col-span-9 space-y-6">
                
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tight">
                            ${this.getNomeContexto()}
                        </h2>
                        <p class="text-sm text-slate-400 font-medium">Análise de Performance • ${this.mode === 'tracao' ? 'Visão de Crescimento' : 'Visão de Correção'}</p>
                    </div>
                    <div class="text-right hidden sm:block">
                         <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <i class="far fa-calendar-alt mr-2"></i> ${stats.melhorDia.data !== '-' ? 'Melhor Dia: ' + stats.melhorDia.data.split('-').reverse().slice(0,2).join('/') : '--'}
                         </span>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume Total</span>
                        <div class="flex items-end justify-between mt-2">
                            <span class="text-3xl font-black text-slate-800">${stats.totalProducao.toLocaleString()}</span>
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><i class="fas fa-layer-group"></i></div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Assertividade</span>
                        <div class="flex items-end justify-between mt-2">
                            <span class="text-3xl font-black ${stats.mediaAssert >= 98 ? 'text-emerald-600' : 'text-amber-500'}">${stats.mediaAssert.toFixed(2)}%</span>
                            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-check-circle"></i></div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-amber-100 to-transparent rounded-bl-full opacity-50"></div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider z-10">Recorde Diário</span>
                        <div class="mt-2 z-10">
                            <span class="text-2xl font-black text-amber-600 block">${stats.melhorDia.qtd} Docs</span>
                            <span class="text-xs font-bold text-slate-400">${stats.melhorDia.data !== '-' ? stats.melhorDia.data.split('-').reverse().join('/') : '-'}</span>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Auditorias</span>
                        <div class="flex items-end justify-between mt-2">
                            <span class="text-3xl font-black text-slate-700">${stats.qtdAud.toLocaleString()}</span>
                            <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><i class="fas fa-search"></i></div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                        <h4 class="font-bold text-slate-700 mb-6 flex items-center justify-between">
                            <span><i class="fas fa-chart-line text-indigo-500 mr-2"></i> Evolução Temporal</span>
                            <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold uppercase" id="label-periodo-chart">Dinâmico</span>
                        </h4>
                        <div class="h-72">
                            <canvas id="chart-evolution"></canvas>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
                        <h4 class="font-bold text-slate-700 mb-4 flex items-center">
                            <i class="fas fa-file-contract text-emerald-500 mr-2"></i> Documentos de Ouro
                        </h4>
                        <p class="text-[10px] text-slate-400 mb-4">Tipos de documentos com maior volume de acertos no período.</p>
                        
                        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                            ${stats.topDocs.length === 0 ? '<p class="text-center text-xs text-slate-300 italic py-10">Sem dados de documentos.</p>' : ''}
                            ${stats.topDocs.map((doc, i) => `
                                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div class="flex items-center gap-3 overflow-hidden">
                                        <div class="w-6 h-6 rounded-full bg-white text-xs font-bold flex items-center justify-center text-slate-400 border border-slate-200 shadow-sm flex-shrink-0">${i+1}</div>
                                        <span class="text-xs font-bold text-slate-600 truncate" title="${doc.nome}">${doc.nome}</span>
                                    </div>
                                    <div class="text-right flex-shrink-0">
                                        <span class="block text-xs font-black text-emerald-600">${doc.ok} <span class="text-[9px] font-normal text-emerald-400">OK</span></span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

            </div>
        </div>`;

        container.innerHTML = html;

        setTimeout(() => {
            this.renderChartEvolution(stats);
        }, 100);
    },

    // --- RENDERIZADORES AUXILIARES ---

    renderSidebarList: function() {
        // Ordena usuários pela métrica principal (Volume)
        const sorted = [...this.dadosRPC]
            .filter(u => !['GESTORA', 'AUDITORA'].includes((u.funcao||'').toUpperCase())) // Esconde gestores da lista lateral para focar na operação
            .sort((a,b) => Number(b.total_qty) - Number(a.total_qty));

        return sorted.map((u, i) => {
            const isSelected = this.usuarioSelecionado == u.usuario_id;
            const activeClass = isSelected ? 'bg-indigo-50 border-indigo-200 shadow-inner' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100';
            const textClass = isSelected ? 'text-indigo-700' : 'text-slate-600';
            
            // Medalhas
            let icon = `<div class="w-6 text-center text-xs font-bold text-slate-300">#${i+1}</div>`;
            if(i === 0) icon = '🥇';
            if(i === 1) icon = '🥈';
            if(i === 2) icon = '🥉';

            return `
            <div onclick="Produtividade.Performance.selecionarUsuario('${u.usuario_id}')" 
                 class="group cursor-pointer p-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${activeClass}">
                <div class="flex-shrink-0 text-lg grayscale group-hover:grayscale-0 transition">${icon}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold ${textClass} truncate">${u.nome}</p>
                    <p class="text-[10px] text-slate-400">${Number(u.total_qty).toLocaleString()} docs</p>
                </div>
                ${isSelected ? '<i class="fas fa-chevron-right text-indigo-400 text-xs"></i>' : ''}
            </div>`;
        }).join('');
    },

    getNomeContexto: function() {
        if (!this.usuarioSelecionado) return "Visão Global do Time";
        const u = this.dadosRPC.find(x => x.usuario_id == this.usuarioSelecionado);
        return u ? u.nome : "Usuário";
    },

    renderChartEvolution: function(stats) {
        const ctx = document.getElementById('chart-evolution').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        // Filtra timeline pelo usuário se selecionado
        const rawData = this.usuarioSelecionado 
            ? this.dadosTimeline.filter(p => p.usuario_id == this.usuarioSelecionado)
            : this.dadosTimeline;

        // Decisão Inteligente: Agrupar por Mês ou Dia?
        const datas = rawData.map(d => d.data_referencia).sort();
        if(datas.length === 0) return;

        const dtInicio = new Date(datas[0]);
        const dtFim = new Date(datas[datas.length-1]);
        const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
        
        const isMonthView = diffDays > 35; // Se mais de 35 dias, agrupa por Mês
        document.getElementById('label-periodo-chart').innerText = isMonthView ? "Mês a Mês" : "Dia a Dia";

        const dataMap = {};
        
        rawData.forEach(row => {
            let key = row.data_referencia; // Padrão YYYY-MM-DD
            if (isMonthView) {
                // Converte para YYYY-MM para agrupar
                key = key.substring(0, 7); 
            }
            dataMap[key] = (dataMap[key] || 0) + (Number(row.quantidade) || 0);
        });

        const labels = Object.keys(dataMap).sort();
        const values = labels.map(k => dataMap[k]);
        
        // Formatação das Labels para o usuário
        const fmtLabels = labels.map(k => {
            if (isMonthView) {
                const [ano, mes] = k.split('-');
                const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                return `${meses[parseInt(mes)-1]}/${ano.slice(2)}`;
            } else {
                return k.split('-').reverse().slice(0, 2).join('/');
            }
        });

        this.chartInstance = new Chart(ctx, {
            type: isMonthView ? 'bar' : 'line', // Barra para meses, Linha para dias
            data: {
                labels: fmtLabels,
                datasets: [{
                    label: 'Produção',
                    data: values,
                    backgroundColor: isMonthView ? '#6366f1' : 'rgba(99, 102, 241, 0.1)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 4,
                    fill: !isMonthView,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false } },
                    x: { grid: { display: false }, border: { display: false } }
                }
            }
        });
    }
};