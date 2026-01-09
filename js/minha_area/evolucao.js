MinhaArea.Evolucao = {
    // Gerencia a aba Meta / OKR
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
                                    <th class="px-4 py-3 text-center border-r border-slate-100">Acertos</th>
                                    <th class="px-4 py-3 text-center border-r border-slate-100 text-blue-600">% Assert.</th>
                                    <th class="px-4 py-3 border-r border-slate-100">% Erro/Prod</th>
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

    mudarPeriodo: function(tipo) {
        this.carregarDados(tipo);
    },

    carregarDados: async function(tipoPeriodo) {
        const tbody = document.getElementById('tabela-okr-body');
        const contador = document.getElementById('okr-total-regs');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-blue-500"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando tabela...</td></tr>';

        try {
            const hoje = new Date();
            let inicioStr = '';
            let fimStr = hoje.toISOString().split('T')[0];
            const y = hoje.getFullYear();
            const m = hoje.getMonth();

            switch(tipoPeriodo) {
                case 'semana':
                    const day = hoje.getDay(); 
                    const diff = hoje.getDate() - day + (day === 0 ? -6 : 1); 
                    const seg = new Date(hoje.setDate(diff));
                    inicioStr = seg.toISOString().split('T')[0];
                    break;
                case 'mes': inicioStr = new Date(y, m, 1).toISOString().split('T')[0]; break;
                case 'trimestre': inicioStr = new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split('T')[0]; break;
                case 'semestre': inicioStr = new Date(y, m < 6 ? 0 : 6, 1).toISOString().split('T')[0]; break;
                case 'anual': inicioStr = new Date(y, 0, 1).toISOString().split('T')[0]; break;
                case 'todos': inicioStr = '2020-01-01'; break;
                default: inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
            }

            const { data, error } = await MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicioStr)
                .lte('data_referencia', fimStr)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            if (contador) contador.innerText = `${data ? data.length : 0} registros`;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 bg-slate-50 italic">Nenhum registro encontrado neste período.</td></tr>';
                return;
            }

            let html = '';
            data.forEach(item => {
                let statusBadge = '';
                const st = (item.status || '').toUpperCase().trim();
                
                if(st === 'OK' || st === 'ACERTO') {
                    statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200"><i class="fas fa-check mr-1"></i>OK</span>';
                } else if(st.includes('ERRO') || st === 'REV' || st === 'JUST') {
                    statusBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200"><i class="fas fa-times mr-1"></i>${st}</span>`;
                } else {
                    statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">${st}</span>`;
                }

                const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
                
                let pctClass = 'text-slate-600';
                const pctVal = parseFloat(item.pct_assert);
                if (!isNaN(pctVal)) {
                    if (pctVal >= 100 || pctVal === 1) pctClass = 'text-emerald-600 font-bold bg-emerald-50 px-1 rounded';
                    else pctClass = 'text-rose-600 font-bold bg-rose-50 px-1 rounded';
                }

                html += `
                    <tr class="bg-white hover:bg-blue-50/30 transition border-b border-slate-50 last:border-0">
                        <td class="px-4 py-3 font-bold text-slate-700">${dataFmt}</td>
                        <td class="px-4 py-3 font-bold text-blue-600">${item.assistente || '-'}</td>
                        <td class="px-4 py-3 text-slate-500">${item.empresa || '-'}</td>
                        <td class="px-4 py-3 text-slate-500 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                        <td class="px-4 py-3 text-center">${statusBadge}</td>
                        <td class="px-4 py-3 text-center text-slate-400 font-mono">${item.num_campos ?? '-'}</td>
                        <td class="px-4 py-3 text-center font-bold text-slate-600 font-mono">${item.acertos ?? '-'}</td>
                        <td class="px-4 py-3 text-center ${pctClass}">${item.pct_assert || '-'}</td>
                        <td class="px-4 py-3 text-center text-xs text-slate-400">${item.pct_erros_produtividade || '-'}</td>
                        <td class="px-4 py-3 text-xs text-slate-500 bg-slate-50/50">${item.auditora || '-'}</td>
                        <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[200px] truncate" title="${item.apontamentos_obs}">
                            ${item.apontamentos_obs || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } catch (e) {
            console.error("Erro carrega auditoria:", e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-rose-500 font-bold">Erro: ${e.message}</td></tr>`;
        }
    },

    importarArquivo: function(input) {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        const labelBtn = input.parentElement.querySelector('label');
        const originalText = labelBtn.innerHTML;
        labelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                try {
                    const rows = results.data;
                    const headers = results.meta.fields; // Cabeçalhos reais encontrados no arquivo

                    console.log("Cabeçalhos encontrados:", headers);

                    if (!rows || rows.length === 0) throw new Error("Arquivo vazio.");

                    // --- FUNÇÃO PARA ENCONTRAR COLUNA INDEPENDENTE DE CASE/ESPAÇOS ---
                    const encontrarColuna = (opcoes) => {
                        // 1. Tenta match exato ou normalizado
                        for (const opt of opcoes) {
                            const found = headers.find(h => h.trim().toLowerCase() === opt.toLowerCase());
                            if (found) return found;
                        }
                        // 2. Tenta 'contém' (ex: acha 'Data de Nascimento' se buscar 'Data')
                        for (const opt of opcoes) {
                            const found = headers.find(h => h.trim().toLowerCase().includes(opt.toLowerCase()));
                            if (found) return found;
                        }
                        return null;
                    };

                    // Mapeia as colunas críticas
                    const colData = encontrarColuna(['Data', 'date', 'dt_referencia']);
                    const colAssistente = encontrarColuna(['Assistente', 'Nome', 'Funcionário']);

                    if (!colData || !colAssistente) {
                        alert(`Erro: Colunas obrigatórias não encontradas.\n\nColunas no arquivo: ${headers.join(', ')}\n\nEsperado: 'Data' e 'Assistente'.`);
                        return;
                    }

                    const batch = [];
                    
                    rows.forEach(row => {
                        const rawDate = row[colData];
                        const assistente = row[colAssistente];

                        if (!rawDate && !assistente) return;

                        // Tratamento de Data (Aceita DD/MM/YYYY ou YYYY-MM-DD)
                        let dataFinal = rawDate;
                        if (rawDate && rawDate.includes('/')) {
                            // Se for DD/MM/YYYY
                            const parts = rawDate.split('/');
                            if (parts.length === 3) dataFinal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        } else if (rawDate && rawDate.includes('T')) {
                            // Se for ISO completo 2025-10-20T...
                            dataFinal = rawDate.split('T')[0];
                        }

                        // Função auxiliar para pegar valor seguro
                        const getVal = (opts) => {
                            const key = encontrarColuna(opts);
                            return key ? row[key] : null;
                        };

                        batch.push({
                            mes: getVal(['mês', 'mes', 'month']),
                            end_time: getVal(['end_time', 'time']),
                            data_referencia: dataFinal,
                            empresa: getVal(['Empresa']),
                            assistente: assistente,
                            doc_name: getVal(['doc_name', 'Documento', 'Doc']),
                            status: getVal(['STATUS', 'Status']),
                            apontamentos_obs: getVal(['Apontamentos/obs', 'Apontamentos', 'Obs']),
                            num_campos: parseInt(getVal(['nº Campos', 'Campos', 'num_campos'])) || 0,
                            acertos: parseInt(getVal(['Acertos'])) || 0,
                            pct_erros_produtividade: getVal(['% de Erros X Produtividade', 'Erros']),
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
                        alert("Nenhum dado válido encontrado para importação.");
                    }

                } catch (err) {
                    console.error(err);
                    alert("Erro ao processar: " + err.message);
                } finally {
                    labelBtn.innerHTML = originalText;
                    input.value = "";
                }
            }
        });
    }
};