MinhaArea.Evolucao = {
    // Função principal chamada pelo main.js ao trocar de aba
    carregar: async function() {
        this.renderizarLayout();
        // Carrega dados iniciais (Padrão: Mês Atual)
        await this.carregarDados('mes');
    },

    renderizarLayout: function() {
        const container = document.getElementById('ma-tab-evolucao');
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col gap-6">
                <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <i class="fas fa-bullseye text-xl"></i>
                        </div>
                        <div>
                            <h2 class="text-lg font-bold text-slate-800">Meta / OKR</h2>
                            <p class="text-xs text-slate-500">Auditoria e Qualidade dos Apontamentos</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">Período:</label>
                        <select id="filtro-periodo-okr" class="bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-md focus:ring-blue-500 focus:border-blue-500 block p-1.5 outline-none cursor-pointer" onchange="MinhaArea.Evolucao.mudarPeriodo(this.value)">
                            <option value="semana">Esta Semana</option>
                            <option value="mes" selected>Este Mês</option>
                            <option value="trimestre">Este Trimestre</option>
                            <option value="semestre">Este Semestre</option>
                            <option value="anual">Este Ano</option>
                            <option value="todos">Todo o Histórico</option>
                        </select>
                    </div>
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
            // Definição das datas baseadas no seletor
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
                case 'mes':
                    inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
                    break;
                case 'trimestre':
                    const q = Math.floor(m / 3);
                    inicioStr = new Date(y, q * 3, 1).toISOString().split('T')[0];
                    break;
                case 'semestre':
                    const s = m < 6 ? 0 : 6;
                    inicioStr = new Date(y, s, 1).toISOString().split('T')[0];
                    break;
                case 'anual':
                    inicioStr = new Date(y, 0, 1).toISOString().split('T')[0];
                    break;
                case 'todos':
                    inicioStr = '2020-01-01'; 
                    break;
                default:
                    inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
            }

            // Consulta ao Supabase
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .gte('data_referencia', inicioStr)
                .lte('data_referencia', fimStr)
                .order('data_referencia', { ascending: false });

            const { data, error } = await query;

            if (error) throw error;

            if (contador) contador.innerText = `${data ? data.length : 0} registros`;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 bg-slate-50 italic">Nenhum registro encontrado neste período.</td></tr>';
                return;
            }

            let html = '';
            data.forEach(item => {
                // Formatação de Status
                let statusBadge = '';
                const st = (item.status || '').toUpperCase().trim();
                
                if(st === 'OK' || st === 'ACERTO') {
                    statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 shadow-sm"><i class="fas fa-check mr-1"></i>OK</span>';
                } else if(st.includes('ERRO') || st === 'REV' || st === 'JUST') {
                    statusBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200 shadow-sm"><i class="fas fa-times mr-1"></i>${st}</span>`;
                } else {
                    statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">${st}</span>`;
                }

                const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
                
                // Formatação % Assertividade
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
            console.error("Erro ao carregar auditoria:", e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-rose-500 font-bold bg-rose-50 border border-rose-100 rounded-lg m-4">Erro ao carregar dados: ${e.message}</td></tr>`;
        }
    }
};