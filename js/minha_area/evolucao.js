MinhaArea.Evolucao = {
    subAbaAtual: 'dash', // dash | auditoria | evolucao
    dadosAuditoriaCache: [], 
    dadosProducaoCache: [],
    mapaUsuarios: {},
    filtroDocumento: null, // Novo: Armazena o documento clicado

    carregar: async function() {
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA' || MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (!isGestora && this.subAbaAtual === 'auditoria') this.subAbaAtual = 'dash';

        await this.carregarMapaUsuarios();
        this.renderizarLayout(isGestora);
        
        // Garante carregamento inicial
        if (this.subAbaAtual === 'evolucao') {
            await this.carregarEvolucao();
        } else {
            await this.carregarDadosCruzados();
        }
    },

    carregarMapaUsuarios: async function() {
        if (Object.keys(this.mapaUsuarios).length > 0) return;
        const { data } = await MinhaArea.supabase.from('usuarios').select('id, nome');
        if (data) this.mapaUsuarios = data.reduce((acc, u) => { acc[u.id] = u.nome; return acc; }, {});
    },

    mudarSubAba: function(novaAba) {
        this.subAbaAtual = novaAba;
        this.filtroDocumento = null; // Limpa filtro ao mudar aba
        this.carregar();
    },

    aplicarFiltroDocumento: function(nomeDoc) {
        this.filtroDocumento = nomeDoc;
        this.atualizarVisualizacao();
        // Rola suave para o topo
        document.getElementById('ma-tab-evolucao').scrollIntoView({ behavior: 'smooth' });
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
                <div class="flex flex-wrap items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 w-fit shadow-sm">
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
                <div class="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 w-fit">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">Resumo</button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('evolucao')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'evolucao' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">Minhas Metas</button>
                </div>`;
        }

        let searchHtml = '';
        if (this.subAbaAtual !== 'evolucao') {
            searchHtml = `
                <div class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-80">
                    <i class="fas fa-search text-slate-400 ml-2"></i>
                    <input type="text" onkeyup="MinhaArea.Evolucao.filtrarBusca(this.value)" placeholder="Buscar..." class="w-full text-sm text-slate-600 outline-none placeholder:text-slate-400 bg-transparent">
                </div>
            `;
        }

        let actionsHtml = '';
        if (isGestora && this.subAbaAtual === 'auditoria') {
            actionsHtml = `
                <div class="flex items-center gap-2">
                    <button onclick="MinhaArea.Evolucao.excluirDadosPeriodo()" class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold py-2 px-3 rounded-lg transition flex items-center gap-2" title="Excluir período">
                        <i class="fas fa-trash-alt"></i> Excluir
                    </button>
                    <label class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center gap-2">
                        <i class="fas fa-cloud-upload-alt"></i> Importar
                        <input type="file" accept=".csv, .xlsx, .xls" class="hidden" onchange="MinhaArea.Evolucao.importarAuditoria(this)">
                    </label>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                ${navHtml}
                <div class="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
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
            
            // Auditoria
            let qAudit = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            // Produção (Validados)
            let qProd = MinhaArea.supabase
                .from('producao')
                .select('quantidade, usuario_id, data_referencia')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            const [rAudit, rProd] = await Promise.all([qAudit, qProd]);

            if(rAudit.error) throw rAudit.error;
            if(rProd.error) throw rProd.error;

            this.dadosAuditoriaCache = rAudit.data || [];
            this.dadosProducaoCache = rProd.data || [];

            this.atualizarVisualizacao();

        } catch (e) {
            console.error(e);
            if(container) container.innerHTML = `<div class="text-rose-500 text-center">Erro: ${e.message}</div>`;
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

        // FILTROS INICIAIS (Usuario e Assistente)
        const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;
        let auditFiltrados = this.dadosAuditoriaCache;
        let prodFiltrados = this.dadosProducaoCache;
        let nomeExibicao = "Equipe Geral";

        if (MinhaArea.user.funcao === 'Assistente') {
            nomeExibicao = MinhaArea.user.nome;
            const primeiroNome = nomeExibicao.split(' ')[0].toLowerCase();
            auditFiltrados = this.dadosAuditoriaCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
            prodFiltrados = this.dadosProducaoCache.filter(d => d.usuario_id == MinhaArea.user.id);
        } else if (usuarioAlvo && usuarioAlvo !== 'todos') {
            const idAlvo = usuarioAlvo;
            nomeExibicao = this.mapaUsuarios[idAlvo] || "Assistente";
            const primeiroNome = nomeExibicao.split(' ')[0].toLowerCase();
            auditFiltrados = this.dadosAuditoriaCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
            prodFiltrados = this.dadosProducaoCache.filter(d => d.usuario_id == idAlvo);
        }

        // FILTRO POR DOCUMENTO (Se houver)
        if (this.filtroDocumento) {
            auditFiltrados = auditFiltrados.filter(d => d.doc_name === this.filtroDocumento);
            // Produção não tem doc_name, então mantemos a produção geral ou tentamos aproximar? 
            // Como a produção não detalha por documento, o KPI de "Validados" (Volume) pode ficar distorcido se filtrarmos documento.
            // Para não quebrar, vamos focar a filtragem na AUDITORIA (Qualidade e Erros). 
            // O KPI de Volume mostrará "N/A" ou manterá o total se estiver filtrado por doc.
        }

        // FILTRO POR BUSCA
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

    // =================================================================================
    // MÓDULO 1: DASH GERAL (ATUALIZADO)
    // =================================================================================
    renderizarDashUI: function(container, auditFiltrados, prodFiltrados, nomeExibicao) {
        if (!auditFiltrados || auditFiltrados.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum dado encontrado para o filtro selecionado.</div>`;
            if(this.filtroDocumento) container.innerHTML += `<div class="text-center mt-2"><button onclick="MinhaArea.Evolucao.limparFiltroDocumento()" class="text-blue-500 hover:underline">Limpar Filtro de Documento</button></div>`;
            return;
        }

        const { inicio, fim } = MinhaArea.getPeriodo();
        const periodoTexto = `${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')}`;

        // KPI EQUIPE (Parcial Equipe - Calculada sobre TODO o cache auditado)
        const totalCamposEq = this.dadosAuditoriaCache.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOkEq = this.dadosAuditoriaCache.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const parcialEquipe = totalCamposEq > 0 ? (totalOkEq / totalCamposEq) * 100 : 0;
        const parcialEquipeStr = parcialEquipe.toFixed(2).replace('.',',') + '%';

        // KPI SELEÇÃO
        const totalDocs = auditFiltrados.length; // Total Auditados
        const totalCampos = auditFiltrados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOk = auditFiltrados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const totalNok = totalCampos - totalOk; // Total de Erros
        const atingimento = totalCampos > 0 ? (totalOk / totalCampos) * 100 : 0;
        const atingimentoStr = atingimento.toFixed(2).replace('.',',') + '%';

        // KPI VOLUME (Produção)
        // Se estiver filtrado por documento, Volume Validados fica comprometido pois 'producao' não tem doc_name.
        // Nesse caso, mostramos apenas os auditados desse tipo.
        let totalValidados = 0;
        let pctAuditadoStr = '-';
        
        if (!this.filtroDocumento) {
            totalValidados = prodFiltrados.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
            const pct = totalValidados > 0 ? (totalDocs / totalValidados) * 100 : 0;
            pctAuditadoStr = `${Math.round(pct)}%`;
        } else {
            totalValidados = "-"; // Não aplicável por documento
        }

        // Filtro Ativo Warning
        let filtroMsg = '';
        if (this.filtroDocumento) {
            filtroMsg = `
                <div class="mb-4 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg flex justify-between items-center animate-enter border border-blue-100">
                    <span class="text-sm font-bold"><i class="fas fa-filter mr-2"></i> Filtrando por: ${this.filtroDocumento}</span>
                    <button onclick="MinhaArea.Evolucao.limparFiltroDocumento()" class="text-xs bg-white border border-blue-200 hover:bg-blue-100 px-3 py-1 rounded-md font-bold transition">Limpar Filtro</button>
                </div>
            `;
        }

        container.innerHTML = `
            ${filtroMsg}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Assertividade</span>
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-bullseye"></i></div>
                    </div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span class="text-sm text-slate-500 font-medium">Meta Assertividade</span>
                            <span class="text-lg font-black text-slate-700">97%</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Total de Erros</span>
                            <span class="text-lg font-black text-rose-600">${totalNok}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider truncate max-w-[200px]" title="${nomeExibicao}">
                            Qualidade: <span class="text-blue-600">${nomeExibicao.split(' ')[0]}</span>
                        </span>
                        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><i class="fas fa-check-double"></i></div>
                    </div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span class="text-sm text-slate-500 font-medium">Sua Porcentagem</span>
                            <span class="text-lg font-black ${atingimento >= 97 ? 'text-blue-600' : 'text-amber-600'}">${atingimentoStr}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Média da Equipe</span>
                            <span class="text-lg font-black text-slate-500">${parcialEquipeStr}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume de Documentos</span>
                        <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><i class="fas fa-file-contract"></i></div>
                    </div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span class="text-sm text-slate-500 font-medium">Total Validados</span>
                            <span class="text-lg font-black text-emerald-600">${totalValidados.toLocaleString('pt-BR')}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Total Auditados</span>
                            <div class="flex items-baseline gap-1">
                                <span class="text-lg font-black text-slate-700">${totalDocs.toLocaleString('pt-BR')}</span>
                                <span class="text-xs text-slate-400 font-bold">(${pctAuditadoStr})</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end">
                <button onclick="document.getElementById('modal-resumo-docs').classList.remove('hidden')" class="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1">
                    <i class="fas fa-list"></i> Ver Resumo por Documento
                </button>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <i class="fas fa-list-ul text-indigo-500"></i> Histórico Detalhado <span class="text-xs font-normal text-slate-400 ml-1">(${periodoTexto})</span>
                    </h3>
                </div>
                <div class="overflow-x-auto max-h-[600px] custom-scroll">
                    ${this.gerarTabelaDetalhada(auditFiltrados)}
                </div>
            </div>

            <div id="modal-resumo-docs" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm hidden animate-enter">
                <div class="bg-white rounded-xl shadow-2xl w-[95%] max-w-4xl max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center p-4 border-b border-slate-100">
                        <h3 class="font-bold text-slate-700">Resumo por Documento</h3>
                        <button onclick="document.getElementById('modal-resumo-docs').classList.add('hidden')" class="text-slate-400 hover:text-red-500"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="p-0 overflow-auto custom-scroll">
                        ${this.gerarTabelaResumo(auditFiltrados)}
                    </div>
                </div>
            </div>
        `;
    },

    gerarTabelaResumo: function(dados) {
        if (!dados.length) return '<div class="p-6 text-center text-slate-400">Sem dados.</div>';
        
        const agrupado = {};
        dados.forEach(d => {
            const key = `${d.assistente}|${d.doc_name}`;
            if (!agrupado[key]) agrupado[key] = { assistente: d.assistente, documento: d.doc_name, docs: 0, campos: 0, ok: 0 };
            agrupado[key].docs++;
            agrupado[key].campos += (parseInt(d.num_campos)||0);
            agrupado[key].ok += (parseInt(d.acertos)||0);
        });
        const lista = Object.values(agrupado).map(i => ({...i, nok: i.campos-i.ok, assert: i.campos>0?(i.ok/i.campos)*100:0})).sort((a,b)=>a.assistente.localeCompare(b.assistente));
        
        return `<table class="w-full text-xs text-left text-slate-600"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0"><tr><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Auditados</th><th class="px-4 py-3 text-center text-rose-600">NOK Total</th><th class="px-4 py-3 text-center text-blue-600">% Assert.</th></tr></thead><tbody class="divide-y divide-slate-100">${lista.map(d=>`<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-bold text-blue-600">${d.assistente}</td><td class="px-4 py-2">${d.documento}</td><td class="px-4 py-2 text-center font-mono">${d.docs}</td><td class="px-4 py-2 text-center font-mono text-rose-600 font-bold">${d.nok>0?d.nok:'-'}</td><td class="px-4 py-2 text-center font-bold">${d.assert.toFixed(2).replace('.',',')}%</td></tr>`).join('')}</tbody></table>`;
    },

    gerarTabelaDetalhada: function(dados) {
        if (!dados.length) return '<div class="p-6 text-center text-slate-400">Sem dados detalhados.</div>';
        
        return `
        <table class="w-full text-xs text-left text-slate-600 whitespace-nowrap">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 shadow-sm">
                <tr>
                    <th class="px-4 py-3">Data</th>
                    <th class="px-4 py-3">Assistente</th>
                    <th class="px-4 py-3">Empresa</th>
                    <th class="px-4 py-3">Documento</th>
                    <th class="px-4 py-3 text-center">Status</th>
                    <th class="px-4 py-3 text-center text-rose-600">NOK</th>
                    <th class="px-4 py-3">Obs</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                ${dados.map(d => {
                    const k_nok = (parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0);
                    const rowClass = k_nok > 0 ? 'bg-rose-50/30' : 'hover:bg-slate-50';
                    const obsClass = k_nok > 0 ? 'text-rose-700 font-medium' : 'text-slate-400 italic';
                    
                    return `
                    <tr class="${rowClass} transition border-b border-slate-50 last:border-0">
                        <td class="px-4 py-2 font-bold text-slate-500">${d.data_referencia ? d.data_referencia.split('-').reverse().join('/') : '-'}</td>
                        <td class="px-4 py-2 text-blue-600 font-bold">${d.assistente}</td>
                        <td class="px-4 py-2 text-slate-600">${d.empresa || '-'}</td>
                        <td class="px-4 py-2">
                            <button onclick="MinhaArea.Evolucao.aplicarFiltroDocumento('${d.doc_name}')" class="text-blue-500 hover:underline hover:text-blue-700 text-left truncate max-w-[200px]" title="Filtrar por: ${d.doc_name}">
                                ${d.doc_name}
                            </button>
                        </td>
                        <td class="px-4 py-2 text-center">
                            <span class="${d.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'} font-bold text-[10px] uppercase">${d.status}</span>
                        </td>
                        <td class="px-4 py-2 text-center font-mono ${k_nok > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}">${k_nok > 0 ? k_nok : '-'}</td>
                        <td class="px-4 py-2 text-xs ${obsClass} max-w-[300px] whitespace-normal leading-tight">
                            ${d.apontamentos_obs || '<span class="opacity-30">-</span>'}
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    },

    // ... (IMPORTAÇÃO E OUTROS MÉTODOS MANTIDOS IGUAIS AO ANTERIOR)
    renderizarAuditoriaUI: function(container, dados) {
        // Tabela Pura para Auditoria (Mantida)
        const total = dados.length;
        const campos = dados.reduce((acc,cur)=>acc+(parseInt(cur.num_campos)||0),0);
        const nok = dados.reduce((acc,cur)=>acc+((parseInt(cur.num_campos)||0)-(parseInt(cur.acertos)||0)),0);
        
        container.innerHTML = `
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center"><span class="block text-xs text-blue-500 font-bold uppercase">Registros</span><span class="text-xl font-black text-blue-700">${total}</span></div>
                <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center"><span class="block text-xs text-slate-500 font-bold uppercase">Campos</span><span class="text-xl font-black text-slate-700">${campos}</span></div>
                <div class="bg-rose-50 p-3 rounded-lg border border-rose-100 text-center"><span class="block text-xs text-rose-500 font-bold uppercase">Erros</span><span class="text-xl font-black text-rose-700">${nok}</span></div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto max-h-[600px] custom-scroll">
                    ${this.gerarTabelaDetalhada(dados)}
                </div>
            </div>`;
    },

    importarAuditoria: function(input) {
        if (!input.files[0]) return;
        const file = input.files[0];
        const labelBtn = input.parentElement.querySelector('label');
        const originalText = labelBtn.innerHTML;
        labelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        const processar = async (rows) => {
            try {
                if (!rows.length) throw new Error("Vazio");
                const keys = Object.keys(rows[0]);
                const find = (opts) => { for(const o of opts) { const f = keys.find(k=>k.trim().toLowerCase()===o.toLowerCase()); if(f) return f; } return null; };
                const cTime = find(['end_time','time','Data']);
                const cAsst = find(['Assistente','Nome']);
                if(!cTime || !cAsst) { alert("Colunas obrigatórias não encontradas."); return; }

                const batch = [];
                rows.forEach(r => {
                    const rt = r[cTime], as = r[cAsst];
                    if(!rt && !as) return;
                    let df = null;
                    if(typeof rt==='number') df = new Date(Math.round((rt-25569)*864e5)).toISOString().split('T')[0];
                    else if(rt) { const s=String(rt); df = s.includes('T')?s.split('T')[0]:(s.includes('/')?`${s.split('/')[2]}-${s.split('/')[1]}-${s.split('/')[0]}`:s); }
                    const get = (o) => { const k=find(o); return k?r[k]:null; };
                    batch.push({
                        mes: get(['mês']), end_time: String(rt), data_referencia: df, empresa: get(['Empresa']), assistente: as, doc_name: get(['doc_name']),
                        status: get(['STATUS']), apontamentos_obs: get(['Apontamentos/obs']),
                        num_campos: parseInt(get(['nº Campos']))||0, acertos: parseInt(get(['Ok']))||0,
                        pct_erros_produtividade: get(['Nok']), pct_assert: get(['% Assert']), auditora: get(['Auditora'])
                    });
                });

                if(batch.length) {
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

    excluirDadosPeriodo: async function() {
        const { inicio, fim, texto, tipo } = MinhaArea.getPeriodo();
        if (tipo === 'dia') { alert("A exclusão é permitida apenas por Mês ou Ano."); return; }
        if (!confirm(`EXCLUIR AUDITORIA: ${texto}\n\nTem certeza?`)) return;
        try {
            await MinhaArea.supabase.from('auditoria_apontamentos').delete().gte('data_referencia', inicio).lte('data_referencia', fim);
            alert("Excluído com sucesso.");
            this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    },

    carregarEvolucao: async function() {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;
        container.innerHTML = '<div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando...</div>';
        try {
            const ano = MinhaArea.dataAtual.getFullYear();
            const inicioAno = `${ano}-01-01`; const fimAno = `${ano}-12-31`;
            let qAudit = MinhaArea.supabase.from('auditoria_apontamentos').select('data_referencia, assistente, num_campos, acertos').gte('data_referencia', inicioAno).lte('data_referencia', fimAno);
            let qProd = MinhaArea.supabase.from('producao').select('data_referencia, quantidade, usuario_id, usuarios!inner(nome)').gte('data_referencia', inicioAno).lte('data_referencia', fimAno);
            
            const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;
            let nomeFiltro = '';
            if (MinhaArea.user.funcao === 'Assistente') { nomeFiltro = MinhaArea.user.nome; qProd = qProd.eq('usuario_id', MinhaArea.user.id); }
            else if (usuarioAlvo && usuarioAlvo !== 'todos') { nomeFiltro = this.mapaUsuarios[usuarioAlvo] || ''; }

            if (nomeFiltro) { const pNome = nomeFiltro.split(' ')[0]; qAudit = qAudit.ilike('assistente', `%${pNome}%`); qProd = qProd.ilike('usuarios.nome', `%${pNome}%`); }

            const [rAudit, rProd] = await Promise.all([qAudit, qProd]);
            if (rAudit.error) throw rAudit.error; if (rProd.error) throw rProd.error;
            this.renderizarEvolucaoUI(container, rAudit.data, rProd.data, ano);
        } catch (e) { console.error(e); }
    },

    renderizarEvolucaoUI: function(container, dadosAuditoria, dadosProducao, ano) {
        const meses = Array.from({length: 12}, () => ({ audit_campos: 0, audit_ok: 0, prod_soma: 0, prod_dias: new Set() }));
        dadosAuditoria.forEach(d => { if(d.data_referencia) { const m = new Date(d.data_referencia).getMonth(); meses[m].audit_campos += (parseInt(d.num_campos)||0); meses[m].audit_ok += (parseInt(d.acertos)||0); } });
        dadosProducao.forEach(d => { if(d.data_referencia) { const m = new Date(d.data_referencia).getMonth(); meses[m].prod_soma += (parseInt(d.quantidade)||0); meses[m].prod_dias.add(d.data_referencia); } });
        
        const dadosFinais = meses.map(m => ({
            assertividade: m.audit_campos > 0 ? (m.audit_ok / m.audit_campos) * 100 : null,
            produtividade: m.prod_dias.size > 0 ? Math.round(m.prod_soma / m.prod_dias.size) : null
        }));

        const nomesMeses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const tabelaHtml = (titulo, inicio) => `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div class="bg-slate-50 px-4 py-3 border-b border-slate-200"><h3 class="font-bold text-slate-700 text-sm uppercase">${titulo}</h3></div>
                <div class="grid grid-cols-2 divide-x divide-slate-100">
                    <div class="p-4"><h4 class="text-xs font-bold text-emerald-600 mb-2">Assertividade (Meta 97%)</h4><table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead><tbody class="divide-y">${[0,1,2,3,4,5].map(i => { const d = dadosFinais[inicio+i]; return `<tr><td class="py-2 capitalize">${nomesMeses[inicio+i]}</td><td class="font-bold ${d.assertividade>=97?'text-emerald-600':'text-rose-600'}">${d.assertividade?d.assertividade.toFixed(2)+'%':'-'}</td><td>${d.assertividade?(d.assertividade>=97?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-rose-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table></div>
                    <div class="p-4"><h4 class="text-xs font-bold text-blue-600 mb-2">Produtividade (Meta 650)</h4><table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead><tbody class="divide-y">${[0,1,2,3,4,5].map(i => { const d = dadosFinais[inicio+i]; return `<tr><td class="py-2 capitalize">${nomesMeses[inicio+i]}</td><td class="font-bold ${d.produtividade>=650?'text-blue-600':'text-amber-600'}">${d.produtividade||'-'}</td><td>${d.produtividade?(d.produtividade>=650?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-amber-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table></div>
                </div>
            </div>`;

        container.innerHTML = `<div class="grid grid-cols-1 gap-6 animate-enter"><div class="flex justify-between items-center"><h2 class="text-xl font-bold text-slate-800">Metas Anuais - ${ano}</h2></div>${tabelaHtml('Primeiro Semestre (H1)', 0)}${tabelaHtml('Segundo Semestre (H2)', 6)}</div>`;
    }
};