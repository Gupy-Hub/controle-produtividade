MinhaArea.Evolucao = {
    dados: [], // Cache para busca

    carregar: async function() {
        this.renderizarLayout();
        const headerSelect = document.getElementById('filtro-periodo-okr-header');
        const periodo = headerSelect ? headerSelect.value : 'mes';
        await this.carregarDados(periodo);
    },

    renderizarLayout: function() {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        // Atualizei o HTML do seletor para incluir a opção "Dia Específico" se você quiser reinjetar, 
        // mas como o seletor está no header global (minha_area.html), certifique-se de que ele tenha a option lá ou use o script abaixo para garantir.
        // Vou forçar a atualização das opções do select do header aqui para garantir que "Dia Específico" apareça.
        
        const selectHeader = document.getElementById('filtro-periodo-okr-header');
        if (selectHeader && !selectHeader.querySelector('option[value="dia"]')) {
            const optDia = document.createElement('option');
            optDia.value = 'dia';
            optDia.innerText = 'Dia Específico';
            selectHeader.insertBefore(optDia, selectHeader.firstChild); // Insere no topo
            selectHeader.value = 'mes'; // Default
        }

        container.innerHTML = `
            <div class="flex flex-col gap-4">
                <div class="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
                    <i class="fas fa-search text-slate-400 ml-2"></i>
                    <input type="text" 
                        placeholder="Buscar em todos os campos (Nome, Empresa, Documento, Obs...)" 
                        class="w-full text-sm text-slate-600 outline-none placeholder:text-slate-400"
                        onkeyup="MinhaArea.Evolucao.filtrar(this.value)">
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 class="font-bold text-slate-700 flex items-center gap-2">
                            <i class="fas fa-table text-slate-400"></i> Registros de Auditoria
                        </h3>
                        <span id="okr-total-regs" class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">0 registros</span>
                    </div>
                    
                    <div class="overflow-x-auto max-h-[600px] custom-scroll">
                        <table class="w-full text-xs text-left text-slate-600 whitespace-nowrap">
                            <thead class="text-xs text-slate-500 font-bold uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="px-4 py-3 border-r border-slate-100">Data</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Assistente</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Empresa</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Documento</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100">Status</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100">Campos</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-emerald-600">OK</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-rose-600">NOK</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-blue-600">% Assert.</th>
                                    <th class="px-4 py-3 border-r border-slate-100">Auditora</th>
                                    <th class="px-4 py-3">Apontamentos / Obs</th>
                                </tr>
                            </thead>
                            <tbody id="tabela-okr-body" class="divide-y divide-slate-100">
                                <tr><td colspan="11" class="text-center py-12"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    carregarDados: async function(tipoPeriodo) {
        const tbody = document.getElementById('tabela-okr-body');
        const contador = document.getElementById('okr-total-regs');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-blue-500"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando tabela...</td></tr>';

        try {
            const referencia = MinhaArea.dataAtual || new Date();
            let inicioStr = '', fimStr = '';
            const y = referencia.getFullYear();
            const m = referencia.getMonth();

            // Lógica de Datas
            switch(tipoPeriodo) {
                case 'dia':
                    // Data específica selecionada
                    inicioStr = referencia.toISOString().split('T')[0];
                    fimStr = inicioStr;
                    break;
                case 'semana':
                    const day = referencia.getDay(); 
                    const diff = referencia.getDate() - day + (day === 0 ? -6 : 1); 
                    const seg = new Date(new Date(referencia).setDate(diff));
                    const sex = new Date(new Date(seg).setDate(seg.getDate() + 6));
                    inicioStr = seg.toISOString().split('T')[0];
                    fimStr = sex.toISOString().split('T')[0];
                    break;
                case 'mes':
                    inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
                    fimStr = new Date(y, m + 1, 0).toISOString().split('T')[0];
                    break;
                case 'trimestre':
                    const q = Math.floor(m / 3);
                    inicioStr = new Date(y, q * 3, 1).toISOString().split('T')[0];
                    fimStr = new Date(y, (q * 3) + 3, 0).toISOString().split('T')[0];
                    break;
                case 'semestre':
                    const s = m < 6 ? 0 : 6;
                    inicioStr = new Date(y, s, 1).toISOString().split('T')[0];
                    fimStr = new Date(y, s + 6, 0).toISOString().split('T')[0];
                    break;
                case 'anual':
                    inicioStr = new Date(y, 0, 1).toISOString().split('T')[0];
                    fimStr = new Date(y, 11, 31).toISOString().split('T')[0];
                    break;
                case 'todos':
                    inicioStr = '2020-01-01'; 
                    fimStr = new Date().toISOString().split('T')[0];
                    break;
                default:
                    inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
                    fimStr = new Date(y, m + 1, 0).toISOString().split('T')[0];
            }

            // Construção da Query
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicioStr)
                .lte('data_referencia', fimStr)
                .order('data_referencia', { ascending: false });

            // FILTRO POR ASSISTENTE
            const alvo = MinhaArea.usuarioAlvo;
            
            // Se NÃO for 'todos' e tiver um ID válido, precisamos filtrar pelo NOME
            if (alvo && alvo !== 'todos') {
                // Primeiro buscamos o nome do usuário na tabela de usuarios
                const { data: userData, error: userError } = await MinhaArea.supabase
                    .from('usuarios')
                    .select('nome')
                    .eq('id', alvo)
                    .single();
                
                if (!userError && userData) {
                    // A tabela de auditoria usa o nome texto (ex: "Maria Silva"), então filtramos por texto
                    // Usamos ilike para ignorar maiúsculas/minúsculas
                    query = query.ilike('assistente', `%${userData.nome}%`);
                }
            }

            const { data, error } = await query;

            if (error) throw error;

            this.dados = data || [];
            this.renderizarTabela(this.dados);

        } catch (e) {
            console.error("Erro carrega auditoria:", e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-rose-500 font-bold">Erro: ${e.message}</td></tr>`;
        }
    },

    filtrar: function(termo) {
        if (!termo) {
            this.renderizarTabela(this.dados);
            return;
        }
        const termoLower = termo.toLowerCase();
        const filtrados = this.dados.filter(item => Object.values(item).some(val => String(val).toLowerCase().includes(termoLower)));
        this.renderizarTabela(filtrados);
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('tabela-okr-body');
        const contador = document.getElementById('okr-total-regs');
        
        if (contador) contador.innerText = `${lista.length} registros`;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 bg-slate-50 italic">Nenhum registro encontrado para este filtro.</td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            let statusBadge = '';
            const st = (item.status || '').toUpperCase().trim();
            
            if(st === 'OK' || st === 'ACERTO') statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200"><i class="fas fa-check mr-1"></i>OK</span>';
            else if(st.includes('ERRO') || st === 'REV' || st === 'JUST') statusBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200"><i class="fas fa-times mr-1"></i>${st}</span>`;
            else statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">${st}</span>`;

            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            
            const campos = parseInt(item.num_campos) || 0;
            const ok = parseInt(item.acertos) || 0;
            const nok = campos - ok; 
            
            let assertividade = 0;
            if (campos > 0) assertividade = (ok / campos) * 100;
            
            // FORMATAÇÃO PEDIDA: 2 CASAS DECIMAIS (97,74%)
            const pctAssertStr = assertividade.toFixed(2).replace('.', ',') + '%';

            let pctClass = assertividade >= 100 ? 'text-emerald-600 font-bold bg-emerald-50 px-1 rounded' : 'text-rose-600 font-bold bg-rose-50 px-1 rounded';

            html += `
                <tr class="bg-white hover:bg-blue-50/30 transition border-b border-slate-50 last:border-0">
                    <td class="px-4 py-3 font-bold text-slate-700">${dataFmt}</td>
                    <td class="px-4 py-3 font-bold text-blue-600">${item.assistente || '-'}</td>
                    <td class="px-4 py-3 text-slate-500">${item.empresa || '-'}</td>
                    <td class="px-4 py-3 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                    <td class="px-4 py-3 text-center">${statusBadge}</td>
                    <td class="px-4 py-3 text-center text-slate-400 font-mono">${campos}</td>
                    <td class="px-4 py-3 text-center font-bold text-slate-700 font-mono">${ok}</td>
                    <td class="px-4 py-3 text-center font-bold text-rose-500 font-mono bg-rose-50/30">${nok}</td>
                    <td class="px-4 py-3 text-center ${pctClass}">${pctAssertStr}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 bg-slate-50/50">${item.auditora || '-'}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[200px] truncate" title="${item.apontamentos_obs}">
                        ${item.apontamentos_obs || '<span class="text-slate-300">-</span>'}
                    </td>
                </tr>`;
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
                    alert(`Erro: Colunas obrigatórias não encontradas.\nNecessário: 'end_time' (ou Data) e 'Assistente'.`);
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