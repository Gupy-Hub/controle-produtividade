//

Produtividade.Geral = {
    dadosDoDia: [],
    
    carregarTela: async function() {
        const dataRef = document.getElementById('global-date').value;
        const tbody = document.getElementById('tabela-corpo');
        if(!dataRef || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        try {
            const { data: producao, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios!inner(id, nome, funcao, contrato)')
                .eq('data_referencia', dataRef);

            if (error) throw error;

            const { data: metas } = await Produtividade.supabase
                .from('metas')
                .select('*')
                .lte('data_inicio', dataRef)
                .order('data_inicio', { ascending: false });

            this.dadosDoDia = producao || [];
            this.renderizarTabela(this.dadosDoDia, metas || []);
            this.atualizarKPIs(this.dadosDoDia, metas || []);

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    },

    // Função auxiliar para tratar o fator com segurança
    getFator: function(valor) {
        if (valor === null || valor === undefined || isNaN(Number(valor))) {
            return 1; // Padrão 100% se vier vazio ou inválido
        }
        return Number(valor);
    },

    renderizarTabela: function(dados, metas) {
        const tbody = document.getElementById('tabela-corpo');
        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400">Nenhum dado. Importe a planilha do dia.</td></tr>';
            this.zerarKPIs();
            return;
        }

        dados.sort((a, b) => {
            const nomeA = a.usuarios?.nome || '';
            const nomeB = b.usuarios?.nome || '';
            return nomeA.localeCompare(nomeB);
        });

        let html = '';
        dados.forEach(item => {
            // Tratamento de Meta
            const metaUser = metas.find(m => m.usuario_id === item.usuario_id) || { valor_meta: 650 };
            const metaDiaria = Number(metaUser.valor_meta) || 650;
            
            // CORREÇÃO: Usa a função auxiliar para garantir número
            const fator = this.getFator(item.fator_multiplicador);
            
            // Cálculos Seguros
            const metaCalc = Math.round(metaDiaria * fator);
            const totalProd = Number(item.quantidade) || 0;
            
            let pct = 0;
            if (metaCalc > 0) {
                pct = (totalProd / metaCalc) * 100;
            } else if (totalProd > 0) {
                pct = 100; 
            }

            let corPct = 'text-slate-600';
            if (pct >= 100) corPct = 'text-emerald-600 font-bold';
            else if (pct < 80) corPct = 'text-red-500 font-bold';

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
                <td class="px-6 py-3 font-bold text-slate-700">${item.usuarios?.nome || 'Desc.'}</td>
                <td class="px-6 py-3 text-center">${fator}</td> <td class="px-6 py-3 text-center font-bold text-blue-700">${totalProd.toLocaleString('pt-BR')}</td>
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
        let clt = 0, pj = 0;
        let ativos = 0;
        let assistProd = 0; // Para calcular média individual correta

        dados.forEach(d => {
            const qtd = Number(d.quantidade) || 0;
            // CORREÇÃO: Mesma segurança no fator aqui
            const fator = this.getFator(d.fator_multiplicador);
            
            const m = metas.find(x => x.usuario_id === d.usuario_id) || { valor_meta: 650 };
            const mVal = Number(m.valor_meta) || 650;

            totalProd += qtd;
            totalMeta += Math.round(mVal * fator);

            if (d.usuarios?.contrato === 'CLT') clt++; else pj++;
            
            // Só conta na média se o fator for > 0 (quem trabalhou)
            if (fator > 0) {
                ativos++;
                assistProd += qtd;
            }
        });

        const totalPessoas = clt + pj;
        
        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', totalMeta.toLocaleString('pt-BR'));
        
        const pctGlobal = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
        this.setTxt('kpi-pct', pctGlobal.toFixed(1) + '%');

        this.setTxt('kpi-count-clt', clt);
        this.setTxt('kpi-count-pj', pj);
        
        if(totalPessoas > 0) {
            this.setTxt('kpi-pct-clt', Math.round((clt/totalPessoas)*100) + '%');
            this.setTxt('kpi-pct-pj', Math.round((pj/totalPessoas)*100) + '%');
        }

        const media = ativos > 0 ? Math.round(totalProd / ativos) : 0;
        this.setTxt('kpi-media-todas', media.toLocaleString('pt-BR'));
        // Atualiza a média individual também
        this.setTxt('kpi-media-assist', media.toLocaleString('pt-BR')); 
        
        const cardPct = document.getElementById('card-pct');
        if(cardPct) {
            if(pctGlobal >= 100) cardPct.className = "bg-gradient-to-br from-emerald-600 to-teal-600 p-3 rounded-xl shadow-lg shadow-emerald-200 text-white flex flex-col justify-between";
            else if(pctGlobal >= 80) cardPct.className = "bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg shadow-blue-200 text-white flex flex-col justify-between";
            else cardPct.className = "bg-gradient-to-br from-red-600 to-rose-600 p-3 rounded-xl shadow-lg shadow-red-200 text-white flex flex-col justify-between";
        }
    },

    setTxt: function(id, val) {
        const el = document.getElementById(id);
        if(el) el.innerText = val;
    },

    zerarKPIs: function() {
        ['kpi-total', 'kpi-meta-total', 'kpi-media-todas', 'kpi-pct', 'kpi-media-assist'].forEach(id => this.setTxt(id, '--'));
        this.setTxt('kpi-count-clt', '0');
        this.setTxt('kpi-count-pj', '0');
    },

    atualizarFator: async function(id, val) {
        try {
            await Produtividade.supabase.from('producao').update({ fator_multiplicador: parseFloat(val) }).eq('id', id);
            this.carregarTela();
        } catch(e) { alert(e.message); }
    },

    mudarFatorTodos: async function(val) {
        if(!val || !confirm("Aplicar a todos?")) return;
        try {
            const dt = document.getElementById('global-date').value;
            await Produtividade.supabase.from('producao').update({ fator_multiplicador: parseFloat(val) }).eq('data_referencia', dt);
            this.carregarTela();
        } catch(e) { alert(e.message); }
    },

    excluirDadosDia: async function() {
        const dt = document.getElementById('global-date').value;
        if(!confirm(`Excluir dados de ${dt}?`)) return;
        try {
            await Produtividade.supabase.from('producao').delete().eq('data_referencia', dt);
            alert("Excluído.");
            this.carregarTela();
        } catch(e) { alert(e.message); }
    },
    
    toggleSemana: function() { /* Futuro */ },
    limparSelecao: function() { /* Futuro */ }
};