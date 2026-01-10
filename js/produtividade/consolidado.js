Produtividade.Consolidado = {
    dadosProcessados: [],

    carregar: async function() {
        const tbody = document.getElementById('tabela-consolidado-body');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados consolidados...</td></tr>';

        // 1. Pega datas do filtro global (Reutiliza lógica do Geral para consistência)
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        let dataSel = dateInput.value;
        const [ano, mes, dia] = dataSel.split('-');
        let dataInicio, dataFim;

        if (viewMode === 'dia') { dataInicio = dataSel; dataFim = dataSel; }
        else if (viewMode === 'mes') { dataInicio = `${ano}-${mes}-01`; dataFim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (viewMode === 'ano') { dataInicio = `${ano}-01-01`; dataFim = `${ano}-12-31`; }
        else if (viewMode === 'semana') {
            const semanaSel = parseInt(document.getElementById('select-semana').value) - 1;
            const semanas = Produtividade.Geral.getSemanasDoMes(parseInt(ano), parseInt(mes));
            if (semanas[semanaSel]) { dataInicio = semanas[semanaSel].inicio; dataFim = semanas[semanaSel].fim; }
        }

        try {
            // 2. Busca dados brutos no banco
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator,
                    usuario:usuarios ( id, nome, perfil, funcao, contrato )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);

            if (error) throw error;

            // 3. Agrupa por Usuário (Lógica de Consolidação)
            let dadosAgrupados = {};
            
            data.forEach(r => {
                const uid = r.usuario ? r.usuario.id : 'desc';
                if (!dadosAgrupados[uid]) {
                    dadosAgrupados[uid] = {
                        usuario: r.usuario || { nome: 'Desconhecido', funcao: 'Assistente', contrato: 'PJ' },
                        dias: 0,
                        fifo: 0,
                        gt: 0,
                        gp: 0,
                        producao: 0,
                        meta_base: 650 // Padrão
                    };
                }
                const d = dadosAgrupados[uid];
                const fator = Number(r.fator) || 0;
                
                d.dias += fator; // Dias ponderados (0.5 ou 1)
                d.fifo += (Number(r.fifo) || 0);
                d.gt += (Number(r.gradual_total) || 0);
                d.gp += (Number(r.gradual_parcial) || 0);
                d.producao += (Number(r.quantidade) || 0);
            });

            this.dadosProcessados = Object.values(dadosAgrupados); 
            this.renderizar();

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    },

    renderizar: function() {
        const tbody = document.getElementById('tabela-consolidado-body');
        const footer = document.getElementById('total-consolidado-footer');
        const checkGestao = document.getElementById('check-gestao');
        const mostrarGestao = checkGestao ? checkGestao.checked : false;

        if (!this.dadosProcessados) return;

        // Filtro de Gestão (Mesmo checkbox da aba Geral)
        let lista = this.dadosProcessados.filter(d => {
            if (mostrarGestao) return true;
            const funcao = (d.usuario.funcao || '').toUpperCase();
            return !['AUDITORA', 'GESTORA'].includes(funcao);
        });

        // Ordenação por Nome
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        tbody.innerHTML = '';
        if(footer) footer.innerText = lista.length;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum dado encontrado para este período.</td></tr>';
            return;
        }

        const commonCellClass = "px-2 py-3 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

        lista.forEach(d => {
            const metaPeriodo = d.dias * d.meta_base;
            const pct = metaPeriodo > 0 ? (d.producao / metaPeriodo) * 100 : 0;
            
            const cargo = (d.usuario.funcao || 'Assistente').toUpperCase();
            const contrato = (d.usuario.contrato || 'PJ').toUpperCase();

            // Estilização da porcentagem
            let classPct = "text-amber-600 font-bold";
            if (pct >= 100) classPct = "text-emerald-700 font-black";
            else if (pct < 70) classPct = "text-rose-600 font-bold";

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
            
            tr.innerHTML = `
                <td class="px-3 py-3 border-r border-slate-200">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-700 text-xs truncate">${d.usuario.nome}</span>
                        <span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span>
                    </div>
                </td>
                <td class="${commonCellClass} font-bold text-slate-700">${d.dias}</td>
                <td class="${commonCellClass}">${d.fifo}</td>
                <td class="${commonCellClass}">${d.gt}</td>
                <td class="${commonCellClass}">${d.gp}</td>
                <td class="${commonCellClass} text-slate-400">${d.meta_base}</td>
                <td class="${commonCellClass} bg-slate-50">${Math.round(metaPeriodo)}</td>
                <td class="${commonCellClass} font-bold text-blue-700 bg-blue-50/30">${d.producao}</td>
                <td class="px-2 py-3 text-center">
                     <span class="${classPct} text-xs">${Math.round(pct)}%</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};