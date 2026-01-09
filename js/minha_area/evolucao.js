MinhaArea.Evolucao = { 
    // Mantemos o nome interno 'Evolucao' para compatibilidade com o main.js, 
    // mas visualmente será "Meta / OKR"

    init: async function() {
        this.renderizarLayout();
        // Carrega dados iniciais (padrão Mês atual)
        await this.carregarDados('mes'); 
    },

    renderizarLayout: function() {
        const container = document.getElementById('conteudo-evolucao'); // Certifique-se que este ID existe no HTML da aba
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col gap-4">
                <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-bullseye text-blue-600 text-xl"></i>
                        <h2 class="text-lg font-bold text-slate-700">Meta / OKR - Auditoria</h2>
                    </div>

                    <div class="flex items-center gap-2">
                        <label class="text-sm font-bold text-slate-600">Período:</label>
                        <select id="filtro-periodo-okr" class="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2" onchange="MinhaArea.Evolucao.mudarPeriodo(this.value)">
                            <option value="semana">Esta Semana</option>
                            <option value="mes" selected>Este Mês</option>
                            <option value="trimestre">Este Trimestre</option>
                            <option value="semestre">Este Semestre</option>
                            <option value="anual">Este Ano</option>
                            <option value="todos">Todo o Histórico</option>
                        </select>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th class="px-4 py-3 whitespace-nowrap">Data</th>
                                    <th class="px-4 py-3 whitespace-nowrap">Assistente</th>
                                    <th class="px-4 py-3 whitespace-nowrap">Empresa</th>
                                    <th class="px-4 py-3 whitespace-nowrap">Documento</th>
                                    <th class="px-4 py-3 whitespace-nowrap text-center">Status</th>
                                    <th class="px-4 py-3 whitespace-nowrap text-center">Campos</th>
                                    <th class="px-4 py-3 whitespace-nowrap text-center">Acertos</th>
                                    <th class="px-4 py-3 whitespace-nowrap text-center">% Assert.</th>
                                    <th class="px-4 py-3 whitespace-nowrap">Auditora</th>
                                    <th class="px-4 py-3 min-w-[200px]">Apontamentos/Obs</th>
                                </tr>
                            </thead>
                            <tbody id="tabela-okr-body" class="divide-y divide-slate-100">
                                <tr><td colspan="10" class="text-center py-8"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="okr-footer" class="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 text-right">
                        Mostrando registros da auditoria.
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

        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-blue-500"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando tabela...</td></tr>';

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
                    const diff = hoje.getDate() - day + (day === 0 ? -6 : 1); // Ajuste para segunda-feira
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
                    inicioStr = '2020-01-01'; // Data muito antiga
                    break;
                default:
                    inicioStr = new Date(y, m, 1).toISOString().split('T')[0];
            }

            // Consulta ao Supabase (Tabela auditoria_apontamentos)
            let query = MinhaArea.supabase
                .from('auditoria_apontamentos')
                .select('*')
                .order('data_referencia', { ascending: false });

            // Se for Gestora/Admin vê tudo, se for Assistente vê só o seu (Opcional, removi filtro por enquanto para ver a planilha toda conforme pedido)
            // if (MinhaArea.user.cargo !== 'GESTORA' && ...) { ... }

            // Aplica filtro de data
            query = query.gte('data_referencia', inicioStr).lte('data_referencia', fimStr);

            const { data, error } = await query;

            if (error) throw error;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-slate-400">Nenhum registro de auditoria encontrado neste período.</td></tr>';
                return;
            }

            // Renderiza a tabela com TODAS as colunas solicitadas
            let html = '';
            data.forEach(item => {
                // Formatação de Status e Cores
                let statusBadge = '';
                const st = (item.status || '').toUpperCase();
                if(st === 'OK' || st === 'ACERTO') statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200">OK</span>';
                else if(st.includes('ERRO') || st === 'REV') statusBadge = '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200">ERRO</span>';
                else statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">${st}</span>`;

                // Data formatada
                const dataFormatada = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';

                html += `
                    <tr class="bg-white border-b hover:bg-slate-50 transition">
                        <td class="px-4 py-3 font-medium text-slate-900">${dataFormatada}</td>
                        <td class="px-4 py-3 font-bold text-blue-600">${item.assistente || '-'}</td>
                        <td class="px-4 py-3">${item.empresa || '-'}</td>
                        <td class="px-4 py-3 truncate max-w-[150px]" title="${item.doc_name}">${item.doc_name || '-'}</td>
                        <td class="px-4 py-3 text-center">${statusBadge}</td>
                        <td class="px-4 py-3 text-center text-slate-500">${item.num_campos || 0}</td>
                        <td class="px-4 py-3 text-center font-bold text-slate-700">${item.acertos || 0}</td>
                        <td class="px-4 py-3 text-center font-bold ${parseFloat(item.pct_assert) >= 100 ? 'text-emerald-600' : 'text-rose-600'}">
                            ${item.pct_assert || '-'}
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-500">${item.auditora || '-'}</td>
                        <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[250px] break-words">
                            ${item.apontamentos_obs || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            
            // Atualiza rodapé com total
            document.getElementById('okr-footer').innerText = `Total de registros carregados: ${data.length}`;

        } catch (e) {
            console.error("Erro ao carregar auditoria:", e);
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-rose-500">Erro ao carregar dados: ${e.message}</td></tr>`;
        }
    }
};