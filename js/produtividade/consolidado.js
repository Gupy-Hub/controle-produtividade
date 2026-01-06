Produtividade.Consolidado = {
    init: function() {
        this.carregar();
    },

    togglePeriodo: function() {
        const tipo = document.getElementById('cons-period-type').value;
        const qSelect = document.getElementById('cons-select-quarter');
        const sSelect = document.getElementById('cons-select-semester');
        
        qSelect.classList.add('hidden');
        sSelect.classList.add('hidden');
        
        if (tipo.includes('trimestre')) qSelect.classList.remove('hidden');
        if (tipo.includes('semestre')) sSelect.classList.remove('hidden');
        
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Carregando...</td></tr>';
        
        try {
            // Em produção real, filtrar por data baseada nos selects
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .order('data_referencia', { ascending: true });
                
            if (error) throw error;

            // Agrupamento
            const mapUser = {};
            const mapDias = {};
            let totalGeral = 0;

            data.forEach(d => {
                // Mapa por usuário
                const uid = d.usuario_id;
                if (!mapUser[uid]) mapUser[uid] = { nome: d.usuarios.nome, total: 0, dias: 0 };
                mapUser[uid].total += d.quantidade;
                mapUser[uid].dias += (d.fator_multiplicador || 1);

                // Totais Gerais
                totalGeral += d.quantidade;
                
                // Mapa por dia (para achar o melhor dia)
                const dataRef = d.data_referencia;
                if(!mapDias[dataRef]) mapDias[dataRef] = 0;
                mapDias[dataRef] += d.quantidade;
            });

            // --- CÁLCULO DOS CARDS (KPIs) ---
            const diasUnicos = Object.keys(mapDias).length;
            const totalAssistentes = Object.keys(mapUser).length;
            const mediaGeral = totalAssistentes > 0 ? Math.round(totalGeral / totalAssistentes / (diasUnicos || 1)) : 0;
            
            // Melhor Dia
            let melhorDiaVal = 0;
            let melhorDiaData = '-';
            for (const [dia, val] of Object.entries(mapDias)) {
                if (val > melhorDiaVal) { melhorDiaVal = val; melhorDiaData = dia.split('-').reverse().join('/'); }
            }

            // Atualiza DOM dos Cards
            document.getElementById('cons-kpi-total').innerText = totalGeral.toLocaleString('pt-BR');
            document.getElementById('cons-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR');
            document.getElementById('cons-kpi-dias').innerText = diasUnicos;
            document.getElementById('cons-kpi-melhor').innerText = `${melhorDiaData} (${melhorDiaVal})`;

            // --- RENDERIZA TABELA ---
            thead.innerHTML = `<tr class="bg-slate-50 text-slate-500 text-xs uppercase">
                <th class="px-6 py-3">Assistente</th>
                <th class="px-6 py-3 text-center">Total Produzido</th>
                <th class="px-6 py-3 text-center">Dias Trab.</th>
                <th class="px-6 py-3 text-center">Média Diária</th>
            </tr>`;

            let bodyHtml = '';
            Object.values(mapUser).forEach(u => {
                const media = u.dias > 0 ? Math.round(u.total / u.dias) : 0;
                bodyHtml += `<tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-6 py-3 text-center text-blue-700 font-bold">${u.total}</td>
                    <td class="px-6 py-3 text-center">${u.dias.toFixed(1)}</td>
                    <td class="px-6 py-3 text-center">${media}</td>
                </tr>`;
            });
            tbody.innerHTML = bodyHtml || '<tr><td colspan="4" class="text-center py-4">Sem dados.</td></tr>';

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500">${e.message}</td></tr>`;
        }
    }
};