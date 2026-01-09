MinhaArea.Evolucao = {
    dadosCache: [],
    assistentesNoPeriodo: [], // Armazena nomes de quem tem dados

    carregar: async function() {
        this.renderizarLayout();
        const headerSelect = document.getElementById('filtro-periodo-okr-header');
        const periodo = headerSelect ? headerSelect.value : 'mes';
        await this.carregarDados(periodo);
    },

    renderizarLayout: function() {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col gap-6">
                
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-28">
                        <div class="flex justify-between items-start">
                            <span class="text-xs font-bold text-slate-400 uppercase">Total Auditado</span>
                            <i class="fas fa-file-alt text-blue-100 bg-blue-500 p-1.5 rounded-md"></i>
                        </div>
                        <h3 id="kpi-okr-total" class="text-3xl font-black text-slate-800">--</h3>
                        <p class="text-xs text-slate-400">Campos verificados</p>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-28">
                        <div class="flex justify-between items-start">
                            <span class="text-xs font-bold text-slate-400 uppercase">Assertividade Média</span>
                            <i class="fas fa-percentage text-emerald-100 bg-emerald-500 p-1.5 rounded-md"></i>
                        </div>
                        <h3 id="kpi-okr-assert" class="text-3xl font-black text-slate-800">--%</h3>
                        <div class="w-full bg-slate-100 h-1.5 rounded-full mt-1"><div id="bar-kpi-assert" class="h-full bg-emerald-500 rounded-full" style="width:0%"></div></div>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-28">
                        <div class="flex justify-between items-start">
                            <span class="text-xs font-bold text-slate-400 uppercase">Total de Erros</span>
                            <i class="fas fa-times-circle text-rose-100 bg-rose-500 p-1.5 rounded-md"></i>
                        </div>
                        <h3 id="kpi-okr-erros" class="text-3xl font-black text-rose-600">--</h3>
                        <p class="text-xs text-slate-400">Apontamentos NOK</p>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-28">
                        <div class="flex justify-between items-start">
                            <span class="text-xs font-bold text-slate-400 uppercase">Ações</span>
                            <i class="fas fa-file-import text-indigo-100 bg-indigo-500 p-1.5 rounded-md"></i>
                        </div>
                        <div class="flex flex-col gap-2 mt-2">
                            <label for="input-csv-auditoria" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2 px-3 rounded-lg cursor-pointer text-center transition flex items-center justify-center gap-2">
                                <i class="fas fa-cloud-upload-alt"></i> Importar Planilha
                            </label>
                            <input type="file" id="input-csv-auditoria" accept=".csv, .xlsx, .xls" class="hidden" onchange="MinhaArea.Evolucao.importarArquivo(this)">
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div class="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <h3 class="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <i class="fas fa-list text-slate-400"></i> Detalhamento dos Apontamentos
                        </h3>
                        
                        <div class="flex items-center gap-3 w-full md:w-auto">
                            <div class="relative w-full md:w-64">
                                <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                                <input type="text" onkeyup="MinhaArea.Evolucao.filtrarBusca(this.value)" placeholder="Buscar por Nome, Empresa, Obs..." class="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-400 transition">
                            </div>
                            <span id="okr-total-regs" class="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 whitespace-nowrap">0 regs</span>
                        </div>
                    </div>
                    
                    <div class="overflow-x-auto max-h-[500px] custom-scroll">
                        <table class="w-full text-xs text-left text-slate-600 whitespace-nowrap">
                            <thead class="text-xs text-slate-500 font-bold uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="px-4 py-3 border-r border-slate-100">Data</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Assistente</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Empresa</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Documento</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100">Status</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100">Campos</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-emerald-600">Ok</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-rose-600">Nok</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-blue-600">% Assert.</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Auditora</th>
                                    <th class="px-4 py-3">Observações</th>
                                </tr>
                            </thead>
                            <tbody id="tabela-okr-body" class="divide-y divide-slate-100">
                                <tr><td colspan="11" class="text-center py-12"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    mudarPeriodo: function(tipo) {
        this.carregarDados(tipo);
    },

    carregarDados: async function(tipoPeriodo) {
        const tbody = document.getElementById('tabela-okr-body');
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-blue-500"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados...</td></tr>';

        try {
            const ref = MinhaArea.dataAtual || new Date();
            let inicioStr = '', fimStr = '';
            const y = ref.getFullYear(), m = ref.getMonth();

            switch(tipoPeriodo) {
                case 'dia': inicioStr = ref.toISOString().split('T')[0]; fimStr = inicioStr; break;
                case 'semana': 
                    const d = ref.getDay(), diff = ref.getDate() - d + (d===0?-6:1);
                    const seg = new Date(new Date(ref).setDate(diff));
                    const sex = new Date(new Date(seg).setDate(seg.getDate()+6));
                    inicioStr = seg.toISOString().split('T')[0]; fimStr = sex.toISOString().split('T')[0]; break;
                case 'mes': inicioStr = new Date(y,m,1).toISOString().split('T')[0]; fimStr = new Date(y,m+1,0).toISOString().split('T')[0]; break;
                case 'trimestre': inicioStr = new Date(y, Math.floor(m/3)*3, 1).toISOString().split('T')[0]; fimStr = new Date(y, (Math.floor(m/3)*3)+3, 0).toISOString().split('T')[0]; break;
                case 'semestre': inicioStr = new Date(y, m<6?0:6, 1).toISOString().split('T')[0]; fimStr = new Date(y, m<6?6:12, 0).toISOString().split('T')[0]; break;
                case 'anual': inicioStr = new Date(y,0,1).toISOString().split('T')[0]; fimStr = new Date(y,11,31).toISOString().split('T')[0]; break;
                case 'todos': inicioStr = '2020-01-01'; fimStr = new Date().toISOString().split('T')[0]; break;
                default: inicioStr = new Date(y,m,1).toISOString().split('T')[0]; fimStr = new Date(y,m+1,0).toISOString().split('T')[0];
            }

            const { data, error } = await MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicioStr)
                .lte('data_referencia', fimStr)
                .order('data_referencia', { ascending: false });

            if(error) throw error;

            this.dadosCache = data || [];
            
            // ATUALIZA SELETOR DE ASSISTENTES DO CABEÇALHO
            this.atualizarOpcoesSeletor(this.dadosCache);

            // APLICA FILTROS E RENDERIZA
            this.aplicarFiltroAssistente();

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-rose-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarOpcoesSeletor: function(dados) {
        // Extrai nomes únicos dos dados importados
        const nomesUnicos = [...new Set(dados.map(item => item.assistente).filter(n => n))].sort();
        
        const select = document.getElementById('admin-user-select');
        if(!select) return;

        // Guarda seleção atual
        const atual = MinhaArea.usuarioAlvo;

        // Limpa e recria (apenas com quem tem dados + opção 'todos')
        select.innerHTML = '<option value="todos">Toda a Equipe</option>';
        
        // Mapeia IDs para Nomes (se possível) para manter consistência, 
        // mas aqui vamos usar o valor do option como o NOME para facilitar o filtro local
        // Nota: O sistema global usa ID. Se quisermos filtrar por ID, precisamos cruzar com tabela usuarios.
        // SOLUÇÃO HÍBRIDA: Vamos listar os nomes encontrados no CSV como opções de valor TEXTO.
        // O main.js espera ID, mas se passarmos texto, ele salva. O filtro local usará esse texto.
        
        nomesUnicos.forEach(nome => {
            const opt = document.createElement('option');
            opt.value = nome; // Valor é o Nome (ex: "Maria Silva")
            opt.innerText = nome;
            select.appendChild(opt);
        });

        // Tenta restaurar seleção
        select.value = atual;
        if(select.value !== atual) select.value = 'todos'; // Fallback se o selecionado não estiver na lista
    },

    aplicarFiltroAssistente: function() {
        const alvo = document.getElementById('admin-user-select')?.value || 'todos';
        let filtrados = this.dadosCache;

        if (alvo !== 'todos') {
            // Filtra pelo nome exato (ou ID se fosse o caso, mas aqui usamos nome vindo do CSV)
            filtrados = this.dadosCache.filter(d => d.assistente === alvo);
        }

        this.calcularKPIs(filtrados);
        this.renderizarTabela(filtrados);
    },

    filtrarBusca: function(termo) {
        const alvo = document.getElementById('admin-user-select')?.value || 'todos';
        let base = (alvo !== 'todos') ? this.dadosCache.filter(d => d.assistente === alvo) : this.dadosCache;

        if(!termo) {
            this.renderizarTabela(base);
            return;
        }
        const lower = termo.toLowerCase();
        const final = base.filter(d => Object.values(d).some(v => String(v).toLowerCase().includes(lower)));
        this.renderizarTabela(final);
    },

    calcularKPIs: function(dados) {
        const totalCampos = dados.reduce((acc, cur) => acc + (parseInt(cur.num_campos)||0), 0);
        const totalOk = dados.reduce((acc, cur) => acc + (parseInt(cur.acertos)||0), 0);
        const totalNok = totalCampos - totalOk;
        
        let assertividade = 0;
        if(totalCampos > 0) assertividade = (totalOk / totalCampos) * 100;

        document.getElementById('kpi-okr-total').innerText = totalCampos.toLocaleString('pt-BR');
        document.getElementById('kpi-okr-erros').innerText = totalNok.toLocaleString('pt-BR');
        document.getElementById('kpi-okr-assert').innerText = assertividade.toFixed(2).replace('.', ',') + '%';
        
        const bar = document.getElementById('bar-kpi-assert');
        if(bar) bar.style.width = `${Math.min(assertividade, 100)}%`;
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('tabela-okr-body');
        const contador = document.getElementById('okr-total-regs');
        if (contador) contador.innerText = `${lista.length} regs`;

        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 bg-slate-50 italic">Nenhum registro encontrado.</td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const campos = parseInt(item.num_campos)||0;
            const ok = parseInt(item.acertos)||0;
            const nok = campos - ok;
            let assert = 0;
            if(campos > 0) assert = (ok / campos) * 100;
            const assertStr = assert.toFixed(2).replace('.', ',') + '%';
            
            const pctClass = assert >= 100 ? 'text-emerald-600 font-bold bg-emerald-50 px-1 rounded' : 'text-rose-600 font-bold bg-rose-50 px-1 rounded';
            
            // Status Badge
            let stBadge = `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 font-bold text-[10px]">${item.status||'-'}</span>`;
            const st = (item.status||'').toUpperCase();
            if(st==='OK'||st==='ACERTO') stBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold text-[10px]"><i class="fas fa-check mr-1"></i>OK</span>`;
            if(st.includes('ERRO')||st==='REV') stBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded border border-rose-200 font-bold text-[10px]"><i class="fas fa-times mr-1"></i>${st}</span>`;

            html += `
                <tr class="bg-white hover:bg-blue-50/40 transition border-b border-slate-50 last:border-0">
                    <td class="px-4 py-3 font-bold text-slate-700">${item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-'}</td>
                    <td class="px-4 py-3 font-bold text-blue-600">${item.assistente || '-'}</td>
                    <td class="px-4 py-3 text-slate-500">${item.empresa || '-'}</td>
                    <td class="px-4 py-3 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                    <td class="px-4 py-3 text-center">${stBadge}</td>
                    <td class="px-4 py-3 text-center text-slate-400 font-mono">${campos}</td>
                    <td class="px-4 py-3 text-center font-bold text-slate-700 font-mono">${ok}</td>
                    <td class="px-4 py-3 text-center font-bold text-rose-500 font-mono bg-rose-50/30">${nok}</td>
                    <td class="px-4 py-3 text-center ${pctClass}">${assertStr}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 bg-slate-50/50">${item.auditora || '-'}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[200px] truncate" title="${item.apontamentos_obs}">${item.apontamentos_obs || '-'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    importarArquivo: function(input) {
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
                    alert(`Erro: Colunas 'Data/end_time' e 'Assistente' não encontradas.`);
                    return;
                }

                const batch = [];
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
    }
};