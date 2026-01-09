MinhaArea.Evolucao = {
    subAbaAtual: 'dash', // dash | auditoria | evolucao
    dadosCache: [], 

    carregar: async function() {
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA' || MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (!isGestora && this.subAbaAtual === 'auditoria') this.subAbaAtual = 'dash';

        this.renderizarLayout(isGestora);
        
        if (this.subAbaAtual === 'evolucao') {
            await this.carregarEvolucao();
        } else {
            await this.carregarDadosBase();
        }
    },

    mudarSubAba: function(novaAba) {
        this.subAbaAtual = novaAba;
        this.carregar();
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

        // BARRA DE BUSCA (GLOBAL PARA TODAS SUB-ABAS)
        // Só não mostra na Evolução Anual pois lá é agregado
        let searchHtml = '';
        if (this.subAbaAtual !== 'evolucao') {
            searchHtml = `
                <div class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-96">
                    <i class="fas fa-search text-slate-400 ml-2"></i>
                    <input type="text" onkeyup="MinhaArea.Evolucao.filtrarBusca(this.value)" placeholder="Buscar em todos os campos..." class="w-full text-sm text-slate-600 outline-none placeholder:text-slate-400 bg-transparent">
                </div>
            `;
        }

        // BOTÕES DE AÇÃO (IMPORTAR / EXCLUIR)
        let actionsHtml = '';
        if (isGestora && this.subAbaAtual === 'auditoria') {
            actionsHtml = `
                <div class="flex items-center gap-2">
                    <button onclick="MinhaArea.Evolucao.excluirDadosPeriodo()" class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold py-2 px-3 rounded-lg transition flex items-center gap-2" title="Excluir dados do período selecionado">
                        <i class="fas fa-trash-alt"></i> Excluir Período
                    </button>
                    <label class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center gap-2">
                        <i class="fas fa-cloud-upload-alt"></i> Importar Auditoria
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

    // =================================================================================
    // CARREGAMENTO DE DADOS (BASE)
    // =================================================================================
    carregarDadosBase: async function() {
        const container = document.getElementById('conteudo-okr');
        
        try {
            // Usa o novo seletor unificado
            const { inicio, fim } = MinhaArea.getPeriodo();
            
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            const { data, error } = await query;
            if(error) throw error;

            this.dadosCache = data || []; // Cache contém TODOS do período
            
            // Se for gestora, atualiza o select do topo (se necessário, mas o select unificado já é inteligente)
            if (document.getElementById('admin-user-select')) {
                this.atualizarOpcoesSeletor(this.dadosCache);
            }

            this.atualizarVisualizacao();

        } catch (e) {
            console.error(e);
            if(container) container.innerHTML = `<div class="text-rose-500 text-center">Erro: ${e.message}</div>`;
        }
    },

    filtrarBusca: function(termo) {
        if (!this.dadosCache) return;
        
        // Reaplica filtros de assistente + busca
        this.atualizarVisualizacao(termo);
    },

    atualizarVisualizacao: function(termoBusca = '') {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;

        if (this.subAbaAtual === 'evolucao') return;

        // 1. Filtra por Assistente
        let dadosFiltrados = this.dadosCache;
        const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;

        // Variável para o título do card
        let nomeExibicao = "Equipe Geral";

        if (MinhaArea.user.funcao === 'Assistente') {
            const primeiroNome = MinhaArea.user.nome.split(' ')[0].toLowerCase();
            dadosFiltrados = this.dadosCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
            nomeExibicao = MinhaArea.user.nome;
        } else if (usuarioAlvo && usuarioAlvo !== 'todos') {
            dadosFiltrados = this.dadosCache.filter(d => d.assistente === usuarioAlvo); // usuarioAlvo aqui é o Nome (texto)
            nomeExibicao = usuarioAlvo;
        }

        // 2. Filtra por Busca (Texto)
        if (termoBusca) {
            const lower = termoBusca.toLowerCase();
            dadosFiltrados = dadosFiltrados.filter(d => Object.values(d).some(v => String(v).toLowerCase().includes(lower)));
        }

        // Renderiza
        if (this.subAbaAtual === 'auditoria') {
            this.renderizarAuditoriaUI(container, dadosFiltrados);
        } else {
            this.renderizarDashUI(container, dadosFiltrados, this.dadosCache, nomeExibicao);
        }
    },

    // =================================================================================
    // MÓDULO 1: DASH GERAL
    // =================================================================================
    renderizarDashUI: function(container, dadosFiltrados, dadosEquipeTotal, nomeExibicao) {
        if (!dadosFiltrados || dadosFiltrados.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum dado encontrado para o filtro selecionado.</div>`;
            return;
        }

        const { inicio, fim } = MinhaArea.getPeriodo();
        const dataFormatada = `${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')}`;

        // KPI Equipe (Assertividade)
        const totalCamposEq = dadosEquipeTotal.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOkEq = dadosEquipeTotal.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const parcialEquipe = totalCamposEq > 0 ? (totalOkEq / totalCamposEq) * 100 : 0;

        // KPI Seleção (Qualidade e Volume)
        const totalDocs = dadosFiltrados.length;
        const totalValidados = dadosFiltrados.filter(d => ((parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0)) === 0).length;
        const totalCampos = dadosFiltrados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOk = dadosFiltrados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const totalNok = totalCampos - totalOk;
        const atingimento = totalCampos > 0 ? (totalOk / totalCampos) * 100 : 0;
        const pctAuditados = 10; // Exemplo fixo pedido ou precisa calcular sobre meta? Vou deixar calculado se possível ou fixo conforme exemplo.
        // O exemplo "100 (10%)" sugere percentual sobre um total esperado. Como não temos a meta de volume aqui, mostrarei % de Validados sobre Auditados
        const pctValidados = totalDocs > 0 ? Math.round((totalValidados / totalDocs)*100) : 0;

        // HTML
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Assertividade</span>
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-bullseye"></i></div>
                    </div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span class="text-sm text-slate-500 font-medium">Meta</span>
                            <span class="text-lg font-black text-slate-700">97%</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Parcial Equipe</span>
                            <span class="text-lg font-black ${parcialEquipe >= 97 ? 'text-emerald-600' : 'text-amber-600'}">${parcialEquipe.toFixed(2).replace('.',',')}%</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider truncate max-w-[200px]" title="${nomeExibicao}">
                            Qualidade: <span class="text-blue-600">${nomeExibicao}</span>
                        </span>
                        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><i class="fas fa-check-double"></i></div>
                    </div>
                    <div class="space-y-3 mt-1">
                        <div class="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span class="text-sm text-slate-500 font-medium">Atingimento</span>
                            <span class="text-lg font-black ${atingimento >= 97 ? 'text-blue-600' : 'text-amber-600'}">${atingimento.toFixed(2).replace('.',',')}%</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Campos com Erros</span>
                            <span class="text-lg font-black text-rose-600">${totalNok}</span>
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
                            <span class="text-lg font-black text-emerald-600">${totalValidados}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-500 font-medium">Total Auditados</span>
                            <div class="flex items-baseline gap-1">
                                <span class="text-lg font-black text-slate-700">${totalDocs}</span>
                                <span class="text-xs text-slate-400 font-bold">(${pctValidados}%)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer" onclick="document.getElementById('dash-table-resumo').classList.toggle('hidden')">
                    <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <i class="fas fa-folder text-blue-400"></i> Resumo por Documento <span class="text-xs font-normal text-slate-400 ml-2">(${dataFormatada})</span>
                    </h3>
                    <i class="fas fa-chevron-down text-slate-400 text-xs"></i>
                </div>
                <div id="dash-table-resumo" class="overflow-x-auto max-h-[400px] custom-scroll">
                    ${this.gerarTabelaResumo(dadosFiltrados)}
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-50 border-b border-slate-100">
                    <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <i class="fas fa-list-ul text-indigo-500"></i> Histórico Detalhado
                    </h3>
                </div>
                <div class="overflow-x-auto max-h-[500px] custom-scroll">
                    ${this.gerarTabelaDetalhada(dadosFiltrados)}
                </div>
            </div>
        `;
    },

    gerarTabelaResumo: function(dados) {
        const agrupado = {};
        dados.forEach(d => {
            const key = `${d.assistente}|${d.doc_name}`;
            if (!agrupado[key]) agrupado[key] = { assistente: d.assistente, documento: d.doc_name, docs: 0, campos: 0, ok: 0 };
            agrupado[key].docs++;
            agrupado[key].campos += (parseInt(d.num_campos)||0);
            agrupado[key].ok += (parseInt(d.acertos)||0);
        });
        const lista = Object.values(agrupado).map(i => ({...i, nok: i.campos-i.ok, assert: i.campos>0?(i.ok/i.campos)*100:0})).sort((a,b)=>a.assistente.localeCompare(b.assistente));
        
        return `<table class="w-full text-xs text-left text-slate-600"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0"><tr><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Auditados</th><th class="px-4 py-3 text-center text-rose-600">NOK</th><th class="px-4 py-3 text-center text-blue-600">% Assert.</th></tr></thead><tbody class="divide-y divide-slate-100">${lista.map(d=>`<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-bold text-blue-600">${d.assistente}</td><td class="px-4 py-2">${d.documento}</td><td class="px-4 py-2 text-center font-mono">${d.docs}</td><td class="px-4 py-2 text-center font-mono text-rose-600 font-bold">${d.nok>0?d.nok:'-'}</td><td class="px-4 py-2 text-center font-bold">${d.assert.toFixed(2).replace('.',',')}%</td></tr>`).join('')}</tbody></table>`;
    },

    gerarTabelaDetalhada: function(dados) {
        return `<table class="w-full text-xs text-left text-slate-600"><thead class="bg-slate-50 text-slate-500 font-bold sticky top-0"><tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Assistente</th><th class="px-4 py-3">Documento</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-center text-rose-600">NOK</th><th class="px-4 py-3">Obs</th></tr></thead><tbody class="divide-y divide-slate-100">${dados.map(d=>{const k=(parseInt(d.num_campos)||0)-(parseInt(d.acertos)||0); return `<tr class="${k>0?'bg-rose-50/30':'hover:bg-slate-50'} border-b border-slate-50"><td class="px-4 py-2 font-bold">${d.data_referencia?d.data_referencia.split('-').reverse().join('/'):'-'}</td><td class="px-4 py-2 text-blue-600 font-bold">${d.assistente}</td><td class="px-4 py-2 truncate max-w-[200px]" title="${d.doc_name}">${d.doc_name}</td><td class="px-4 py-2 text-center"><span class="${d.status==='OK'?'text-emerald-600':'text-rose-600'} font-bold text-[10px]">${d.status}</span></td><td class="px-4 py-2 text-center font-bold ${k>0?'text-rose-600':'text-slate-300'}">${k>0?k:'-'}</td><td class="px-4 py-2 text-xs ${k>0?'text-rose-700 font-medium':'text-slate-400 italic'}">${d.apontamentos_obs||'-'}</td></tr>`;}).join('')}</tbody></table>`;
    },

    renderizarAuditoriaUI: function(container, dados) {
        // ... (Mantém a tabela de Auditoria igual, com a barra de busca funcionando)
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

    // --- FUNÇÕES DE AÇÃO ---
    
    excluirDadosPeriodo: async function() {
        const { inicio, fim, texto, tipo } = MinhaArea.getPeriodo();
        
        if (tipo === 'dia') {
            alert("A exclusão em massa só é permitida por Mês ou Ano para segurança.");
            return;
        }

        if (!confirm(`ATENÇÃO GESTORA!\n\nVocê está prestes a EXCLUIR TODOS os registros de auditoria de:\n\n${texto} (${inicio} a ${fim})\n\nEssa ação não pode ser desfeita. Tem certeza?`)) return;

        try {
            const { error } = await MinhaArea.supabase
                .from('auditoria_apontamentos')
                .delete()
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (error) throw error;

            alert("Registros excluídos com sucesso.");
            this.carregar(); // Recarrega

        } catch (e) {
            console.error(e);
            alert("Erro ao excluir: " + e.message);
        }
    },

    importarAuditoria: function(input) {
        // ... (Mantém a importação igual)
        if (!input.files[0]) return;
        const file = input.files[0];
        const label = input.parentElement.querySelector('label'); // Ajuste se necessário para achar o texto ou icone
        
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
                    else if(rt) { const s=String(rt); df = s.includes('T')?s.split('T')[0]:s; }
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
            } catch(e) { console.error(e); alert(e.message); } finally { input.value = ''; }
        };

        if(file.name.endsWith('.xlsx')) {
            const r = new FileReader();
            r.onload = e => { const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'}); processar(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])); };
            r.readAsArrayBuffer(file);
        } else {
            Papa.parse(file, {header:true, skipEmptyLines:true, complete: res=>processar(res.data)});
        }
    },

    // --- EVOLUÇÃO ---
    carregarEvolucao: async function() {
        // ... (Mantém igual ao anterior)
        const container = document.getElementById('conteudo-okr');
        if(!container) return;
        container.innerHTML = '<div class="py-12 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando...</div>';
        try {
            const { inicio, fim, texto, tipo } = MinhaArea.getPeriodo(); // Usa filtro global agora? Se for evolução ANUAL, talvez force o ano.
            // Para evolução, geralmente queremos o ANO TODO. Vamos pegar o ano do filtro.
            const ano = inicio.split('-')[0];
            const inicioAno = `${ano}-01-01`;
            const fimAno = `${ano}-12-31`;

            let qAudit = MinhaArea.supabase.from('auditoria_apontamentos').select('data_referencia, assistente, num_campos, acertos').gte('data_referencia', inicioAno).lte('data_referencia', fimAno);
            let qProd = MinhaArea.supabase.from('producao').select('data_referencia, quantidade, usuario_id, usuarios!inner(nome)').gte('data_referencia', inicioAno).lte('data_referencia', fimAno);

            const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;
            let nomeFiltro = '';
            if (MinhaArea.user.funcao === 'Assistente') { nomeFiltro = MinhaArea.user.nome; qProd = qProd.eq('usuario_id', MinhaArea.user.id); }
            else if (usuarioAlvo && usuarioAlvo !== 'todos') { nomeFiltro = usuarioAlvo; } // usuarioAlvo é o nome

            if (nomeFiltro) {
                const pNome = nomeFiltro.split(' ')[0];
                qAudit = qAudit.ilike('assistente', `%${pNome}%`);
                qProd = qProd.ilike('usuarios.nome', `%${pNome}%`);
            }

            const [rAudit, rProd] = await Promise.all([qAudit, qProd]);
            if (rAudit.error) throw rAudit.error;
            if (rProd.error) throw rProd.error;

            this.renderizarEvolucaoUI(container, rAudit.data, rProd.data, ano);
        } catch (e) { console.error(e); }
    },

    renderizarEvolucaoUI: function(container, dadosAuditoria, dadosProducao, ano) {
        // ... (Mantém o render da evolução)
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
                    <div class="p-4">
                        <h4 class="text-xs font-bold text-emerald-600 mb-2">Assertividade (Meta 97%)</h4>
                        <table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead>
                        <tbody class="divide-y">${[0,1,2,3,4,5].map(i => { const d = dadosFinais[inicio+i]; return `<tr><td class="py-2 capitalize">${nomesMeses[inicio+i]}</td><td class="font-bold ${d.assertividade>=97?'text-emerald-600':'text-rose-600'}">${d.assertividade?d.assertividade.toFixed(2)+'%':'-'}</td><td>${d.assertividade?(d.assertividade>=97?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-rose-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table>
                    </div>
                    <div class="p-4">
                        <h4 class="text-xs font-bold text-blue-600 mb-2">Produtividade (Meta 650)</h4>
                        <table class="w-full text-xs text-left"><thead class="text-slate-400 font-bold border-b"><tr><th>Mês</th><th>Real</th><th>Status</th></tr></thead>
                        <tbody class="divide-y">${[0,1,2,3,4,5].map(i => { const d = dadosFinais[inicio+i]; return `<tr><td class="py-2 capitalize">${nomesMeses[inicio+i]}</td><td class="font-bold ${d.produtividade>=650?'text-blue-600':'text-amber-600'}">${d.produtividade||'-'}</td><td>${d.produtividade?(d.produtividade>=650?'<i class="fas fa-check text-emerald-500"></i>':'<i class="fas fa-times text-amber-400"></i>'):'-'}</td></tr>`;}).join('')}</tbody></table>
                    </div>
                </div>
            </div>`;

        container.innerHTML = `<div class="grid grid-cols-1 gap-6 animate-enter"><div class="flex justify-between items-center"><h2 class="text-xl font-bold text-slate-800">Metas Anuais - ${ano}</h2></div>${tabelaHtml('Primeiro Semestre (H1)', 0)}${tabelaHtml('Segundo Semestre (H2)', 6)}</div>`;
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