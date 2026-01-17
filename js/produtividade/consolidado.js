window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Iniciado (Modo Tabela Ranking).");
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        const footerTotal = document.getElementById('total-consolidado-footer');
        
        // 1. Injeta o Cabeçalho da Tabela dinamicamente para garantir as colunas corretas
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th class="px-4 py-3 w-[5%] text-center">Rank</th>
                    <th class="px-4 py-3 w-[35%]">Assistente</th>
                    <th class="px-4 py-3 w-[15%] text-center">Dias Úteis</th>
                    <th class="px-4 py-3 w-[15%] text-center">Produção Total</th>
                    <th class="px-4 py-3 w-[15%] text-center">Média/Dia</th>
                    <th class="px-4 py-3 w-[15%] text-center">% Meta</th>
                </tr>
            `;
        }

        // 2. Obtém as datas do filtro global
        if (!Produtividade.Filtros || typeof Produtividade.Filtros.getDatas !== 'function') {
            console.error("Erro: Módulo de Filtros não carregado.");
            return;
        }
        const { inicio, fim } = Produtividade.Filtros.getDatas();
        
        // State de Carregamento
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-xs text-slate-400 mt-2">Consolidando métricas...</p></td></tr>';

        try {
            // Busca dados analíticos (diários) reutilizando a RPC existente
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: inicio, 
                    data_fim: fim 
                });

            if (error) throw error;

            this.processarERenderizar(data || [], tbody, footerTotal);

        } catch (error) {
            console.error("Erro Consolidado:", error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-rose-500 font-bold">Erro ao carregar dados: ${error.message}</td></tr>`;
        }
    },

    processarERenderizar: function(dadosRaw, tbody, footerTotal) {
        if (!tbody) return;

        // 1. Agregação: Transforma linhas diárias em um resumo único por usuário
        const mapa = {};

        dadosRaw.forEach(row => {
            const uid = row.usuario_id;
            // Ignora perfis de gestão/auditoria para focar no operacional
            const funcao = (row.funcao || '').toUpperCase();
            if (['AUDITORA', 'GESTORA', 'ADMIN'].includes(funcao)) return;

            if (!mapa[uid]) {
                mapa[uid] = {
                    id: uid,
                    nome: row.nome,
                    totalProducao: 0,
                    totalMeta: 0,
                    diasTrabalhados: 0
                };
            }

            // Garante conversão numérica segura
            const qtd = Number(row.total_qty || 0);
            const dias = Number(row.total_dias_uteis || 0); 
            const metaDia = Number(row.meta_producao || 0);

            mapa[uid].totalProducao += qtd;
            mapa[uid].diasTrabalhados += dias;
            // A meta total é a soma da meta de cada dia trabalhado
            mapa[uid].totalMeta += (metaDia * dias); 
        });

        // 2. Converte Objeto para Array e Ordena (Maior produção primeiro)
        const lista = Object.values(mapa).sort((a, b) => b.totalProducao - a.totalProducao);

        // Atualiza contador no footer
        if (footerTotal) footerTotal.innerText = lista.length;
        
        // Limpa tabela
        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-slate-400 italic">Nenhum dado encontrado para o período selecionado.</td></tr>';
            return;
        }

        // 3. Renderiza linhas
        let html = '';
        lista.forEach((u, index) => {
            // Cálculos de KPI
            const media = u.diasTrabalhados > 0 ? Math.round(u.totalProducao / u.diasTrabalhados) : 0;
            const atingimento = u.totalMeta > 0 ? (u.totalProducao / u.totalMeta) * 100 : 0;
            
            // Estilização do Rank (Top 3)
            let rankBadge = `<div class="w-8 h-8 flex items-center justify-center rounded-full mx-auto border bg-slate-100 text-slate-500 border-slate-200"><span class="font-mono text-xs font-bold">#${index+1}</span></div>`;
            
            if (index === 0) rankBadge = `<div class="w-8 h-8 flex items-center justify-center rounded-full mx-auto border bg-yellow-50 text-yellow-600 border-yellow-200 shadow-sm"><i class="fas fa-crown"></i></div>`;
            if (index === 1) rankBadge = `<div class="w-8 h-8 flex items-center justify-center rounded-full mx-auto border bg-slate-50 text-slate-600 border-slate-300"><i class="fas fa-medal"></i></div>`;
            if (index === 2) rankBadge = `<div class="w-8 h-8 flex items-center justify-center rounded-full mx-auto border bg-orange-50 text-orange-600 border-orange-200"><i class="fas fa-medal"></i></div>`;

            // Cor condicional da Meta
            let badgeMeta = 'text-rose-600 bg-rose-50 border-rose-100'; // Ruim
            if (atingimento >= 100) badgeMeta = 'text-emerald-600 bg-emerald-50 border-emerald-100'; // Meta Batida
            else if (atingimento >= 90) badgeMeta = 'text-blue-600 bg-blue-50 border-blue-100'; // Próximo

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm group">
                <td class="px-4 py-3 text-center align-middle">
                    ${rankBadge}
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="font-bold text-slate-700">${u.nome}</div>
                    <div class="text-[10px] text-slate-400 font-normal uppercase">Operacional</div>
                </td>
                <td class="px-4 py-3 text-center align-middle text-slate-500 font-mono">
                    ${u.diasTrabalhados.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </td>
                <td class="px-4 py-3 text-center align-middle">
                     <span class="font-black text-blue-700 bg-blue-50/50 px-3 py-1 rounded border border-blue-100">
                        ${u.totalProducao.toLocaleString('pt-BR')}
                     </span>
                </td>
                <td class="px-4 py-3 text-center align-middle text-slate-600 font-bold">
                    ${media.toLocaleString('pt-BR')}
                </td>
                <td class="px-4 py-3 text-center align-middle">
                    <span class="${badgeMeta} px-2 py-1 rounded text-xs font-bold border">
                        ${atingimento.toFixed(1)}%
                    </span>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};