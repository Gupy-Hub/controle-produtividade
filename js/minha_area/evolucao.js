MinhaArea.Evolucao = {
    subAbaAtual: 'dash', // dash | auditoria | evolucao
    dadosAuditoriaCache: [], 
    dadosProducaoCache: [],
    mapaUsuarios: {}, // ID -> Nome
    mapaNomesParaId: {}, // Nome -> ID
    filtroDocumento: null, 

    carregar: async function() {
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA' || MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (!isGestora && this.subAbaAtual === 'auditoria') this.subAbaAtual = 'dash';

        await this.carregarMapaUsuarios();
        this.renderizarLayout(isGestora);
        
        if (this.subAbaAtual === 'evolucao') {
            await this.carregarEvolucao();
        } else {
            await this.carregarDadosCruzados();
        }
    },

    carregarMapaUsuarios: async function() {
        if (Object.keys(this.mapaUsuarios).length > 0) return;
        const { data } = await MinhaArea.supabase.from('usuarios').select('id, nome');
        if (data) {
            this.mapaUsuarios = data.reduce((acc, u) => { acc[u.id] = u.nome; return acc; }, {});
            this.mapaNomesParaId = data.reduce((acc, u) => { acc[u.nome] = u.id; return acc; }, {});
        }
    },

    mudarSubAba: function(novaAba) {
        this.subAbaAtual = novaAba;
        this.filtroDocumento = null;
        this.carregar();
    },

    aplicarFiltroDocumento: function(nomeDoc) {
        this.filtroDocumento = nomeDoc;
        this.atualizarVisualizacao();
        const el = document.getElementById('conteudo-okr');
        if(el) el.scrollIntoView({ behavior: 'smooth' });
    },

    limparFiltroDocumento: function() {
        this.filtroDocumento = null;
        this.atualizarVisualizacao();
    },

    aplicarFiltroAssistente: function() {
        if (this.subAbaAtual === 'evolucao') this.carregarEvolucao();
        else this.atualizarVisualizacao();
    },

    // --- LAYOUT ---
    renderizarLayout: function(isGestora) {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        let navHtml = '';
        if (isGestora) {
            navHtml = `
                <div class="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-3 py-1.5 rounded-md text-xs font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Dash Geral
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('evolucao')" class="px-3 py-1.5 rounded-md text-xs font-bold transition ${this.subAbaAtual === 'evolucao' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Evolução (Metas)
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('auditoria')" class="px-3 py-1.5 rounded-md text-xs font-bold transition ${this.subAbaAtual === 'auditoria' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Auditoria (Log)
                    </button>
                </div>
            `;
        } else {
            navHtml = `
                <div class="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-3 py-1.5 rounded-md text-xs font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">Resumo</button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('evolucao')" class="px-3 py-1.5 rounded-md text-xs font-bold transition ${this.subAbaAtual === 'evolucao' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">Minhas Metas</button>
                </div>`;
        }

        let searchHtml = '';
        if (this.subAbaAtual !== 'evolucao') {
            searchHtml = `
                <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm w-full md:w-64">
                    <i class="fas fa-search text-slate-400 text-xs"></i>
                    <input type="text" onkeyup="MinhaArea.Evolucao.filtrarBusca(this.value)" placeholder="Buscar..." class="w-full text-xs font-bold text-slate-600 outline-none placeholder:text-slate-400 bg-transparent">
                </div>
            `;
        }

        // Botões de Ação (Importar/Excluir) - Visíveis se for Gestora em Dash ou Auditoria
        let actionsHtml = '';
        if (isGestora && this.subAbaAtual !== 'evolucao') {
            const btnExcluir = this.subAbaAtual === 'auditoria' ? `
                <button onclick="MinhaArea.Evolucao.excluirDadosPeriodo()" class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-2" title="Excluir período">
                    <i class="fas fa-trash-alt"></i>
                </button>` : '';

            actionsHtml = `
                <div class="flex items-center gap-2">
                    ${btnExcluir}
                    <label class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer transition flex items-center gap-2 shadow-sm">
                        <i class="fas fa-file-excel"></i> Importar
                        <input type="file" accept=".csv, .xlsx, .xls" class="hidden" onchange="MinhaArea.Evolucao.importarAuditoria(this)">
                    </label>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-4">
                ${navHtml}
                <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    ${searchHtml}
                    ${actionsHtml}
                </div>
            </div>
            <div id="conteudo-okr" class="flex flex-col gap-6 animate-enter">
                <div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</div>
            </div>
        `;
    },

    carregarDadosCruzados: async function() {
        const container = document.getElementById('conteudo-okr');
        try {
            const { inicio, fim } = MinhaArea.getPeriodo();
            
            let qAudit = MinhaArea.supabase.from('auditoria_apontamentos').select('*').gte('data_referencia', inicio).lte('data_referencia', fim).order('data_referencia', { ascending: false });
            let qProd = MinhaArea.supabase.from('producao').select('quantidade, usuario_id, data_referencia').gte('data_referencia', inicio).lte('data_referencia', fim);

            const [rAudit, rProd] = await Promise.all([qAudit, qProd]);
            if(rAudit.error) throw rAudit.error;
            if(rProd.error) throw rProd.error;

            this.dadosAuditoriaCache = rAudit.data || [];
            this.dadosProducaoCache = rProd.data || [];

            this.atualizarOpcoesSeletor(this.dadosAuditoriaCache, this.dadosProducaoCache);
            this.atualizarVisualizacao();

        } catch (e) {
            console.error(e);
            if(container) container.innerHTML = `<div class="text-rose-500 text-center">Erro: ${e.message}</div>`;
        }
    },

    atualizarOpcoesSeletor: function(dadosAudit, dadosProd) {
        const select = document.getElementById('admin-user-select');
        if (!select) return;

        const nomesAudit = dadosAudit.map(d => d.assistente).filter(n => n);
        const nomesProd = dadosProd.map(d => this.mapaUsuarios[d.usuario_id]).filter(n => n);
        const todosNomes = [...new Set([...nomesAudit, ...nomesProd])].sort();

        const selecaoAtual = select.value || MinhaArea.usuarioAlvo;
        select.innerHTML = '<option value="todos">Toda a Equipe</option>';
        todosNomes.forEach(nome => {
            const opt = document.createElement('option');
            opt.value = nome; opt.innerText = nome; select.appendChild(opt);
        });

        if (selecaoAtual === 'todos' || todosNomes.includes(selecaoAtual)) {
            select.value = selecaoAtual;
        } else {
            select.value = 'todos';
            MinhaArea.usuarioAlvo = 'todos';
        }
    },

    filtrarBusca: function(termo) {
        if (!this.dadosAuditoriaCache) return;
        this.atualizarVisualizacao(termo);
    },

    atualizarVisualizacao: function(termoBusca = '') {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;

        if (this.subAbaAtual === 'evolucao') return;

        const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo || 'todos';
        
        let auditFiltrados = this.dadosAuditoriaCache;
        let prodFiltrados = this.dadosProducaoCache;
        let nomeExibicao = "Equipe Geral";

        if (MinhaArea.user.funcao === 'Assistente') {
            nomeExibicao = MinhaArea.user.nome;
            const primeiroNome = nomeExibicao.split(' ')[0].toLowerCase();
            auditFiltrados = this.dadosAuditoriaCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
            prodFiltrados = this.dadosProducaoCache.filter(d => d.usuario_id == MinhaArea.user.id);
        } else if (usuarioAlvo && usuarioAlvo !== 'todos') {
            nomeExibicao = usuarioAlvo;
            auditFiltrados = this.dadosAuditoriaCache.filter(d => d.assistente === usuarioAlvo);
            const idAlvo = this.mapaNomesParaId[usuarioAlvo];
            if (idAlvo) {
                prodFiltrados = this.dadosProducaoCache.filter(d => d.usuario_id == idAlvo);
            } else {
                prodFiltrados = [];
            }
        }

        if (this.filtroDocumento) {
            auditFiltrados = auditFiltrados.filter(d => d.doc_name === this.filtroDocumento);
        }

        if (termoBusca) {
            const lower = termoBusca.toLowerCase();
            auditFiltrados = auditFiltrados.filter(d => Object.values(d).some(v => String(v).toLowerCase().includes(lower)));
        }

        if (this.subAbaAtual === 'auditoria') {
            this.renderizarAuditoriaUI(container, auditFiltrados);
        } else {
            this.renderizarDashUI(container, auditFiltrados, prodFiltrados, nomeExibicao);
        }
    },

    renderizarDashUI: function(container, auditFiltrados, prodFiltrados, nomeExibicao) {
        if ((!auditFiltrados || auditFiltrados.length === 0) && (!prodFiltrados || prodFiltrados.length === 0)) {
            container.innerHTML = `<div class="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum dado encontrado.</div>`;
            return;
        }

        const { texto } = MinhaArea.getPeriodo();

        // 1. KPI EQUIPE
        const totalCamposEq = this.dadosAuditoriaCache.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOkEq = this.dadosAuditoriaCache.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const parcialEquipe = totalCamposEq > 0 ? (totalOkEq / totalCamposEq) * 100 : 0;
        const parcialEquipeStr = parcialEquipe.toFixed(2).replace('.',',') + '%';

        // 2. KPI SELEÇÃO
        const totalDocs = auditFiltrados.length;
        const totalCampos = auditFiltrados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOk = auditFiltrados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const totalNok = totalCampos - totalOk;
        const atingimento = totalCampos > 0 ? (totalOk / totalCampos) * 100 : 0;
        const atingimentoStr = atingimento.toFixed(2).replace('.',',') + '%';

        // 3. KPI VOLUME
        let totalValidados = 0;
        let displayValidados = '-';
        let pctAuditadoStr = '-';

        if (!this.filtroDocumento) {
            totalValidados = prodFiltrados.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
            const pct = totalValidados > 0 ? (totalDocs / totalValidados) * 100 : 0;
            pctAuditadoStr = `${Math.round(pct)}%`;
            displayValidados = totalValidados.toLocaleString('pt-BR');
        }

        let filtroMsg = '';
        if (this.filtroDocumento) {
            filtroMsg = `
                <div class="mb-4 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg flex justify-between items-center animate-enter border border-blue-100">
                    <span class="text-sm font-bold"><i class="fas fa-filter mr-2"></i> Filtro: ${this.filtroDocumento}</span>
                    <button onclick="MinhaArea.Evolucao.limparFiltroDocumento()" class="text-xs bg-white border border-blue-200 hover:bg-blue-100 px-3 py-1 rounded-md font-bold transition">Limpar Filtro</button>
                </div>`;
        }

        container.innerHTML = `
            ${filtroMsg}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Assertividade</span><div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-bullseye"></i></div></div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2"><span class="text-sm text-slate-500 font-medium">Meta Assertividade</span><span class="text-lg font-black text-slate-700">97%</span></div>
                        <div class="flex justify-between items-center"><span class="text-sm text-slate-500 font-medium">Total de Erros</span><span class="text-lg font-black text-rose-600">${totalNok}</span></div>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase tracking-wider truncate max-w-[200px]" title="${nomeExibicao}">Qualidade: <span class="text-blue-600">${nomeExibicao.split(' ')[0]}</span></span><div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><i class="fas fa-check-double"></i></div></div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2"><span class="text-sm text-slate-500 font-medium">Sua Assertividade</span><span class="text-lg font-black ${atingimento >= 97 ? 'text-blue-600' : 'text-amber-600'}">${atingimentoStr}</span></div>
                        <div class="flex justify-between items-center"><span class="text-sm text-slate-500 font-medium">Assertividade da Equipe</span><span class="text-lg font-black text-slate-500">${parcialEquipeStr}</span></div>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start"><span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume de Documentos</span><div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><i class="fas fa-file-contract"></i></div></div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2"><span class="text-sm text-slate-500 font-medium">Total Validados</span><span class="text-lg font-black text-emerald-600">${displayValidados}</span></div>
                        <div class="flex justify-between items-center"><span class="text-sm text-slate-500 font-medium">Total Auditados</span><div class="flex items-baseline gap-1"><span class="text-lg font-black text-slate-700">${totalDocs.toLocaleString('pt-BR')}</span><span class="text-xs text-slate-400 font-bold">(${pctAuditadoStr})</span></div></div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2"><i class="fas fa-chart-line text-indigo-500"></i> Consolidado Mensal</h3>
                </div>
                <div class="overflow-x-auto max-h-[400px] custom-scroll">
                    ${this.gerarTabelaConsolidadaMensal(auditFiltrados, prodFiltrados)}
                </div>
            </div>

            <div class="flex justify-end mb-4">
                <button onclick="document.getElementById('modal-resumo-docs').classList.remove('hidden')" class="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1">
                    <i class="fas fa-folder-open"></i> Ver Resumo por Documento
                </button>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2"><i class="fas fa-list-ul text-slate-400"></i> Histórico Detalhado <span class="text-xs font-normal text-slate-400 ml-1">(${texto})</span></h3>
                </div>
                <div class="overflow-x-auto max-h-[600px] custom-scroll">
                    ${this.gerarTabelaDetalhada(auditFiltrados)}
                </div>
            </div>

            <div id="modal-resumo-docs" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm hidden animate-enter">
                <div class="bg-white rounded-xl shadow-2xl w-[95%] max-w-4xl max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center p-4 border-b border-slate-100"><h3 class="font-bold text-slate-700">Resumo por Documento</h3><button onclick="document.getElementById('modal-resumo-docs').classList.add('hidden')" class="text-slate-400 hover:text-red-500"><i class="fas fa-times"></i></button></div>
                    <div class="p-0 overflow-auto custom-scroll">${this.gerarTabelaResumo(auditFiltrados)}</div>
                </div>
            </div>
        `;
    },

    // ... (Métodos de tabela consolidade, detalhada, importação e evolução mantidos do script anterior)
    // Para economizar caracteres e garantir integridade, eles são exatamente os mesmos da resposta anterior corrigida.
    gerarTabelaConsolidadaMensal: function(auditData, prodData) {
        const meses = {};
        prodData.forEach(d => { if(!d.data_referencia) return; const k = d.data_referencia.substring(0, 7); if(!meses[k]) meses[k] = { dias: new Set(), total_prod: 0, campos_total: 0, campos_ok: 0, erros: 0 }; meses[k].dias.add(d.data_referencia); meses[k].total_prod += (Number(d.quantidade)||0); });
        auditData.forEach(d => { if(!d.data_referencia) return; const k = d.data_referencia.substring(0, 7); if(!meses[k]) meses[k] = { dias: new Set(), total_prod: 0, campos_total: 0, campos_ok: 0, erros: 0 }; const nc = parseInt(d.num_campos)||0; const na = parseInt(d.acertos)||0; meses[k].campos_total += nc; meses[k].campos_ok += na; meses[k].erros += (nc - na); });
        const chaves = Object.keys(meses).sort();
        if(chaves.length === 0) return '<div class="p-4 text-center text-xs text-slate-400">Sem dados.</div>';
        
        let gDias=new Set(), gProd=0, gCampos=0, gOk=0, gErros=0;
        let html = `<table class="w-full text-xs text-left text-slate-600"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0 shadow-sm"><tr><th class="px-4 py-3">Mês</th><th class="px-4 py-3 text-center">Dias Trab.</th><th class="px-4 py-3 text-center">Total Mês</th><th class="px-4 py-3 text-center">Média/Dia</th><th class="px-4 py-3 text-center">% Meta</th><th class="px-4 py-3 text-center">% Assert.</th><th class="px-4 py-3 text-center text-rose-600">Erros</th></tr></thead><tbody class="divide-y divide-slate-100">`;
        
        chaves.forEach(k => {
            const m = meses[k]; m.dias.forEach(d=>gDias.add(d)); gProd+=m.total_prod; gCampos+=m.campos_total; gOk+=m.campos_ok; gErros+=m.erros;
            const media = m.dias.size > 0 ? Math.round(m.total_prod/m.dias.size) : 0;
            const pct = Math.round((media/650)*100);
            const ast = m.campos_total > 0 ? ((m.campos_ok/m.campos_total)*100).toFixed(2) : '0.00';
            const nome = new Date(k+'-01').toLocaleString('pt-BR',{month:'long',year:'numeric'});
            html += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-bold capitalize">${nome}</td><td class="px-4 py-3 text-center">${m.dias.size}</td><td class="px-4 py-3 text-center font-bold text-blue-600">${m.total_prod}</td><td class="px-4 py-3 text-center">${media}</td><td class="px-4 py-3 text-center font-bold ${pct>=100?'text-emerald-600':'text-amber-600'}">${pct}%</td><td class="px-4 py-3 text-center font-bold ${parseFloat(ast)>=97?'text-emerald-600':'text-amber-600'}">${ast.replace('.',',')}%</td><td class="px-4 py-3 text-center text-rose-600 font-bold">${m.erros}</td></tr>`;
        });
        
        const gMedia = gDias.size > 0 ? Math.round(gProd/gDias.size) : 0;
        const gPct = Math.round((gMedia/650)*100);
        const gAst = gCampos > 0 ? ((gOk/gCampos)*100).toFixed(2) : '0.00';
        html += `<tr class="bg-slate-50 font-bold border-t border-slate-200"><td class="px-4 py-3">TOTAL</td><td class="px-4 py-3 text-center">${gDias.size}</td><td class="px-4 py-3 text-center text-blue-700">${gProd}</td><td class="px-4 py-3 text-center">${gMedia}</td><td class="px-4 py-3 text-center ${gPct>=100?'text-emerald-700':'text-amber-700'}">${gPct}%</td><td class="px-4 py-3 text-center ${parseFloat(gAst)>=97?'text-emerald-700':'text-amber-700'}">${gAst.replace('.',',')}%</td><td class="px-4 py-3 text-center text-rose-700">${gErros}</td></tr></tbody></table>`;
        return html;
    },
    
    // (Demais funções renderizarAuditoriaUI, importarAuditoria, etc. seguem o padrão já estabelecido e funcional)
    renderizarAuditoriaUI: function(container, dados) { /* Igual */ 
        if(!dados.length) { container.innerHTML = '<div class="text-center py-12 text-slate-400">Nenhum dado.</div>'; return; }
        const total=dados.length, campos=dados.reduce((a,c)=>a+(parseInt(c.num_campos)||0),0), nok=dados.reduce((a,c)=>a+((parseInt(c.num_campos)||0)-(parseInt(c.acertos)||0)),0);
        container.innerHTML = `<div class="grid grid-cols-3 gap-4 mb-4"><div class="bg-blue-50 p-3 rounded-lg text-center"><span class="block text-xs font-bold text-blue-500 uppercase">Registros</span><span class="text-xl font-black text-blue-700">${total}</span></div><div class="bg-slate-50 p-3 rounded-lg text-center"><span class="block text-xs font-bold text-slate-500 uppercase">Campos</span><span class="text-xl font-black text-slate-700">${campos}</span></div><div class="bg-rose-50 p-3 rounded-lg text-center"><span class="block text-xs font-bold text-rose-500 uppercase">Erros</span><span class="text-xl font-black text-rose-700">${nok}</span></div></div><div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><div class="overflow-x-auto max-h-[600px] custom-scroll">${this.gerarTabelaDetalhada(dados)}</div></div>`;
    },
    gerarTabelaDetalhada: function(dados) { /* Igual */ return `<table class="w-full text-xs text-left text-slate-600 whitespace-nowrap"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0 shadow-sm"><tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Empresa</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-center text-rose-600">NOK</th><th class="px-4 py-3">Obs</th></tr></thead><tbody class="divide-y divide-slate-100">${dados.map(d=>{const k=(parseInt(d.num_campos)||0)-(parseInt(d.acertos)||0); return `<tr class="${k>0?'bg-rose-50/30':'hover:bg-slate-50'} border-b border-slate-50"><td class="px-4 py-2 font-bold">${d.data_referencia?d.data_referencia.split('-').reverse().join('/'):'-'}</td><td class="px-4 py-2 text-blue-600 font-bold">${d.assistente}</td><td class="px-4 py-2 text-slate-600">${d.empresa||'-'}</td><td class="px-4 py-2"><button onclick="MinhaArea.Evolucao.aplicarFiltroDocumento('${d.doc_name}')" class="text-blue-500 hover:underline text-left truncate max-w-[200px]">${d.doc_name}</button></td><td class="px-4 py-2 text-center"><span class="${d.status==='OK'?'text-emerald-600':'text-rose-600'} font-bold text-[10px]">${d.status}</span></td><td class="px-4 py-2 text-center font-bold ${k>0?'text-rose-600':'text-slate-300'}">${k>0?k:'-'}</td><td class="px-4 py-2 text-xs ${k>0?'text-rose-700 font-medium':'text-slate-400 italic'}">${d.apontamentos_obs||'-'}</td></tr>`;}).join('')}</tbody></table>`; },
    gerarTabelaResumo: function(dados) { /* Igual */ const g={}; dados.forEach(d=>{const k=`${d.assistente}|${d.doc_name}`; if(!g[k]) g[k]={assistente:d.assistente,documento:d.doc_name,docs:0,campos:0,ok:0}; g[k].docs++; g[k].campos+=(parseInt(d.num_campos)||0); g[k].ok+=(parseInt(d.acertos)||0);}); const l=Object.values(g).map(i=>({...i,nok:i.campos-i.ok,assert:i.campos>0?(i.ok/i.campos)*100:0})).sort((a,b)=>a.assistente.localeCompare(b.assistente)); return `<table class="w-full text-xs text-left text-slate-600"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0"><tr><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Auditados</th><th class="px-4 py-3 text-center text-rose-600">NOK Total</th><th class="px-4 py-3 text-center text-blue-600">% Assert.</th></tr></thead><tbody class="divide-y divide-slate-100">${l.map(d=>`<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-bold text-blue-600">${d.assistente}</td><td class="px-4 py-2">${d.documento}</td><td class="px-4 py-2 text-center font-mono">${d.docs}</td><td class="px-4 py-2 text-center font-mono text-rose-600 font-bold">${d.nok>0?d.nok:'-'}</td><td class="px-4 py-2 text-center font-bold">${d.assert.toFixed(2).replace('.',',')}%</td></tr>`).join('')}</tbody></table>`; },
    importarAuditoria: function(input) { /* Igual */ if(!input.files[0]) return; const f=input.files[0]; const b=input.parentElement.querySelector('label'); const t=b.innerHTML; b.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; const p=async(r)=>{try{if(!r.length) throw new Error("Vazio"); const k=Object.keys(r[0]); const fd=(o)=>{for(const x of o){const z=k.find(h=>h.trim().toLowerCase()===x.toLowerCase());if(z)return z}return null}; const ct=fd(['end_time','time','Data']); const ca=fd(['Assistente','Nome']); if(!ct||!ca){alert("Colunas obrigatórias não encontradas.");return;} const ba=[]; r.forEach(x=>{const rt=x[ct],as=x[ca]; if(!rt&&!as)return; let df=null; if(typeof rt==='number') df=new Date(Math.round((rt-25569)*864e5)).toISOString().split('T')[0]; else if(rt){const s=String(rt); df=s.includes('T')?s.split('T')[0]:(s.includes('/')?`${s.split('/')[2]}-${s.split('/')[1]}-${s.split('/')[0]}`:s);} const g=(o)=>{const z=fd(o);return z?x[z]:null}; ba.push({mes:g(['mês']),end_time:String(rt),data_referencia:df,empresa:g(['Empresa']),assistente:as,doc_name:g(['doc_name']),status:g(['STATUS']),apontamentos_obs:g(['Apontamentos/obs']),num_campos:parseInt(g(['nº Campos']))||0,acertos:parseInt(g(['Ok']))||0,pct_erros_produtividade:g(['Nok']),pct_assert:g(['% Assert']),auditora:g(['Auditora'])});}); if(ba.length){await MinhaArea.supabase.from('auditoria_apontamentos').insert(ba); alert("Importado!"); MinhaArea.Evolucao.carregar();}}catch(e){console.error(e);alert(e.message);}finally{b.innerHTML=t;input.value='';}}; if(f.name.endsWith('.xlsx')){const r=new FileReader();r.onload=e=>{const w=XLSX.read(new Uint8Array(e.target.result),{type:'array'});p(XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]]));};r.readAsArrayBuffer(f);}else{Papa.parse(f,{header:true,skipEmptyLines:true,complete:r=>p(r.data)});}},
    excluirDadosPeriodo: async function() { const {inicio,fim,tipo}=MinhaArea.getPeriodo(); if(tipo==='dia'){alert("Apenas Mês/Ano.");return;} if(!confirm("Excluir?"))return; try{await MinhaArea.supabase.from('auditoria_apontamentos').delete().gte('data_referencia',inicio).lte('data_referencia',fim); alert("Excluído."); this.carregar();}catch(e){alert(e.message);} },
    carregarEvolucao: async function() { /* Igual */ const c=document.getElementById('conteudo-okr'); if(!c)return; c.innerHTML='<div class="py-12 text-center text-slate-400">Calculando...</div>'; try{const a=MinhaArea.dataAtual.getFullYear(); const i=`${a}-01-01`; const f=`${a}-12-31`; let qa=MinhaArea.supabase.from('auditoria_apontamentos').select('data_referencia,assistente,num_campos,acertos').gte('data_referencia',i).lte('data_referencia',f); let qp=MinhaArea.supabase.from('producao').select('data_referencia,quantidade,usuario_id,usuarios!inner(nome)').gte('data_referencia',i).lte('data_referencia',f); const u=document.getElementById('admin-user-select')?.value||MinhaArea.usuarioAlvo; let n=''; if(MinhaArea.user.funcao==='Assistente'){n=MinhaArea.user.nome; qp=qp.eq('usuario_id',MinhaArea.user.id);} else if(u&&u!=='todos'){n=u; const id=this.mapaNomesParaId[u]; if(id)qp=qp.eq('usuario_id',id);} if(n){const p=n.split(' ')[0]; qa=qa.ilike('assistente',`%${p}%`);} const [ra,rp]=await Promise.all([qa,qp]); if(ra.error)throw ra.error; if(rp.error)throw rp.error; this.atualizarOpcoesSeletor(ra.data||[],rp.data||[]); this.renderizarEvolucaoUI(c,ra.data,rp.data,a);}catch(e){console.error(e);} },
    renderizarEvolucaoUI: function(container, dadosAuditoria, dadosProducao, ano) { /* Igual */ const meses=Array.from({length:12},()=>({audit_campos:0,audit_ok:0,prod_soma:0,prod_dias:new Set()})); dadosAuditoria.forEach(d=>{if(d.data_referencia){const m=new Date(d.data_referencia).getMonth(); meses[m].audit_campos+=(parseInt(d.num_campos)||0); meses[m].audit_ok+=(parseInt(d.acertos)||0);}}); dadosProducao.forEach(d=>{if(d.data_referencia){const m=new Date(d.data_referencia).getMonth(); meses[m].prod_soma+=(parseInt(d.quantidade)||0); meses[m].prod_dias.add(d.data_referencia);}}); const df=meses.map(m=>({assertividade:m.audit_campos>0?(m.audit_ok/m.audit_campos)*100:null,produtividade:m.prod_dias.size>0?Math.round(m.prod_soma/m.prod_dias.size):null})); const nm=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; const tbl=(t,i)=>`<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6"><div class="bg-slate-50 px-4 py-3 border-b border-slate-200"><h3 class="font-bold text-slate-700 text-sm uppercase">${t}</h3></div><div class="grid grid-cols-2 divide-x divide-slate-100"><div class="p-4"><h4 class="text-xs font-bold text-emerald-600 mb-2">Assertividade (Meta 97%)</h4><table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead><tbody class="divide-y">${[0,1,2,3,4,5].map(x=>{const d=df[i+x]; return `<tr><td class="py-2 capitalize">${nm[i+x]}</td><td class="font-bold ${d.assertividade>=97?'text-emerald-600':'text-rose-600'}">${d.assertividade?d.assertividade.toFixed(2)+'%':'-'}</td><td>${d.assertividade?(d.assertividade>=97?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-rose-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table></div><div class="p-4"><h4 class="text-xs font-bold text-blue-600 mb-2">Produtividade (Meta 650)</h4><table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead><tbody class="divide-y">${[0,1,2,3,4,5].map(x=>{const d=df[i+x]; return `<tr><td class="py-2 capitalize">${nm[i+x]}</td><td class="font-bold ${d.produtividade>=650?'text-blue-600':'text-amber-600'}">${d.produtividade||'-'}</td><td>${d.produtividade?(d.produtividade>=650?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-amber-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table></div></div></div>`; container.innerHTML=`<div class="grid grid-cols-1 gap-6 animate-enter"><div class="flex justify-between items-center"><h2 class="text-xl font-bold text-slate-800">Consolidado Anual - ${ano}</h2></div>${tbl('H1 - Primeiro Semestre',0)}${tbl('H2 - Segundo Semestre',6)}</div>`; }
};