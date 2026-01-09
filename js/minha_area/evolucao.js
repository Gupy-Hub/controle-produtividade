MinhaArea.Evolucao = {
    subAbaAtual: 'dash', // Padrão
    dadosCache: [],

    carregar: async function() {
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA' || MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (!isGestora) this.subAbaAtual = 'dash';

        this.renderizarLayout(isGestora);
        
        // Carrega sempre a base da auditoria, pois o Dash agora depende dela
        await this.carregarDadosBase();
    },

    mudarPeriodo: function() {
        this.carregarDadosBase();
    },

    mudarSubAba: function(novaAba) {
        this.subAbaAtual = novaAba;
        this.renderizarLayout(true); // Re-renderiza layout para atualizar botões/importador
        this.atualizarVisualizacao(); // Atualiza apenas a view sem refazer query se não precisar
    },

    aplicarFiltroAssistente: function() {
        this.atualizarVisualizacao();
    },

    // --- LAYOUT ---
    renderizarLayout: function(isGestora) {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        let navHtml = '';
        if (isGestora) {
            navHtml = `
                <div class="flex items-center gap-2 mb-6 bg-white p-1 rounded-lg border border-slate-200 w-fit">
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('dash')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'dash' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Dash Assistentes
                    </button>
                    <button onclick="MinhaArea.Evolucao.mudarSubAba('auditoria')" class="px-4 py-1.5 rounded-md text-sm font-bold transition ${this.subAbaAtual === 'auditoria' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}">
                        Auditoria Detalhada
                    </button>
                </div>
            `;
        } else {
            navHtml = `<div class="mb-4 flex items-center gap-2 text-slate-700"><i class="fas fa-chart-pie text-blue-500"></i> <h2 class="text-lg font-bold">Minha Performance</h2></div>`;
        }

        // Importador: Só aparece se for Gestora E estiver na aba Auditoria
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
    // CARREGAMENTO DE DADOS (ÚNICO)
    // =================================================================================
    carregarDadosBase: async function() {
        const container = document.getElementById('conteudo-okr');
        const filtroHeader = document.getElementById('filtro-periodo-okr-header');
        const periodo = filtroHeader ? filtroHeader.value : 'mes';
        
        try {
            const { inicio, fim } = this.getDatasPorPeriodo(periodo);
            
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            const { data, error } = await query;
            if(error) throw error;

            this.dadosCache = data || [];
            
            // Atualiza opções do seletor de assistentes (se for gestora)
            this.atualizarOpcoesSeletor(this.dadosCache);

            this.atualizarVisualizacao();

        } catch (e) {
            console.error(e);
            if(container) container.innerHTML = `<div class="text-rose-500 text-center">Erro: ${e.message}</div>`;
        }
    },

    atualizarVisualizacao: function() {
        const container = document.getElementById('conteudo-okr');
        if(!container) return;

        // 1. Filtra por Assistente Selecionado (ou usuário logado se for assistente)
        let dadosFiltrados = this.dadosCache;
        const usuarioAlvo = document.getElementById('admin-user-select')?.value || MinhaArea.usuarioAlvo;

        // Se for assistente logada, filtra pelo nome dela
        if (MinhaArea.user.funcao === 'Assistente') {
            const primeiroNome = MinhaArea.user.nome.split(' ')[0].toLowerCase();
            dadosFiltrados = this.dadosCache.filter(d => d.assistente && d.assistente.toLowerCase().includes(primeiroNome));
        } 
        // Se for gestora e selecionou alguém específico (diferente de 'todos')
        else if (usuarioAlvo && usuarioAlvo !== 'todos') {
            // O valor do option é o Nome (texto) que populamos no atualizarOpcoesSeletor
            dadosFiltrados = this.dadosCache.filter(d => d.assistente === usuarioAlvo);
        }

        // 2. Renderiza a sub-aba correta
        if (this.subAbaAtual === 'auditoria') {
            this.renderizarAuditoriaUI(container, dadosFiltrados);
        } else {
            this.renderizarDashUI(container, dadosFiltrados);
        }
    },

    // =================================================================================
    // MÓDULO 1: DASH ASSISTENTES (AGREGADO)
    // =================================================================================
    renderizarDashUI: function(container, dados) {
        if (!dados || dados.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum dado encontrado para o período/usuário selecionado.</div>`;
            return;
        }

        // --- AGREGAÇÃO DE DADOS ---
        // Agrupa por: Mês + Assistente + Documento
        const agrupado = {};

        dados.forEach(d => {
            // Tenta extrair o mês da data se a coluna 'mes' estiver vazia ou for importada
            let mesRef = d.mes;
            if(!mesRef && d.data_referencia) {
                const date = new Date(d.data_referencia);
                mesRef = date.toLocaleString('pt-BR', { month: 'long' });
                mesRef = mesRef.charAt(0).toUpperCase() + mesRef.slice(1);
            }
            if(!mesRef) mesRef = "Geral";

            const key = `${mesRef}|${d.assistente}|${d.doc_name}`;
            
            if (!agrupado[key]) {
                agrupado[key] = {
                    mes: mesRef,
                    assistente: d.assistente,
                    documento: d.doc_name,
                    docs_auditados: 0, // Contagem de linhas
                    campos_auditados: 0, // Soma de num_campos
                    campos_ok: 0, // Soma de acertos
                    campos_nok: 0 // Soma de (num_campos - acertos)
                };
            }

            const n_campos = parseInt(d.num_campos)||0;
            const n_acertos = parseInt(d.acertos)||0;

            agrupado[key].docs_auditados += 1;
            agrupado[key].campos_auditados += n_campos;
            agrupado[key].campos_ok += n_acertos;
            agrupado[key].campos_nok += (n_campos - n_acertos);
        });

        // Transforma objeto em array e calcula assertividade
        const listaDash = Object.values(agrupado).map(item => {
            const assert = item.campos_auditados > 0 ? (item.campos_ok / item.campos_auditados) * 100 : 0;
            return { ...item, assertividade: assert };
        });

        // Ordena por Mês e Assistente
        listaDash.sort((a, b) => a.assistente.localeCompare(b.assistente));

        // TOTAIS GERAIS (KPIs)
        const totalDocs = listaDash.reduce((acc, cur) => acc + cur.docs_auditados, 0);
        const totalNok = listaDash.reduce((acc, cur) => acc + cur.campos_nok, 0);
        const totalCampos = listaDash.reduce((acc, cur) => acc + cur.campos_auditados, 0);
        const totalOk = listaDash.reduce((acc, cur) => acc + cur.campos_ok, 0);
        const mediaAssert = totalCampos > 0 ? (totalOk / totalCampos) * 100 : 0;

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase">Docs Auditados</p>
                        <h3 class="text-2xl font-black text-slate-800">${totalDocs}</h3>
                    </div>
                    <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><i class="fas fa-file-contract"></i></div>
                </div>
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase">Campos NOK</p>
                        <h3 class="text-2xl font-black text-rose-600">${totalNok}</h3>
                    </div>
                    <div class="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center"><i class="fas fa-times-circle"></i></div>
                </div>
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase">Assertividade Geral</p>
                        <h3 class="text-2xl font-black ${mediaAssert >= 95 ? 'text-emerald-600' : 'text-amber-600'}">${mediaAssert.toFixed(2).replace('.',',')}%</h3>
                    </div>
                    <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fas fa-check-circle"></i></div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 text-sm">Resumo por Documento</h3>
                    <span class="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border">${listaDash.length} grupos</span>
                </div>
                <div class="overflow-x-auto max-h-[500px] custom-scroll">
                    <table class="w-full text-xs text-left text-slate-600">
                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 shadow-sm">
                            <tr>
                                <th class="px-4 py-3">Mês</th>
                                <th class="px-4 py-3">Assistente</th>
                                <th class="px-4 py-3">Documento</th>
                                <th class="px-4 py-3 text-center" title="Quantidade de documentos analisados">Auditados</th>
                                <th class="px-4 py-3 text-center text-emerald-600" title="Soma dos acertos (Campos OK)">Validados</th>
                                <th class="px-4 py-3 text-center text-rose-600" title="Soma dos erros (Campos NOK)">NOK</th>
                                <th class="px-4 py-3 text-center text-blue-600">% Assert.</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${listaDash.map(d => `
                                <tr class="hover:bg-slate-50">
                                    <td class="px-4 py-3 font-bold text-slate-500">${d.mes}</td>
                                    <td class="px-4 py-3 text-blue-600 font-bold">${d.assistente}</td>
                                    <td class="px-4 py-3">${d.documento}</td>
                                    <td class="px-4 py-3 text-center font-mono">${d.docs_auditados}</td>
                                    <td class="px-4 py-3 text-center font-mono text-emerald-600">${d.campos_ok}</td>
                                    <td class="px-4 py-3 text-center font-mono text-rose-600 font-bold">${d.campos_nok}</td>
                                    <td class="px-4 py-3 text-center font-bold">${d.assertividade.toFixed(2).replace('.',',')}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // =================================================================================
    // MÓDULO 2: AUDITORIA DETALHADA
    // =================================================================================
    renderizarAuditoriaUI: function(container, dados) {
        if (!dados || dados.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">Nenhum registro de auditoria encontrado.</div>`;
            return;
        }

        const total = dados.length;
        const acertos = dados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const campos = dados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const nok = campos - acertos;
        const assert = campos > 0 ? ((acertos/campos)*100).toFixed(2) : '0.00';

        container.innerHTML = `
            <div class="grid grid-cols-4 gap-4 mb-4">
                <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center"><span class="block text-xs text-blue-500 font-bold uppercase">Total Registros</span><span class="text-xl font-black text-blue-700">${total}</span></div>
                <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center"><span class="block text-xs text-slate-500 font-bold uppercase">Total Campos</span><span class="text-xl font-black text-slate-700">${campos}</span></div>
                <div class="bg-rose-50 p-3 rounded-lg border border-rose-100 text-center"><span class="block text-xs text-rose-500 font-bold uppercase">Erros (NOK)</span><span class="text-xl font-black text-rose-700">${nok}</span></div>
                <div class="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center"><span class="block text-xs text-emerald-500 font-bold uppercase">Assertividade</span><span class="text-xl font-black text-emerald-700">${assert.replace('.',',')}%</span></div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto max-h-[500px] custom-scroll">
                    <table class="w-full text-xs text-left text-slate-600 whitespace-nowrap">
                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 shadow-sm">
                            <tr>
                                <th class="px-4 py-3">Data</th>
                                <th class="px-4 py-3">Assistente</th>
                                <th class="px-4 py-3">Documento</th>
                                <th class="px-4 py-3 text-center">Status</th>
                                <th class="px-4 py-3 text-center">Campos</th>
                                <th class="px-4 py-3 text-center text-emerald-600">Ok</th>
                                <th class="px-4 py-3 text-center text-rose-600">NOK</th>
                                <th class="px-4 py-3">Obs</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${dados.map(d => {
                                const k_nok = (parseInt(d.num_campos)||0) - (parseInt(d.acertos)||0);
                                let stBadge = '';
                                if(d.status === 'OK') stBadge = '<span class="text-emerald-600 font-bold">OK</span>';
                                else stBadge = `<span class="text-rose-500 font-bold">${d.status}</span>`;

                                return `
                                <tr class="hover:bg-slate-50">
                                    <td class="px-4 py-3 font-bold">${d.data_referencia ? d.data_referencia.split('-').reverse().join('/') : '-'}</td>
                                    <td class="px-4 py-3 text-blue-600 font-bold">${d.assistente}</td>
                                    <td class="px-4 py-3 truncate max-w-[150px]" title="${d.doc_name}">${d.doc_name}</td>
                                    <td class="px-4 py-3 text-center">${stBadge}</td>
                                    <td class="px-4 py-3 text-center font-mono text-slate-400">${d.num_campos}</td>
                                    <td class="px-4 py-3 text-center font-mono text-emerald-600">${d.acertos}</td>
                                    <td class="px-4 py-3 text-center font-mono text-rose-600 font-bold">${k_nok}</td>
                                    <td class="px-4 py-3 italic text-slate-400 truncate max-w-[200px]" title="${d.apontamentos_obs}">${d.apontamentos_obs||'-'}</td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // =================================================================================
    // IMPORTAÇÃO (APENAS AUDITORIA)
    // =================================================================================
    importarAuditoria: function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const labelBtn = input.parentElement.querySelector('label');
        const originalText = labelBtn.innerHTML;
        labelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        const processarDados = async (rows) => {
            try {
                if (!rows || rows.length === 0) throw new Error("Arquivo vazio.");
                const headers = Object.keys(rows[0]);
                const encontrarColuna = (opcoes) => {
                    for (const opt of opcoes) {
                        const found = headers.find(h => h.trim().toLowerCase() === opt.toLowerCase());
                        if (found) return found;
                    }
                    return null;
                };

                const colEndTime = encontrarColuna(['end_time', 'time', 'Data']);
                const colAssistente = encontrarColuna(['Assistente', 'Nome', 'Funcionário']);

                if (!colEndTime || !colAssistente) {
                    alert(`Erro: Colunas obrigatórias não encontradas.\nNecessário: 'end_time' (ou Data) e 'Assistente'.`);
                    return;
                }

                const batch = [];
                // Fill Down Logic (Se necessário, mas na auditoria detalhada geralmente não precisa. 
                // Mantendo simples pois auditoria detalhada costuma ter linha a linha preenchida)
                rows.forEach(row => {
                    const rawTime = row[colEndTime];
                    const assistente = row[colAssistente];
                    if (!rawTime && !assistente) return;

                    let dataFinal = null;
                    if (typeof rawTime === 'number') {
                        const date = new Date(Math.round((rawTime - 25569)*86400*1000));
                        dataFinal = date.toISOString().split('T')[0];
                    } else if (rawTime) {
                        const str = String(rawTime);
                        if (str.includes('T')) dataFinal = str.split('T')[0];
                        else if (str.includes('/')) {
                            const p = str.split('/');
                            if(p.length === 3) dataFinal = `${p[2]}-${p[1]}-${p[0]}`;
                        } else { dataFinal = str; }
                    }

                    const getVal = (opts) => { const k = encontrarColuna(opts); return k ? row[k] : null; };

                    batch.push({
                        mes: getVal(['mês', 'mes']),
                        end_time: String(rawTime),
                        data_referencia: dataFinal,
                        empresa: getVal(['Empresa']),
                        assistente: assistente,
                        doc_name: getVal(['doc_name', 'Documento']),
                        status: getVal(['STATUS', 'Status']),
                        apontamentos_obs: getVal(['Apontamentos/obs', 'Apontamentos', 'Obs']),
                        num_campos: parseInt(getVal(['nº Campos', 'Campos'])) || 0,
                        acertos: parseInt(getVal(['Ok', 'Acertos'])) || 0,
                        pct_erros_produtividade: getVal(['Nok', '% de Erros X Produtividade']),
                        pct_assert: getVal(['% Assert', '% Assert.', 'Assertividade']),
                        auditora: getVal(['Auditora', 'Auditor'])
                    });
                });

                if (batch.length > 0) {
                    labelBtn.innerHTML = '<i class="fas fa-save"></i> Salvando...';
                    const { error } = await MinhaArea.supabase.from('auditoria_apontamentos').insert(batch);
                    if (error) throw error;
                    alert(`Sucesso! ${batch.length} registros importados.`);
                    MinhaArea.Evolucao.carregar(); 
                } else {
                    alert("Nenhum dado válido para importar.");
                }
            } catch (err) {
                console.error(err);
                alert("Erro ao processar: " + err.message);
            } finally {
                labelBtn.innerHTML = originalText;
                input.value = "";
            }
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, {raw: true}); 
                processarDados(jsonData);
            };
            reader.readAsArrayBuffer(file);
        } else {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => processarDados(results.data)
            });
        }
    },

    // --- UTILITÁRIOS ---
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
        const nomesUnicos = [...new Set(dados.map(item => item.assistente).filter(n => n))].sort();
        const select = document.getElementById('admin-user-select');
        if(!select) return;

        const atual = select.value;
        select.innerHTML = '<option value="todos">Toda a Equipe</option>';
        nomesUnicos.forEach(nome => {
            const opt = document.createElement('option');
            opt.value = nome; // Usa o nome como valor
            opt.innerText = nome;
            select.appendChild(opt);
        });
        
        // Se a seleção anterior ainda existe (ou era 'todos'), mantém. Senão reseta.
        if (atual === 'todos' || nomesUnicos.includes(atual)) {
            select.value = atual;
        }
    }
};