Produtividade.Geral = {
    dadosDoDia: [],
    
    carregarTela: async function() {
        const dataRef = document.getElementById('global-date').value;
        if (!dataRef) return;

        const tbody = document.getElementById('tabela-corpo');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</td></tr>';

        try {
            // 1. Busca Produção
            const { data: producao, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios!inner(id, nome, funcao, contrato)')
                .eq('data_referencia', dataRef);

            if (error) throw error;

            // 2. Busca Metas (Tenta achar a meta vigente para a data)
            const { data: metas } = await Produtividade.supabase
                .from('metas')
                .select('*')
                .lte('data_inicio', dataRef)
                .order('data_inicio', { ascending: false }); // Pega a mais recente primeiro

            this.dadosDoDia = producao;
            this.renderizarTabela(producao, metas);
            this.atualizarKPIs(producao, metas);

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados, metas) {
        const tbody = document.getElementById('tabela-corpo');
        
        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400">Nenhum dado encontrado para esta data.</td></tr>';
            // Zera KPIs visualmente
            this.zerarKPIs();
            return;
        }

        let html = '';
        dados.sort((a, b) => a.usuarios.nome.localeCompare(b.usuarios.nome));

        dados.forEach(item => {
            // Lógica de Meta: Procura meta específica do usuário, senão usa padrão (650)
            const metaUser = metas.find(m => m.usuario_id === item.usuario_id) || { valor_meta: 650 };
            const metaDiaria = metaUser.valor_meta;
            
            const fator = item.fator_multiplicador !== null ? item.fator_multiplicador : 1;
            const metaCalc = Math.round(metaDiaria * fator);
            const totalProd = item.quantidade || 0;
            const pct = metaCalc > 0 ? (totalProd / metaCalc) * 100 : 0;

            let corPct = 'text-slate-600';
            if (pct >= 100) corPct = 'text-emerald-600 font-bold';
            else if (pct < 80) corPct = 'text-red-500 font-bold';

            // Select Status (Fator)
            const selClass = fator === 1 ? 'st-1' : (fator === 0 ? 'st-0' : 'st-05');

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 text-xs">
                <td class="px-4 py-2 text-center border-r border-slate-100">
                    <select onchange="Produtividade.Geral.atualizarFator(${item.id}, this.value)" class="status-select ${selClass}">
                        <option value="1" ${fator === 1 ? 'selected' : ''}>100%</option>
                        <option value="0.5" ${fator === 0.5 ? 'selected' : ''}>50%</option>
                        <option value="0" ${fator === 0 ? 'selected' : ''}>Abono</option>
                    </select>
                </td>
                <td class="px-6 py-3 font-bold text-slate-700">${item.usuarios.nome}</td>
                <td class="px-6 py-3 text-center">${fator}</td>
                <td class="px-6 py-3 text-center font-bold text-blue-700">${totalProd}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.fifo || 0}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.gradual_total || 0}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.gradual_parcial || 0}</td>
                <td class="px-6 py-3 text-center font-mono text-slate-600">${metaCalc}</td>
                <td class="px-6 py-3 text-center ${corPct}">${pct.toFixed(1)}%</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    atualizarKPIs: function(dados, metas) {
        let totalProd = 0;
        let totalMeta = 0;
        let cltCount = 0, pjCount = 0;
        let assistentesAtivos = 0;

        dados.forEach(d => {
            const qtd = d.quantidade || 0;
            totalProd += qtd;

            // Busca meta
            const m = metas.find(x => x.usuario_id === d.usuario_id) || { valor_meta: 650 };
            const fator = d.fator_multiplicador !== null ? d.fator_multiplicador : 1;
            totalMeta += Math.round(m.valor_meta * fator);

            if (d.usuarios.contrato === 'CLT') cltCount++;
            else pjCount++;

            // Conta para média apenas se produziu algo ou se o fator > 0
            if (fator > 0) assistentesAtivos++;
        });

        const totalPessoas = cltCount + pjCount;
        
        // 1. Equipe
        document.getElementById('kpi-count-clt').innerText = cltCount;
        document.getElementById('kpi-count-pj').innerText = pjCount;
        if(totalPessoas > 0) {
            document.getElementById('kpi-pct-clt').innerText = Math.round((cltCount/totalPessoas)*100) + '%';
            document.getElementById('kpi-pct-pj').innerText = Math.round((pjCount/totalPessoas)*100) + '%';
        } else {
            document.getElementById('kpi-pct-clt').innerText = '0%';
            document.getElementById('kpi-pct-pj').innerText = '0%';
        }

        // 2. Produção Total
        document.getElementById('kpi-total').innerText = totalProd.toLocaleString('pt-BR');
        document.getElementById('kpi-meta-total').innerText = totalMeta.toLocaleString('pt-BR');

        // 3. Atingimento Global
        const pctGlobal = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
        const elPct = document.getElementById('kpi-pct');
        elPct.innerText = pctGlobal.toFixed(1) + '%';
        
        // Muda cor do card de atingimento
        const cardPct = document.getElementById('card-pct');
        if(pctGlobal >= 100) cardPct.className = "bg-gradient-to-br from-emerald-600 to-teal-600 p-3 rounded-xl shadow-lg shadow-emerald-200 text-white flex flex-col justify-between";
        else if(pctGlobal >= 80) cardPct.className = "bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg shadow-blue-200 text-white flex flex-col justify-between";
        else cardPct.className = "bg-gradient-to-br from-red-600 to-rose-600 p-3 rounded-xl shadow-lg shadow-red-200 text-white flex flex-col justify-between";

        // 4. Médias (CORRIGIDO)
        const mediaTime = assistentesAtivos > 0 ? Math.round(totalProd / assistentesAtivos) : 0;
        document.getElementById('kpi-media-todas').innerText = mediaTime.toLocaleString('pt-BR');
        
        // Média Individual (Simulada ou baseada no user logado? Aqui faremos Geral vs "Meta Média")
        // Como é visão geral, "Individual" pode ser "Meta Média Esperada"
        const mediaMeta = assistentesAtivos > 0 ? Math.round(totalMeta / assistentesAtivos) : 650;
        document.getElementById('kpi-media-assist').innerText = mediaMeta.toLocaleString('pt-BR');

        // 5. Dias Úteis (Simples, pois é visão diária)
        document.getElementById('kpi-dias').innerText = "1"; 
    },

    zerarKPIs: function() {
        ['kpi-total', 'kpi-meta-total', 'kpi-media-todas', 'kpi-media-assist', 'kpi-pct'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = '--';
        });
        document.getElementById('kpi-count-clt').innerText = '0';
        document.getElementById('kpi-count-pj').innerText = '0';
    },

    atualizarFator: async function(idProducao, novoFator) {
        try {
            const btn = document.querySelector(`select[onchange*="${idProducao}"]`);
            if(btn) btn.disabled = true;

            await Produtividade.supabase
                .from('producao')
                .update({ fator_multiplicador: parseFloat(novoFator) })
                .eq('id', idProducao);
            
            this.carregarTela(); 
        } catch (e) { alert("Erro: " + e.message); }
    },

    mudarFatorTodos: async function(novoFator) {
        if (!novoFator) return;
        if(!confirm("Aplicar este fator para TODOS os registros exibidos?")) return;
        
        const dataRef = document.getElementById('global-date').value;
        try {
            await Produtividade.supabase
                .from('producao')
                .update({ fator_multiplicador: parseFloat(novoFator) })
                .eq('data_referencia', dataRef);
            
            document.getElementById('bulk-fator').value = "";
            this.carregarTela();
        } catch (e) { alert("Erro: " + e.message); }
    },

    excluirDadosDia: async function() {
        const dataRef = document.getElementById('global-date').value;
        if(!confirm(`ATENÇÃO: Excluir TODOS os dados de ${dataRef.split('-').reverse().join('/')}?`)) return;
        
        try {
            await Produtividade.supabase.from('producao').delete().eq('data_referencia', dataRef);
            this.carregarTela();
            alert("Dados excluídos.");
        } catch (e) { alert("Erro: " + e.message); }
    },
    
    toggleSemana: function() {
        // Lógica futura para filtro semanal
        this.carregarTela();
    }
};