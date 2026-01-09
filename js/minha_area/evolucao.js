MinhaArea.Evolucao = {
    subAbaAtual: 'dash', // dash | auditoria | evolucao
    dadosCache: [],

    carregar: async function() {
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA' || MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        // Se for assistente, restringe navegação (pode ver Dash e Evolução, mas Auditoria Detalhada costuma ser restrita ou filtrada)
        if (!isGestora && this.subAbaAtual === 'auditoria') this.subAbaAtual = 'dash';

        this.renderizarLayout(isGestora);
        
        if (this.subAbaAtual === 'auditoria' && isGestora) {
            await this.carregarAuditoria();
        } else if (this.subAbaAtual === 'evolucao') {
            await this.carregarEvolucao();
        } else {
            await this.carregarDashAssistentes();
        }
    },

    mudarPeriodo: function() {
        if (this.subAbaAtual === 'auditoria') this.carregarAuditoria();
        else if (this.subAbaAtual === 'evolucao') this.carregarEvolucao();
        else this.carregarDashAssistentes();
    },

    mudarSubAba: function(novaAba) {
        this.subAbaAtual = novaAba;
        this.carregar();
    },

    aplicarFiltroAssistente: function() {
        if (this.subAbaAtual === 'evolucao') this.carregarEvolucao();
        else if (this.subAbaAtual === 'auditoria') this.carregarAuditoria();
        else this.carregarDashAssistentes();
    },

    // --- LAYOUT ---
    renderizarLayout: function(isGestora) {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        let navHtml = '';
        if (isGestora) {
            navHtml = `
                <div class="flex flex-wrap items-center gap-2 mb-6 bg-white p-1 rounded-lg border border-slate-200 w-fit">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Dash Geral
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('evolucao')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'evolucao' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Evolução (Metas)
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('auditoria')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'auditoria' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Auditoria (Log)
                    </button>
                </div>
            `;
        } else {
            navHtml = `
                <div class="flex items-center gap-2 mb-6 bg-white p-1 rounded-lg border border-slate-200 w-fit">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Resumo
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('evolucao')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'evolucao' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Minhas Metas
                    </button>
                </div>`;
        }

        // Importador (Apenas na aba Auditoria)
        let importHtml = '';
        if (isGestora && this.subAbaAtual === 'auditoria') {
            importHtml = `
                <div class="flex justify-end mb-4 animate-enter">
                    <label class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 rounded-lg cursor-pointer transition flex items-center gap-2 shadow-sm">
                        <i class="fas fa-cloud-upload-alt text-blue-500"></i> Importar Auditoria (Log)
                        <input type="file" accept=".csv, .xlsx, .xls" class="hidden" onchange="MinhaArea.Evolucao.importarAuditoria(this)">
                    </label>
                </div>
            `;
        }

        container.innerHTML = `
            ${navHtml}
            ${importHtml}
            <div id="conteudo-okr" class="flex flex-col gap-6">
                <div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</div>
            </div>
        `;
    },

    // =================================================================================
    // MÓDULO 3: EVOLUÇÃO (METAS / OKR)
    // =================================================================================
    carregarEvolucao: async function() {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;

        container.innerHTML = '<div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando métricas anuais...</div>';

        try {
            // Define o ano base (pela data global)
            const ano = MinhaArea.dataAtual.getFullYear();
            const inicioAno = `${ano}-01-01`;
            const fimAno = `${ano}-12-31`;

            // 1. Busca Auditoria (Para Assertividade)
            let queryAuditoria = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('data_referencia, assistente, num_campos, acertos')
                .gte('data_referencia', inicioAno)
                .lte('data_referencia', fimAno);

            // 2. Busca Produção (Para Produtividade)
            let queryProducao = MinhaArea.supabase
                .from('producao')
                .select('data_referencia, quantidade, usuario_id, usuarios!inner(nome)')
                .gte('data_referencia', inicioAno)
                .lte('data_referencia', fimAno);

            // Filtro de Usuário
            const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;
            let nomeFiltro = '';

            if (MinhaArea.user.funcao === 'Assistente') {
                nomeFiltro = MinhaArea.user.nome;
                queryProducao = queryProducao.eq('usuario_id', MinhaArea.user.id);
            } else if (usuarioAlvo && usuarioAlvo !== 'todos') {
                const select = document.getElementById('admin-user-select');
                if (select) nomeFiltro = select.options[select.selectedIndex].text;
                
                // Para produção, precisamos do ID. Como o select tem nomes (texto), precisamos resolver.
                // Mas a auditoria usa nome texto.
                // Simplificação: Filtramos a auditoria por texto (ilike) e produção por texto (inner join).
                // queryProducao já faz join com usuarios.
            }

            if (nomeFiltro) {
                const primeiroNome = nomeFiltro.split(' ')[0];
                queryAuditoria = queryAuditoria.ilike('assistente', `%${primeiroNome}%`);
                queryProducao = queryProducao.ilike('usuarios.nome', `%${primeiroNome}%`);
            }

            const [resAuditoria, resProducao] = await Promise.all([queryAuditoria, queryProducao]);

            if (resAuditoria.error) throw resAuditoria.error;
            if (resProducao.error) throw resProducao.error;

            this.renderizarEvolucaoUI(container, resAuditoria.data, resProducao.data, ano);

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-rose-500 text-center">Erro ao carregar evolução: ${e.message}</div>`;
        }
    },

    renderizarEvolucaoUI: function(container, dadosAuditoria, dadosProducao, ano) {
        // Inicializa estrutura mensal (0 a 11)
        const meses = Array.from({length: 12}, () => ({
            audit_campos: 0, 
            audit_ok: 0, 
            prod_soma: 0, 
            prod_dias: new Set()
        }));

        // Processa Auditoria
        dadosAuditoria.forEach(d => {
            if(!d.data_referencia) return;
            const m = new Date(d.data_referencia).getMonth(); // 0-11
            meses[m].audit_campos += (parseInt(d.num_campos)||0);
            meses[m].audit_ok += (parseInt(d.acertos)||0);
        });

        // Processa Produção
        dadosProducao.forEach(d => {
            if(!d.data_referencia) return;
            const m = new Date(d.data_referencia).getMonth();
            meses[m].prod_soma += (parseInt(d.quantidade)||0);
            meses[m].prod_dias.add(d.data_referencia);
        });

        // Calcula KPIs Finais
        const dadosFinais = meses.map(m => {
            const diasTrab = m.prod_dias.size;
            return {
                assertividade: m.audit_campos > 0 ? (m.audit_ok / m.audit_campos) * 100 : null,
                produtividade: diasTrab > 0 ? Math.round(m.prod_soma / diasTrab) : null
            };
        });

        // HTML Templates
        const renderTabelaSemestre = (titulo, mesInicio, dados) => {
            const nomesMeses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            let html = `
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                    <div class="bg-slate-50 px-4 py-3 border-b border-slate-200">
                        <h3 class="font-bold text-slate-700 text-sm uppercase">${titulo} - ${ano}</h3>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2">
                        <div class="border-r border-slate-100 p-4">
                            <h4 class="text-xs font-bold text-emerald-600 mb-3 uppercase flex justify-between">
                                <span>% Assertividade</span>
                                <span class="bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Meta: 97%</span>
                            </h4>
                            <table class="w-full text-xs text-left">
                                <thead class="text-slate-400 font-bold border-b border-slate-100">
                                    <tr><th class="py-2">Mês</th><th class="py-2 text-center">Meta</th><th class="py-2 text-center">Realizado</th><th class="py-2 text-center">Status</th></tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                    ${[0,1,2,3,4,5].map(offset => {
                                        const idx = mesInicio + offset;
                                        const real = dados[idx].assertividade;
                                        const meta = 97;
                                        const atingiu = real !== null && real >= meta;
                                        const displayReal = real !== null ? real.toFixed(2).replace('.',',')+'%' : '-';
                                        const statusIcon = real !== null ? (atingiu ? '<i class="fas fa-check text-emerald-500"></i>' : '<i class="fas fa-times text-rose-400"></i>') : '-';
                                        
                                        return `
                                            <tr class="hover:bg-slate-50">
                                                <td class="py-2 font-bold text-slate-600 capitalize">${nomesMeses[idx]}</td>
                                                <td class="py-2 text-center text-slate-400">97,00%</td>
                                                <td class="py-2 text-center font-bold ${atingiu?'text-emerald-600':'text-rose-600'}">${displayReal}</td>
                                                <td class="py-2 text-center">${statusIcon}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>

                        <div class="p-4">
                            <h4 class="text-xs font-bold text-blue-600 mb-3 uppercase flex justify-between">
                                <span>Produtividade Média</span>
                                <span class="bg-blue-50 px-2 py-0.5 rounded text-[10px]">Meta: 650/dia</span>
                            </h4>
                            <table class="w-full text-xs text-left">
                                <thead class="text-slate-400 font-bold border-b border-slate-100">
                                    <tr><th class="py-2">Mês</th><th class="py-2 text-center">Meta</th><th class="py-2 text-center">Realizado</th><th class="py-2 text-center">Status</th></tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                    ${[0,1,2,3,4,5].map(offset => {
                                        const idx = mesInicio + offset;
                                        const real = dados[idx].produtividade;
                                        const meta = 650;
                                        const atingiu = real !== null && real >= meta;
                                        const displayReal = real !== null ? real : '-';
                                        const statusIcon = real !== null ? (atingiu ? '<i class="fas fa-check text-emerald-500"></i>' : '<i class="fas fa-times text-rose-400"></i>') : '-';
                                        
                                        return `
                                            <tr class="hover:bg-slate-50">
                                                <td class="py-2 font-bold text-slate-600 capitalize">${nomesMeses[idx]}</td>
                                                <td class="py-2 text-center text-slate-400">650</td>
                                                <td class="py-2 text-center font-bold ${atingiu?'text-blue-600':'text-amber-600'}">${displayReal}</td>
                                                <td class="py-2 text-center">${statusIcon}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            return html;
        };

        // Renderiza
        container.innerHTML = `
            <div class="grid grid-cols-1 gap-6 animate-enter">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-slate-800">Acompanhamento de Metas Anual</h2>
                    <div class="flex gap-2">
                        <span class="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">Assertividade: 97%</span>
                        <span class="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">Produtividade: 650</span>
                    </div>
                </div>

                ${renderTabelaSemestre('H1 - Primeiro Semestre', 0, dadosFinais)}
                ${renderTabelaSemestre('H2 - Segundo Semestre', 6, dadosFinais)}
                
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h4 class="text-sm font-bold text-slate-700 mb-4">Gráfico de Evolução (Assertividade)</h4>
                    <div class="h-64 w-full">
                        <canvas id="chart-evolucao-okr"></canvas>
                    </div>
                </div>
            </div>
        `;

        // Renderiza Gráfico
        setTimeout(() => {
            const ctx = document.getElementById('chart-evolucao-okr');
            if(ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
                        datasets: [
                            {
                                label: 'Meta',
                                data: Array(12).fill(97),
                                borderColor: '#e2e8f0',
                                borderDash: [5, 5],
                                pointRadius: 0,
                                borderWidth: 2,
                                fill: false
                            },
                            {
                                label: 'Realizado (%)',
                                data: dadosFinais.map(d => d.assertividade),
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                tension: 0.3,
                                fill: true
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: false, min: 80, max: 100 }
                        }
                    }
                });
            }
        }, 100);
    },

    // =================================================================================
    // MÓDULO 1: DASH ASSISTENTES (Resumo)
    // =================================================================================
    carregarDashAssistentes: async function() {
        const container = document.getElementById('conteudo-okr');
        const filtroHeader = document.getElementById('filtro-periodo-okr-header');
        const periodo = filtroHeader ? filtroHeader.value : 'mes';
        
        try {
            const { inicio, fim } = this.getDatasPorPeriodo(periodo);
            
            // Busca dados da base de auditoria
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            const { data, error } = await query;
            if(error) throw error;

            this.dadosCache = data || [];
            
            // Se for gestora, atualiza lista
            if (document.getElementById('admin-user-select')) this.atualizarOpcoesSeletor(this.dadosCache);

            this.atualizarVisualizacao();

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-rose-500 text-center">Erro: ${e.message}</div>`;
        }
    },

    atualizarVisualizacao: function() {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;

        // Se estiver na aba Evolução, não faz nada aqui (já tratado no carregarEvolucao)
        if (this.subAbaAtual === 'evolucao') return;

        let dadosFiltrados = this.dadosCache;
        const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;

        // Filtros
        if (MinhaArea.user.funcao === 'Assistente') {
            const primeiroNome = MinhaArea.user.nome.split(' ')[0].toLowerCase();
            dadosFiltrados = this.dadosCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
        } else if (usuarioAlvo && usuarioAlvo !== 'todos') {
            dadosFiltrados = this.dadosCache.filter(d => d.assistente === usuarioAlvo);
        }

        if (this.subAbaAtual === 'auditoria') {
            this.renderizarAuditoriaUI(container, dadosFiltrados);
        } else {
            this.renderizarDashUI(container, dadosFiltrados);
        }
    },

    // =================================================================================
    // DASH UI E AUDITORIA UI (MANTIDOS IGUAIS AO ANTERIOR)
    // =================================================================================
    renderizarDashUI: function(container, dados) {
        if (!dados || dados.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum dado encontrado.</div>`;
            return;
        }

        const totalValidados = dados.filter(d => (parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0) === 0).length;
        const totalAuditados = dados.length;
        const totalCampos = dados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOk = dados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const totalNok = totalCampos - totalOk;
        const mediaAssert = totalCampos > 0 ? (totalOk / totalCampos) * 100 : 0;

        // Agrupamento
        const agrupado = {};
        dados.forEach(d => {
            let mesRef = d.mes;
            if(!mesRef && d.data_referencia) {
                const date = new Date(d.data_referencia);
                const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                mesRef = meses[date.getMonth()];
            }
            const key = `${d.assistente}|${d.doc_name}`;
            if (!agrupado[key]) agrupado[key] = { mes: mesRef||'-', assistente: d.assistente, documento: d.doc_name, docs: 0, campos: 0, ok: 0 };
            agrupado[key].docs++;
            agrupado[key].campos += (parseInt(d.num_campos)||0);
            agrupado[key].ok += (parseInt(d.acertos)||0);
        });

        const listaResumo = Object.values(agrupado).map(i => ({
            ...i,
            nok: i.campos - i.ok,
            assert: i.campos > 0 ? (i.ok/i.campos)*100 : 0
        })).sort((a,b) => a.assistente.localeCompare(b.assistente));

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase">Volume Docs</span><div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><i class="fas fa-file-signature"></i></div></div>
                    <div class="flex items-end justify-between mt-2">
                        <div><span class="text-xs text-emerald-600 font-bold flex items-center gap-1"><i class="fas fa-check-circle"></i> Validados</span><div class="text-2xl font-black text-emerald-600">${totalValidados}</div></div>
                        <div class="text-right border-l border-slate-100 pl-4"><span class="text-xs text-slate-400 font-bold">Auditados</span><div class="text-xl font-bold text-slate-600">${totalAuditados}</div></div>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase">Qualidade</span><div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><i class="fas fa-exclamation-triangle"></i></div></div>
                    <div><h3 class="text-3xl font-black text-rose-600">${totalNok}</h3><p class="text-xs text-slate-400 mt-1">Campos com erro</p></div>
                </div>
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase">Assertividade</span><div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-percentage"></i></div></div>
                    <div><h3 class="text-3xl font-black ${mediaAssert >= 95 ? 'text-emerald-600' : 'text-amber-600'}">${mediaAssert.toFixed(2).replace('.',',')}%</h3><div class="w-full bg-slate-100 h-1.5 rounded-full mt-2"><div class="h-full ${mediaAssert >= 95 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${mediaAssert}%"></div></div></div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-3 bg-slate-50 border-b border-slate-100"><h3 class="font-bold text-slate-700 text-sm">Resumo por Documento</h3></div>
                <div class="overflow-x-auto max-h-[400px] custom-scroll">
                    <table class="w-full text-xs text-left text-slate-600">
                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0"><tr><th class="px-4 py-3">Mês</th><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Auditados</th><th class="px-4 py-3 text-center text-rose-600">NOK</th><th class="px-4 py-3 text-center text-blue-600">% Assert.</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">
                            ${listaResumo.map(d => `<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-bold text-slate-400">${d.mes}</td><td class="px-4 py-2 text-blue-600 font-bold">${d.assistente}</td><td class="px-4 py-2">${d.documento}</td><td class="px-4 py-2 text-center font-mono">${d.docs}</td><td class="px-4 py-2 text-center font-mono text-rose-600 font-bold">${d.nok>0?d.nok:'-'}</td><td class="px-4 py-2 text-center font-bold">${d.assert.toFixed(2).replace('.',',')}%</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-3 bg-slate-50 border-b border-slate-100"><h3 class="font-bold text-slate-700 text-sm">Histórico Detalhado</h3></div>
                <div class="overflow-x-auto max-h-[400px] custom-scroll">
                    <table class="w-full text-xs text-left text-slate-600">
                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0"><tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3">Observações</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">
                            ${dados.map(d => {
                                const k_nok = (parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0);
                                return `<tr class="${k_nok>0?'bg-rose-50/30':'hover:bg-slate-50'} border-b border-slate-50"><td class="px-4 py-2 font-bold">${d.data_referencia?d.data_referencia.split('-').reverse().join('/'):'-'}</td><td class="px-4 py-2 text-blue-600 font-bold">${d.assistente}</td><td class="px-4 py-2 truncate max-w-[200px]" title="${d.doc_name}">${d.doc_name}</td><td class="px-4 py-2 text-center"><span class="${d.status==='OK'?'text-emerald-600':'text-rose-600'} font-bold text-[10px]">${d.status}</span></td><td class="px-4 py-2 text-xs ${k_nok>0?'text-rose-700 font-medium':'text-slate-400 italic'}">${d.apontamentos_obs||'-'}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderizarAuditoriaUI: function(container, dados) {
        if (!dados || dados.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum registro encontrado.</div>`;
            return;
        }
        const total = dados.length;
        const campos = dados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const nok = dados.reduce((acc, cur) => acc + ((parseInt(cur.num_campos)||0) - (parseInt(cur.acertos)||0)), 0);
        const acertos = dados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const assert = campos > 0 ? ((acertos/campos)*100).toFixed(2) : '0.00';

        container.innerHTML = `
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center"><span class="block text-xs text-blue-500 font-bold uppercase">Registros</span><span class="text-xl font-black text-blue-700">${total}</span></div>
                <div class="bg-rose-50 p-3 rounded-lg border border-rose-100 text-center"><span class="block text-xs text-rose-500 font-bold uppercase">Erros (NOK)</span><span class="text-xl font-black text-rose-700">${nok}</span></div>
                <div class="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center"><span class="block text-xs text-emerald-500 font-bold uppercase">Assertividade</span><span class="text-xl font-black text-emerald-700">${assert.replace('.',',')}%</span></div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto max-h-[600px] custom-scroll">
                    <table class="w-full text-xs text-left text-slate-600 whitespace-nowrap">
                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 shadow-sm"><tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-center">Campos</th><th class="px-4 py-3 text-center text-emerald-600">Ok</th><th class="px-4 py-3 text-center text-rose-600">NOK</th><th class="px-4 py-3">Obs</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">${dados.map(d => { const k_nok = (parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0); return `<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-bold">${d.data_referencia}</td><td class="px-4 py-2 text-blue-600">${d.assistente}</td><td class="px-4 py-2 truncate max-w-[150px]" title="${d.doc_name}">${d.doc_name}</td><td class="px-4 py-2 text-center font-bold text-[10px]">${d.status}</td><td class="px-4 py-2 text-center font-mono text-slate-400">${d.num_campos}</td><td class="px-4 py-2 text-center font-mono text-emerald-600">${d.acertos}</td><td class="px-4 py-2 text-center font-mono text-rose-600 font-bold">${k_nok}</td><td class="px-4 py-2 italic text-slate-400 truncate max-w-[200px]" title="${d.apontamentos_obs}">${d.apontamentos_obs||'-'}</td></tr>`; }).join('')}</tbody>
                    </table>
                </div>
            </div>`;
    },

    // --- IMPORTAÇÃO ---
    importarAuditoria: function(input) {
        if (!input.files[0]) return;
        const file = input.files[0];
        const labelBtn = input.parentElement.querySelector('label');
        const originalText = labelBtn.innerHTML;
        labelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        const processar = async (rows) => {
            try {
                if (!rows || rows.length === 0) throw new Error("Vazio");
                const headers = Object.keys(rows[0]);
                const findCol = (opts) => { for(const o of opts) { const f = headers.find(h=>h.trim().toLowerCase()===o.toLowerCase()); if(f) return f; } return null; };
                
                const cTime = findCol(['end_time','time','Data']);
                const cAsst = findCol(['Assistente','Nome']);
                if(!cTime || !cAsst) { alert("Colunas 'end_time' e 'Assistente' não encontradas."); return; }

                const batch = [];
                rows.forEach(r => {
                    const rt = r[cTime], as = r[cAsst];
                    if(!rt && !as) return;
                    
                    let df = null;
                    if(typeof rt==='number') df = new Date(Math.round((rt-25569)*864e5)).toISOString().split('T')[0];
                    else if(rt) { const s=String(rt); df = s.includes('T')?s.split('T')[0]:(s.includes('/')?`${s.split('/')[2]}-${s.split('/')[1]}-${s.split('/')[0]}`:s); }

                    const get = (o) => { const k=findCol(o); return k?r[k]:null; };
                    
                    batch.push({
                        mes: get(['mês','mes']), end_time: String(rt), data_referencia: df, empresa: get(['Empresa']), assistente: as, doc_name: get(['doc_name','Documento']),
                        status: get(['STATUS','Status']), apontamentos_obs: get(['Apontamentos/obs','Apontamentos']),
                        num_campos: parseInt(get(['nº Campos','Campos']))||0, acertos: parseInt(get(['Ok','Acertos']))||0,
                        pct_erros_produtividade: get(['Nok','% de Erros X Produtividade']), pct_assert: get(['% Assert','Assertividade']), auditora: get(['Auditora'])
                    });
                });

                if(batch.length) {
                    labelBtn.innerHTML = 'Salvando...';
                    await MinhaArea.supabase.from('auditoria_apontamentos').insert(batch);
                    alert(`Importado ${batch.length} registros!`);
                    MinhaArea.Evolucao.carregar();
                }
            } catch(e) { console.error(e); alert(e.message); } finally { labelBtn.innerHTML = originalText; input.value = ''; }
        };

        if(file.name.endsWith('.xlsx')) {
            const r = new FileReader();
            r.onload = e => { const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'}); processar(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])); };
            r.readAsArrayBuffer(file);
        } else {
            Papa.parse(file, {header:true, skipEmptyLines:true, complete: res=>processar(res.data)});
        }
    },

    getDatasPorPeriodo: function(tipo) {
        const ref = MinhaArea.dataAtual || new Date();
        const y = ref.getFullYear(), m = ref.getMonth();
        let inicio = '', fim = '';
        if(tipo === 'dia') { inicio = ref.toISOString().split('T')[0]; fim = inicio; }
        else if(tipo === 'mes') { inicio = new Date(y,m,1).toISOString().split('T')[0]; fim = new Date(y,m+1,0).toISOString().split('T')[0]; }
        else if(tipo === 'trimestre') { const q = Math.floor(m/3); inicio = new Date(y, q*3, 1).toISOString().split('T')[0]; fim = new Date(y, (q*3)+3, 0).toISOString().split('T')[0]; }
        else if(tipo === 'semestre') { const s = m<6?0:6; inicio = new Date(y, s, 1).toISOString().split('T')[0]; fim = new Date(y, s+6, 0).toISOString().split('T')[0]; }
        else if(tipo === 'anual') { inicio = new Date(y,0,1).toISOString().split('T')[0]; fim = new Date(y,11,31).toISOString().split('T')[0]; }
        else { inicio = '2020-01-01'; fim = new Date().toISOString().split('T')[0]; }
        return { inicio, fim };
    },

    atualizarOpcoesSeletor: function(dados) {
        const nomes = [...new Set(dados.map(i => i.assistente).filter(n => n))].sort();
        const sel = document.getElementById('admin-user-select');
        if(!sel) return;
        const atual = sel.value;
        sel.innerHTML = '<option value="todos">Toda a Equipe</option>';
        nomes.forEach(n => { const o = document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o); });
        if(atual === 'todos' || nomes.includes(atual)) sel.value = atual;
    }
};