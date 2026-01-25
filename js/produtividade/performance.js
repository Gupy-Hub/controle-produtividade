/* ARQUIVO: js/produtividade/performance.js
   DESCRIÇÃO: Engine de Performance V4 (Dual Core: Tração & Atrito - Full Intelligence)
   AUTOR: Equipe GupyMesa
*/

Produtividade.Performance = {
    initialized: false,
    dadosRPC: [],        // KPIs gerais do RPC
    dadosTimeline: [],   // Produção dia-a-dia para gráficos
    dadosDocs: [],       // Dados de assertividade para análise de documentos
    
    usuarioSelecionado: null, // null = Visão Time Global
    mode: 'tracao',      // 'tracao' (Positivo) | 'atrito' (Negativo)
    chartInstance: null,

    init: function() {
        if (typeof Chart === 'undefined') { console.error("Chart.js required"); return; }
        this.initialized = true;
        this.setMode('tracao', false); 
        this.carregar();
    },

    setMode: function(novoModo, recarregar = true) {
        this.mode = novoModo;
        // Toggle Visual dos Botões
        const btnTracao = document.getElementById('btn-mode-tracao');
        const btnAtrito = document.getElementById('btn-mode-atrito');
        
        const baseClass = "flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300";
        const activeClassTracao = `${baseClass} bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 transform scale-105`;
        const activeClassAtrito = `${baseClass} bg-white text-rose-600 shadow-sm ring-1 ring-rose-200 transform scale-105`;
        const inactiveClass = `${baseClass} text-slate-400 hover:text-slate-600 bg-transparent shadow-none ring-0`;

        if(btnTracao && btnAtrito) {
            if(novoModo === 'tracao') {
                btnTracao.className = activeClassTracao;
                btnAtrito.className = inactiveClass;
            } else {
                btnTracao.className = inactiveClass;
                btnAtrito.className = activeClassAtrito;
            }
        }
        
        // Se já tiver dados, renderiza o novo cenário imediatamente
        if(recarregar && this.dadosRPC.length > 0) this.renderizarCenario();
    },

    carregar: async function() {
        const container = document.getElementById('performance-engine-container');
        if(container) container.innerHTML = '<div class="text-center text-slate-400 py-24 animate-pulse"><i class="fas fa-circle-notch fa-spin text-2xl mb-4 text-indigo-400"></i><p class="font-medium">Carregando inteligência de dados...</p></div>';

        const datas = Produtividade.getDatasFiltro();
        this.usuarioSelecionado = null; 

        try {
            // 1. KPIs Gerais
            const reqRPC = Sistema.supabase.rpc('get_painel_produtividade', { 
                data_inicio: datas.inicio, data_fim: datas.fim 
            });

            // 2. Timeline (Evolução)
            const reqTimeline = Sistema.supabase.from('producao')
                .select('quantidade, data_referencia, usuario_id')
                .gte('data_referencia', datas.inicio).lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: true });

            // 3. Documentos (Assertividade) - Vital para o modo Atrito
            const reqDocs = Sistema.supabase.from('assertividade')
                .select('doc_name, status, assistente_nome, data_referencia, porcentagem_assertividade')
                .gte('data_referencia', datas.inicio).lte('data_referencia', datas.fim)
                .limit(3000); 

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
        this.usuarioSelecionado = (this.usuarioSelecionado === id) ? null : id;
        this.renderizarCenario();
    },

    // --- ENGINE DE DADOS (Processa KPIs com base no contexto e modo) ---
    processarDadosAtuais: function() {
        // 1. Filtragem Contextual (Global ou Individual)
        const usuariosFiltrados = this.usuarioSelecionado 
            ? this.dadosRPC.filter(u => u.usuario_id == this.usuarioSelecionado)
            : this.dadosRPC;

        const producaoFiltrada = this.usuarioSelecionado
            ? this.dadosTimeline.filter(p => p.usuario_id == this.usuarioSelecionado)
            : this.dadosTimeline;

        let nomeUsuarioSel = null;
        if(this.usuarioSelecionado) {
            const u = this.dadosRPC.find(x => x.usuario_id == this.usuarioSelecionado);
            if(u) nomeUsuarioSel = u.nome;
        }

        // Filtra docs pelo nome do assistente (match parcial seguro)
        const docsFiltrados = nomeUsuarioSel
            ? this.dadosDocs.filter(d => d.assistente_nome && d.assistente_nome.toLowerCase().includes(nomeUsuarioSel.split(' ')[0].toLowerCase())) 
            : this.dadosDocs;

        // 2. Estrutura de Estatísticas
        const stats = {
            totalProducao: 0,
            somaAssert: 0,
            qtdAud: 0,
            mediaAssert: 0,
            
            // Atrito Específico
            totalErrosEstimados: 0,
            totalReprovacoesReais: 0, // Baseado na tabela assertividade (NOK)
            
            melhorDia: { data: '-', qtd: 0 },
            piorDia: { data: '-', qtd: 0 }, // Dia com mais NOKs
            
            topDocs: [],     // Docs com mais acertos
            ofensorDocs: []  // Docs com mais erros
        };

        // 3. Cálculos KPI Base
        usuariosFiltrados.forEach(u => {
            const cargo = (u.funcao || '').toUpperCase();
            if(['GESTORA', 'AUDITORA'].includes(cargo) && !this.usuarioSelecionado) return;

            const qty = Number(u.total_qty) || 0;
            const sAud = Number(u.soma_auditorias) || 0;
            const qAud = Number(u.qtd_auditorias) || 0;
            const mediaUser = qAud > 0 ? (sAud / qAud) : (qty > 0 ? 100 : 0);

            stats.totalProducao += qty;
            stats.somaAssert += sAud;
            stats.qtdAud += qAud;
            
            // Estimativa de erros para KPI global
            const errosUser = qty * ((100 - mediaUser) / 100);
            stats.totalErrosEstimados += errosUser;
        });
        
        stats.mediaAssert = stats.qtdAud > 0 ? (stats.somaAssert / stats.qtdAud) : (stats.totalProducao > 0 ? 100 : 0);
        const taxaErro = 100 - stats.mediaAssert;

        // 4. Análise Temporal (Melhor e Pior Dia)
        const prodPorDia = {};
        producaoFiltrada.forEach(p => {
            prodPorDia[p.data_referencia] = (prodPorDia[p.data_referencia] || 0) + (Number(p.quantidade) || 0);
        });

        // 5. Análise de Documentos (Ouro vs Ofensores)
        const docsMap = {};
        const noksPorDia = {};

        docsFiltrados.forEach(d => {
            const nomeDoc = d.doc_name || 'Outros';
            const status = (d.status||'').toUpperCase();
            const isNok = status.includes('NOK') || status.includes('REPROV');
            const isOk = ['OK', 'VALIDO'].includes(status);

            if(!docsMap[nomeDoc]) docsMap[nomeDoc] = { nome: nomeDoc, ok: 0, nok: 0, total: 0 };
            
            docsMap[nomeDoc].total++;
            if(isOk) docsMap[nomeDoc].ok++;
            if(isNok) {
                docsMap[nomeDoc].nok++;
                stats.totalReprovacoesReais++;
                // Contagem de Pior Dia baseada em NOKs reais
                noksPorDia[d.data_referencia] = (noksPorDia[d.data_referencia] || 0) + 1;
            }
        });

        // Resolve Melhor Dia (Volume)
        Object.entries(prodPorDia).forEach(([data, qtd]) => {
            if (qtd > stats.melhorDia.qtd) stats.melhorDia = { data, qtd };
        });

        // Resolve Pior Dia (Reprovações)
        Object.entries(noksPorDia).forEach(([data, qtd]) => {
            if (qtd > stats.piorDia.qtd) stats.piorDia = { data, qtd };
        });

        // Rankings de Docs
        const docsArray = Object.values(docsMap);
        stats.topDocs = [...docsArray].sort((a,b) => b.ok - a.ok).slice(0, 5);
        stats.ofensorDocs = [...docsArray].sort((a,b) => b.nok - a.nok).slice(0, 5);

        return stats;
    },

    renderizarCenario: function() {
        const container = document.getElementById('performance-engine-container');
        const stats = this.processarDadosAtuais();
        
        // Template Base (Grid)
        let html = `
        <div class="grid grid-cols-12 gap-6 h-full animate-fade-in">
            <div class="col-span-12 lg:col-span-3 flex flex-col gap-4">
                ${this.renderSidebar(stats)}
            </div>

            <div class="col-span-12 lg:col-span-9 space-y-6">
                ${this.mode === 'tracao' ? this.buildTracaoView(stats) : this.buildAtritoView(stats)}
            </div>
        </div>`;

        container.innerHTML = html;
        setTimeout(() => this.renderChartEvolution(stats), 100);
    },

    // --- SIDEBAR (Renderiza diferente para Tração vs Atrito) ---
    renderSidebar: function(stats) {
        const isGlobal = !this.usuarioSelecionado;
        
        // Ordenação Dinâmica: Tração = Volume | Atrito = Erros Estimados
        const sorted = [...this.dadosRPC]
            .filter(u => !['GESTORA', 'AUDITORA'].includes((u.funcao||'').toUpperCase()))
            .map(u => {
                const qty = Number(u.total_qty) || 0;
                const qa = Number(u.qtd_auditorias) || 0;
                const sa = Number(u.soma_auditorias) || 0;
                const media = qa > 0 ? sa/qa : (qty > 0 ? 100 : 0);
                const erros = qty * ((100-media)/100);
                return { ...u, qty, media, erros };
            });

        if (this.mode === 'tracao') {
            sorted.sort((a,b) => b.qty - a.qty);
        } else {
            sorted.sort((a,b) => b.erros - a.erros); // Quem tem mais erro sobe
        }

        const tituloLista = this.mode === 'tracao' ? '🏆 Top Performers' : '⚠️ Pontos de Atenção';
        const corIcone = this.mode === 'tracao' ? 'text-indigo-600' : 'text-rose-500';

        let listaHtml = sorted.map((u, i) => {
            const isSelected = this.usuarioSelecionado == u.usuario_id;
            
            // Estilos
            let activeClass = '';
            let textClass = 'text-slate-600';
            let subText = '';
            let iconRank = `<div class="w-6 text-center text-xs font-bold text-slate-300">#${i+1}</div>`;

            if (this.mode === 'tracao') {
                activeClass = isSelected ? 'bg-indigo-50 border-indigo-200 shadow-inner' : 'bg-white border-transparent hover:bg-slate-50';
                textClass = isSelected ? 'text-indigo-700' : 'text-slate-600';
                subText = `${u.qty.toLocaleString()} docs`;
                if(i < 3) iconRank = ['🥇','🥈','🥉'][i];
            } else {
                activeClass = isSelected ? 'bg-rose-50 border-rose-200 shadow-inner' : 'bg-white border-transparent hover:bg-slate-50';
                textClass = isSelected ? 'text-rose-700' : 'text-slate-600';
                subText = `${Math.round(u.erros).toLocaleString()} falhas est.`;
                if(i < 3) iconRank = `<i class="fas fa-exclamation-circle text-rose-400"></i>`;
            }

            return `
            <div onclick="Produtividade.Performance.selecionarUsuario('${u.usuario_id}')" 
                 class="group cursor-pointer p-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${activeClass}">
                <div class="flex-shrink-0 text-lg grayscale group-hover:grayscale-0 transition">${iconRank}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold ${textClass} truncate">${u.nome}</p>
                    <p class="text-[10px] text-slate-400">${subText}</p>
                </div>
                ${isSelected ? '<i class="fas fa-chevron-right opacity-50 text-xs"></i>' : ''}
            </div>`;
        }).join('');

        return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[800px]">
            <div class="p-4 border-b border-slate-100 bg-slate-50">
                <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider flex justify-between items-center">
                    <span>${tituloLista}</span>
                    ${!isGlobal ? `<button onclick="Produtividade.Performance.selecionarUsuario(null)" class="text-[10px] bg-white border border-slate-300 px-2 py-1 rounded text-slate-500 hover:text-indigo-600 transition">Ver Todos</button>` : ''}
                </h4>
            </div>
            <div class="overflow-y-auto custom-scrollbar p-2 space-y-1">
                ${listaHtml}
            </div>
        </div>
        
        <div class="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden ${this.mode === 'tracao' ? 'bg-gradient-to-br from-indigo-600 to-blue-700' : 'bg-gradient-to-br from-rose-600 to-orange-700'}">
            <i class="fas ${this.mode === 'tracao' ? 'fa-trophy' : 'fa-life-ring'} absolute -bottom-4 -right-4 text-6xl text-white/10"></i>
            <p class="text-white/80 text-xs font-bold uppercase mb-1">Dica de Gestão</p>
            <p class="text-sm font-medium leading-relaxed">
                ${this.mode === 'tracao' 
                    ? 'Use a lista para identificar os motores do time. Reconheça os padrões dos Top Performers.' 
                    : 'A lista prioriza quem tem maior volume de erros. Foque o treinamento no Top 3 para maior impacto.'}
            </p>
        </div>`;
    },

    // --- VIEW: TRAÇÃO (LADO POSITIVO) ---
    buildTracaoView: function(stats) {
        return `
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-2xl font-black text-slate-800 tracking-tight">${this.getNomeContexto()}</h2>
                <p class="text-sm text-slate-400 font-medium">Análise de Performance • Visão de Crescimento</p>
            </div>
            <div class="text-right hidden sm:block">
                 <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <i class="far fa-calendar-alt mr-2"></i> Melhor Dia: ${stats.melhorDia.data !== '-' ? stats.melhorDia.data.split('-').reverse().slice(0,2).join('/') : '--'}
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
                    <span class="text-2xl font-black text-amber-600 block">${stats.melhorDia.qtd.toLocaleString()}</span>
                    <span class="text-xs font-bold text-slate-400">Docs</span>
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
                    <span><i class="fas fa-chart-line text-indigo-500 mr-2"></i> Evolução de Entrega</span>
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold uppercase" id="label-periodo-chart">Dinâmico</span>
                </h4>
                <div class="h-72"><canvas id="chart-evolution"></canvas></div>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
                <h4 class="font-bold text-slate-700 mb-4 flex items-center"><i class="fas fa-file-contract text-emerald-500 mr-2"></i> Docs de Ouro</h4>
                <p class="text-[10px] text-slate-400 mb-4">Documentos com maior volume de acertos.</p>
                <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    ${this.renderDocList(stats.topDocs, 'ok')}
                </div>
            </div>
        </div>`;
    },

    // --- VIEW: ATRITO (LADO NEGATIVO) ---
    buildAtritoView: function(stats) {
        const taxaErro = (100 - stats.mediaAssert).toFixed(2);
        
        return `
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-2xl font-black text-slate-800 tracking-tight">${this.getNomeContexto()}</h2>
                <p class="text-sm text-slate-400 font-medium">Análise de Performance • Visão de Correção</p>
            </div>
            <div class="text-right hidden sm:block">
                 <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                    <i class="fas fa-exclamation-triangle mr-2"></i> Pior Dia: ${stats.piorDia.data !== '-' ? stats.piorDia.data.split('-').reverse().slice(0,2).join('/') : '--'}
                 </span>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                <span class="text-xs font-bold text-rose-400 uppercase tracking-wider">Erros Estimados</span>
                <div class="flex items-end justify-between mt-2">
                    <span class="text-3xl font-black text-rose-600">${Math.round(stats.totalErrosEstimados).toLocaleString()}</span>
                    <div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><i class="fas fa-bug"></i></div>
                </div>
                <p class="text-[10px] text-rose-300 mt-1">Projeção estatística</p>
            </div>
            
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa de Falha</span>
                <div class="flex items-end justify-between mt-2">
                    <span class="text-3xl font-black text-slate-700">${taxaErro}%</span>
                    <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><i class="fas fa-percent"></i></div>
                </div>
                <p class="text-[10px] ${Number(taxaErro) > 2 ? 'text-rose-500 font-bold' : 'text-emerald-500'} mt-1">
                    ${Number(taxaErro) > 2 ? 'Acima do limite (2%)' : 'Dentro do esperado'}
                </p>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-rose-100 to-transparent rounded-bl-full opacity-50"></div>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider z-10">Pico de Reprovação</span>
                <div class="mt-2 z-10">
                    <span class="text-2xl font-black text-rose-600 block">${stats.piorDia.qtd} Docs</span>
                    <span class="text-xs font-bold text-slate-400">${stats.piorDia.data !== '-' ? stats.piorDia.data.split('-').reverse().join('/') : '-'}</span>
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Gargalo Técnico</span>
                <div class="flex items-end justify-between mt-2">
                    <span class="text-sm font-black text-slate-700 truncate w-full" title="${stats.ofensorDocs[0]?.nome || '-'}">
                        ${stats.ofensorDocs[0]?.nome || '-'}
                    </span>
                </div>
                 <p class="text-[10px] text-slate-400 mt-1">Doc com mais erros</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h4 class="font-bold text-slate-700 mb-6 flex items-center justify-between">
                    <span><i class="fas fa-chart-bar text-rose-500 mr-2"></i> Evolução de Falhas (NOK)</span>
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold uppercase" id="label-periodo-chart">Dinâmico</span>
                </h4>
                <div class="h-72"><canvas id="chart-evolution"></canvas></div>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
                <h4 class="font-bold text-slate-700 mb-4 flex items-center"><i class="fas fa-exclamation-circle text-rose-500 mr-2"></i> Ofensores da Qualidade</h4>
                <p class="text-[10px] text-slate-400 mb-4">Documentos com maior volume de reprovações.</p>
                <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    ${this.renderDocList(stats.ofensorDocs, 'nok')}
                </div>
            </div>
        </div>`;
    },

    // --- RENDERIZADORES COMPONENTES ---
    
    renderDocList: function(docs, tipo) {
        if(docs.length === 0) return '<p class="text-center text-xs text-slate-300 italic py-10">Sem dados.</p>';
        
        return docs.map((doc, i) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-6 h-6 rounded-full bg-white text-xs font-bold flex items-center justify-center text-slate-400 border border-slate-200 shadow-sm flex-shrink-0">${i+1}</div>
                    <span class="text-xs font-bold text-slate-600 truncate" title="${doc.nome}">${doc.nome}</span>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="block text-xs font-black ${tipo === 'ok' ? 'text-emerald-600' : 'text-rose-600'}">
                        ${tipo === 'ok' ? doc.ok : doc.nok} <span class="text-[9px] font-normal opacity-70">${tipo.toUpperCase()}</span>
                    </span>
                </div>
            </div>
        `).join('');
    },

    getNomeContexto: function() {
        if (!this.usuarioSelecionado) return "Visão Global do Time";
        const u = this.dadosRPC.find(x => x.usuario_id == this.usuarioSelecionado);
        return u ? u.nome : "Usuário";
    },

    // --- CHART ENGINE (Dinâmico para os 2 modos) ---
    renderChartEvolution: function(stats) {
        const ctx = document.getElementById('chart-evolution').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        // Dados base: Tração = Timeline Produção | Atrito = Timeline NOKs (extraído de dadosDocs)
        let dataMap = {};
        
        if (this.mode === 'tracao') {
            const raw = this.usuarioSelecionado 
                ? this.dadosTimeline.filter(p => p.usuario_id == this.usuarioSelecionado)
                : this.dadosTimeline;
            
            raw.forEach(r => dataMap[r.data_referencia] = (dataMap[r.data_referencia]||0) + Number(r.quantidade));
        } else {
            // No modo Atrito, precisamos contar os NOKs na tabela de Docs
            let rawDocs = this.usuarioSelecionado 
                ? this.dadosDocs.filter(d => d.assistente_nome && d.assistente_nome.toLowerCase().includes(this.getNomeContexto().split(' ')[0].toLowerCase()))
                : this.dadosDocs;
            
            rawDocs.forEach(d => {
                const status = (d.status||'').toUpperCase();
                if(status.includes('NOK') || status.includes('REPROV')) {
                    dataMap[d.data_referencia] = (dataMap[d.data_referencia]||0) + 1;
                }
            });
        }

        // Agrupamento Temporal
        const datas = Object.keys(dataMap).sort();
        if(datas.length === 0) return;

        const dt1 = new Date(datas[0]);
        const dt2 = new Date(datas[datas.length-1]);
        const isMonthView = ((dt2 - dt1) / (1000 * 60 * 60 * 24)) > 35;
        
        const labelEl = document.getElementById('label-periodo-chart');
        if(labelEl) labelEl.innerText = isMonthView ? "Mês a Mês" : "Dia a Dia";

        // Processa Agrupamento
        const finalMap = {};
        Object.entries(dataMap).forEach(([dt, val]) => {
            let key = isMonthView ? dt.substring(0, 7) : dt;
            finalMap[key] = (finalMap[key] || 0) + val;
        });

        const labels = Object.keys(finalMap).sort();
        const values = labels.map(k => finalMap[k]);
        
        // Estilização condicional
        const color = this.mode === 'tracao' ? '#6366f1' : '#f43f5e'; // Indigo vs Rose
        const bg = this.mode === 'tracao' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(244, 63, 94, 0.1)';

        // Formatação Label X
        const fmtLabels = labels.map(k => {
            if (isMonthView) {
                const [ano, mes] = k.split('-');
                return `${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mes)-1]}/${ano.slice(2)}`;
            }
            return k.split('-').reverse().slice(0, 2).join('/');
        });

        this.chartInstance = new Chart(ctx, {
            type: isMonthView || this.mode === 'atrito' ? 'bar' : 'line', // Atrito fica melhor em barra
            data: {
                labels: fmtLabels,
                datasets: [{
                    label: this.mode === 'tracao' ? 'Produção' : 'Reprovações',
                    data: values,
                    backgroundColor: this.mode === 'atrito' ? color : bg, // Barra solida no atrito
                    borderColor: color,
                    borderWidth: 2,
                    borderRadius: 4,
                    fill: !isMonthView && this.mode === 'tracao',
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
    }
};