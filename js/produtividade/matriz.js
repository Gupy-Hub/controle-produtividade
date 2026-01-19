// ARQUIVO: js/produtividade/matriz.js
window.Produtividade = window.Produtividade || {};

Produtividade.Matriz = {
    initialized: false,
    dadosAnuais: {},

    init: function() {
        console.log("🗓️ Matriz: Engine V3 (Correção de Queries & Totais)");
        this.initialized = true;
        this.carregar();
    },

    carregar: async function() {
        // Verifica se a aba matriz está visível
        if(document.getElementById('tab-matriz').classList.contains('hidden')) return;

        const tbody = document.getElementById('matriz-body');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="20" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Consolidando dados anuais...</td></tr>';

        const ano = document.getElementById('sel-ano').value;

        try {
            // CORREÇÃO: Removida a coluna 'perfil' que causava erro 400
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    quantidade,
                    data_referencia,
                    usuario_id,
                    usuarios (
                        id,
                        nome,
                        funcao,
                        ativo
                    )
                `)
                .gte('data_referencia', `${ano}-01-01`)
                .lte('data_referencia', `${ano}-12-31`);

            if (error) throw error;

            this.processarEExibir(data);

        } catch (error) {
            console.error("Erro Crítico na Matriz:", error);
            tbody.innerHTML = `<tr><td colspan="20" class="text-center py-8 text-rose-500 font-bold">Erro ao carregar matriz: ${error.message}</td></tr>`;
        }
    },

    processarEExibir: function(data) {
        const tbody = document.getElementById('matriz-body');
        const mostrarGestao = document.getElementById('check-gestao')?.checked;
        
        // 1. Agrupar por Usuário
        const matriz = {};

        data.forEach(p => {
            const u = p.usuarios;
            if (!u) return;

            // Filtro de Gestão
            const funcao = (u.funcao || '').toUpperCase();
            if (!mostrarGestao && (funcao === 'GESTORA' || funcao === 'AUDITORA')) return;

            if (!matriz[u.id]) {
                matriz[u.id] = {
                    nome: u.nome,
                    meses: Array(12).fill(0),
                    totalAnual: 0
                };
            }

            const mes = new Date(p.data_referencia + 'T12:00:00').getMonth();
            const qtd = Number(p.quantidade) || 0;

            matriz[u.id].meses[mes] += qtd;
            matriz[u.id].totalAnual += qtd;
        });

        // 2. Ordenar por Nome
        const listaOrdenada = Object.values(matriz).sort((a, b) => a.nome.localeCompare(b.nome));

        if (listaOrdenada.length === 0) {
            tbody.innerHTML = '<tr><td colspan="20" class="text-center py-12 text-slate-400 italic">Nenhum dado de produção encontrado para este ano.</td></tr>';
            return;
        }

        // 3. Renderizar Linhas
        let html = '';
        listaOrdenada.forEach(u => {
            // Cálculos de Agrupamento
            const t1 = u.meses[0] + u.meses[1] + u.meses[2]; // Jan, Fev, Mar
            const t2 = u.meses[3] + u.meses[4] + u.meses[5]; // Abr, Mai, Jun
            const t3 = u.meses[6] + u.meses[7] + u.meses[8]; // Jul, Ago, Set
            const t4 = u.meses[9] + u.meses[10] + u.meses[11]; // Out, Nov, Dez
            
            const s1 = t1 + t2;
            const s2 = t3 + t4;

            html += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 group text-[11px]">
                    <td class="px-4 py-3 font-bold text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:text-blue-600 transition truncate max-w-[200px]" title="${u.nome}">
                        ${u.nome}
                    </td>
                    ${u.meses.map((val, idx) => {
                        // Renderiza os meses e insere as colunas de Trimestre/Semestre nos lugares certos
                        let cells = `<td class="px-2 py-3 text-center ${val > 0 ? 'text-slate-600 font-medium' : 'text-slate-300'}">${val > 0 ? val.toLocaleString('pt-BR') : '-'}</td>`;
                        
                        // Após Março (idx 2) -> T1
                        if (idx === 2) cells += `<td class="px-2 py-3 text-center bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t1 > 0 ? t1.toLocaleString('pt-BR') : '-'}</td>`;
                        
                        // Após Junho (idx 5) -> T2 e S1
                        if (idx === 5) {
                            cells += `<td class="px-2 py-3 text-center bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t2 > 0 ? t2.toLocaleString('pt-BR') : '-'}</td>`;
                            cells += `<td class="px-2 py-3 text-center bg-indigo-50 text-indigo-700 font-black border-r border-indigo-100">${s1 > 0 ? s1.toLocaleString('pt-BR') : '-'}</td>`;
                        }

                        // Após Setembro (idx 8) -> T3
                        if (idx === 8) cells += `<td class="px-2 py-3 text-center bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t3 > 0 ? t3.toLocaleString('pt-BR') : '-'}</td>`;
                        
                        // Após Dezembro (idx 11) -> T4, S2 e Total
                        if (idx === 11) {
                            cells += `<td class="px-2 py-3 text-center bg-blue-50 text-blue-700 font-bold border-x border-blue-100">${t4 > 0 ? t4.toLocaleString('pt-BR') : '-'}</td>`;
                            cells += `<td class="px-2 py-3 text-center bg-indigo-50 text-indigo-700 font-black border-r border-indigo-100">${s2 > 0 ? s2.toLocaleString('pt-BR') : '-'}</td>`;
                            cells += `<td class="px-4 py-3 text-center bg-slate-100 text-slate-900 font-black text-xs">${u.totalAnual.toLocaleString('pt-BR')}</td>`;
                        }
                        
                        return cells;
                    }).join('')}
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }
};