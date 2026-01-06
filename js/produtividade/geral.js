Produtividade.Geral = {
    dadosDoDia: [],
    
    carregarTela: async function() {
        const dataRef = document.getElementById('global-date').value;
        if (!dataRef) return;

        // Limpa tabela
        const tbody = document.getElementById('tabela-corpo');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        try {
            // Busca dados de produção e usuários
            const { data: producao, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios!inner(id, nome, funcao, contrato)')
                .eq('data_referencia', dataRef);

            if (error) throw error;

            // Busca metas vigentes
            const { data: metas } = await Produtividade.supabase
                .from('metas')
                .select('*')
                .lte('data_inicio', dataRef)
                .order('data_inicio', { ascending: false });

            this.dadosDoDia = producao;
            this.renderizarTabela(producao, metas, dataRef);
            this.atualizarKPIs(producao);

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro ao carregar: ${err.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados, metas, dataRef) {
        const tbody = document.getElementById('tabela-corpo');
        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400">Nenhum dado encontrado para esta data. Importe uma planilha.</td></tr>';
            return;
        }

        let html = '';
        dados.sort((a, b) => a.usuarios.nome.localeCompare(b.usuarios.nome));

        dados.forEach(item => {
            // Busca meta mais recente para o usuário
            const metaUser = metas.find(m => m.usuario_id === item.usuario_id) || { valor_meta: 0 };
            const metaDiaria = metaUser.valor_meta;
            
            // Cálculos
            // Se houver fator manual, usa ele, senão 1 (100%)
            const fator = item.fator_multiplicador !== null ? item.fator_multiplicador : 1; 
            const diasCalc = fator; 
            const metaCalculada = Math.round(metaDiaria * fator);
            const totalProd = item.quantidade || 0;
            const pct = metaCalculada > 0 ? (totalProd / metaCalculada) * 100 : 0;

            // Estilos
            let corPct = 'text-slate-600';
            if (pct >= 100) corPct = 'text-emerald-600 font-bold';
            else if (pct < 80) corPct = 'text-red-500 font-bold';

            // Select de Status (Fator)
            const selClass = fator === 1 ? 'st-1' : (fator === 0 ? 'st-0' : 'st-05');
            
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 text-sm">
                <td class="px-4 py-2 text-center border-r border-slate-100">
                    <select onchange="Produtividade.Geral.atualizarFator(${item.id}, this.value)" class="status-select ${selClass}">
                        <option value="1" ${fator === 1 ? 'selected' : ''}>100%</option>
                        <option value="0.5" ${fator === 0.5 ? 'selected' : ''}>50%</option>
                        <option value="0" ${fator === 0 ? 'selected' : ''}>Abono</option>
                    </select>
                </td>
                <td class="px-6 py-3 font-bold text-slate-700">${item.usuarios.nome}</td>
                <td class="px-6 py-3 text-center">${diasCalc}</td>
                <td class="px-6 py-3 text-center font-bold text-blue-700">${totalProd}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.fifo || 0}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.gradual_total || 0}</td>
                <td class="px-6 py-3 text-center text-slate-500">${item.gradual_parcial || 0}</td>
                <td class="px-6 py-3 text-center font-mono text-slate-600">${metaCalculada}</td>
                <td class="px-6 py-3 text-center ${corPct}">${pct.toFixed(1)}%</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    atualizarFator: async function(idProducao, novoFator) {
        try {
            await Produtividade.supabase
                .from('producao')
                .update({ fator_multiplicador: parseFloat(novoFator) })
                .eq('id', idProducao);
            
            this.carregarTela(); // Recarrega para recalcular metas
        } catch (e) { alert("Erro ao atualizar: " + e.message); }
    },

    mudarFatorTodos: async function(novoFator) {
        if (!novoFator) return;
        if(!confirm("Aplicar para TODOS os registros da tela?")) return;
        
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

    atualizarKPIs: function(dados) {
        let totalProd = 0;
        let totalMeta = 0; // Isso precisaria da meta de cada um, simplificado aqui
        let cltCount = 0, pjCount = 0;

        dados.forEach(d => {
            totalProd += (d.quantidade || 0);
            if(d.usuarios.contrato === 'CLT') cltCount++;
            else pjCount++;
        });

        document.getElementById('kpi-total').innerText = totalProd.toLocaleString('pt-BR');
        document.getElementById('kpi-count-clt').innerText = cltCount;
        document.getElementById('kpi-count-pj').innerText = pjCount;
        
        // Simples calculo de % CLT/PJ
        const totalPessoas = cltCount + pjCount;
        if(totalPessoas > 0) {
            document.getElementById('kpi-pct-clt').innerText = Math.round((cltCount/totalPessoas)*100) + '%';
            document.getElementById('kpi-pct-pj').innerText = Math.round((pjCount/totalPessoas)*100) + '%';
        }
    },

    excluirDadosDia: async function() {
        const dataRef = document.getElementById('global-date').value;
        if(!confirm(`EXCLUIR TODOS os dados de produção de ${dataRef}?`)) return;
        
        try {
            const { error } = await Produtividade.supabase.from('producao').delete().eq('data_referencia', dataRef);
            if (error) throw error;
            this.carregarTela();
            alert("Dados excluídos.");
        } catch (e) { alert("Erro: " + e.message); }
    },

    toggleSemana: function() {
        const mode = document.getElementById('view-mode').value;
        const selSemana = document.getElementById('select-semana');
        if (mode === 'semana') selSemana.classList.remove('hidden');
        else selSemana.classList.add('hidden');
        this.carregarTela(); // (Lógica de semana/mês precisa ser expandida no backend filter)
    }
};