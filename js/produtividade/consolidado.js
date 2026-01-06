Produtividade.Consolidado = {
    init: function() {
        this.carregar();
    },

    togglePeriodo: function() {
        // Mostra/esconde selects de trimestre/semestre
        const tipo = document.getElementById('cons-period-type').value;
        document.getElementById('cons-select-quarter').classList.add('hidden');
        document.getElementById('cons-select-semester').classList.add('hidden');
        
        if (tipo === 'trimestre' || tipo === 'ano_trim') document.getElementById('cons-select-quarter').classList.remove('hidden');
        if (tipo === 'semestre') document.getElementById('cons-select-semester').classList.remove('hidden');
        
        this.carregar();
    },

    carregar: async function() {
        const thead = document.getElementById('cons-table-header');
        const tbody = document.getElementById('cons-table-body');
        tbody.innerHTML = '<tr><td class="text-center py-4">Carregando dados consolidados...</td></tr>';
        
        // Exemplo simplificado: Carrega tudo e agrupa no front (ideal seria RPC no supabase para grandes volumes)
        try {
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .order('data_referencia', { ascending: true });
                
            if (error) throw error;

            // Agrupamento simples por Usuário
            const mapUser = {};
            data.forEach(d => {
                const uid = d.usuario_id;
                if (!mapUser[uid]) mapUser[uid] = { nome: d.usuarios.nome, total: 0, dias: 0 };
                mapUser[uid].total += d.quantidade;
                mapUser[uid].dias += (d.fator_multiplicador || 1);
            });

            // Render Tabela
            let headerHtml = `<tr class="bg-slate-50 text-slate-500 text-xs uppercase">
                <th class="px-6 py-3">Assistente</th>
                <th class="px-6 py-3 text-center">Total Produzido</th>
                <th class="px-6 py-3 text-center">Dias Trab.</th>
                <th class="px-6 py-3 text-center">Média Diária</th>
            </tr>`;
            thead.innerHTML = headerHtml;

            let bodyHtml = '';
            Object.values(mapUser).forEach(u => {
                const media = u.dias > 0 ? Math.round(u.total / u.dias) : 0;
                bodyHtml += `<tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-6 py-3 text-center text-blue-700 font-bold">${u.total}</td>
                    <td class="px-6 py-3 text-center">${u.dias}</td>
                    <td class="px-6 py-3 text-center">${media}</td>
                </tr>`;
            });
            tbody.innerHTML = bodyHtml || '<tr><td colspan="4" class="text-center py-4">Sem dados.</td></tr>';

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td class="text-center text-red-500 py-4">${e.message}</td></tr>`;
        }
    }
};