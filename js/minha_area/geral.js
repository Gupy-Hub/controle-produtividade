// ARQUIVO: js/minha_area/geral.js
MinhaArea.Geral = {
    /**
     * Carrega e renderiza os dados de produção e KPIs
     */
    carregar: async function() {
        const usuarioId = MinhaArea.getUsuarioAlvo();
        const corpoTabela = document.getElementById('tabela-extrato');
        const datas = MinhaArea.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        // Bloqueio de segurança para evitar requisições com datas inválidas
        if (dataInicio.includes('NaN') || dataFim.includes('NaN')) {
            return;
        }

        if (!usuarioId) {
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400">Seleccione um utilizador para ver os dados.</td></tr>';
            this.zerarKPIs();
            return;
        }

        corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>A carregar extrato de produção...</td></tr>';

        try {
            // 1. Consulta ao Supabase
            const { data: registros, error: erroProducao } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', usuarioId)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: false });

            if (erroProducao) throw erroProducao;

            // 2. Busca da Meta Diária
            const partesData = dataInicio.split('-');
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta')
                .eq('usuario_id', usuarioId)
                .eq('mes', parseInt(partesData[1]))
                .eq('ano', parseInt(partesData[0]))
                .maybeSingle();

            const metaDiariaBase = metaData ? metaData.meta : 650;

            // 3. Processamento de Dados
            let acumuladoProducao = 0;
            let acumuladoMeta = 0;
            let totalDiasTrabalhados = 0;
            corpoTabela.innerHTML = '';

            registros.forEach(item => {
                const quantidade = Number(item.quantidade || 0);
                const fatorTrabalho = Number(item.fator || 0);
                const metaCalculadaDia = Math.round(metaDiariaBase * fatorTrabalho);
                
                acumuladoProducao += quantidade;
                acumuladoMeta += metaCalculadaDia;
                if (fatorTrabalho > 0) totalDiasTrabalhados++;

                const percentualAtingimento = metaCalculadaDia > 0 ? (quantidade / metaCalculadaDia) * 100 : 0;
                const corPercentual = percentualAtingimento >= 100 ? 'text-emerald-600' : (percentualAtingimento >= 80 ? 'text-amber-600' : 'text-rose-600');
                
                const dataFormatada = item.data_referencia.split('-').reverse().join('/');

                corpoTabela.innerHTML += `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-200 text-xs">
                        <td class="px-3 py-2 font-bold text-slate-700">${dataFormatada}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${fatorTrabalho}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.fifo || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_total || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_parcial || 0}</td>
                        <td class="px-2 py-2 text-center font-black text-blue-700 bg-blue-50/30">${quantidade}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${metaCalculadaDia}</td>
                        <td class="px-2 py-2 text-center font-bold ${corPercentual}">${percentualAtingimento.toFixed(2)}%</td>
                        <td class="px-3 py-2 text-slate-600 italic">
                            ${item.justificativa || '<span class="text-slate-300">Sem observações</span>'}
                        </td>
                    </tr>`;
            });

            // 4. Atualização dos Cards de KPI
            const atingimentoFinalGeral = acumuladoMeta > 0 ? (acumuladoProducao / acumuladoMeta) * 100 : 0;
            
            this.setTxt('kpi-total', acumuladoProducao.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', acumuladoMeta.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', atingimentoFinalGeral.toFixed(2) + '%');
            this.setTxt('kpi-dias', totalDiasTrabalhados);
            this.setTxt('kpi-media', totalDiasTrabalhados > 0 ? Math.round(acumuladoProducao / totalDiasTrabalhados) : 0);
            this.setTxt('kpi-meta-dia', metaDiariaBase);
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteis(dataInicio, dataFim));

            const barra = document.getElementById('bar-progress');
            if (barra) {
                barra.style.width = `${Math.min(atingimentoFinalGeral, 100)}%`;
            }

            if (registros.length === 0) {
                corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum registo de produção encontrado.</td></tr>';
            }

        } catch (erro) {
            console.error("Erro na Área Pessoal:", erro);
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro ao aceder aos dados.</td></tr>';
        }
    },

    setTxt: function(id, valor) { 
        const el = document.getElementById(id); 
        if (el) el.innerText = valor; 
    },
    
    calcularDiasUteis: function(inicioStr, fimStr) {
        let uteis = 0;
        const atual = new Date(inicioStr + 'T12:00:00');
        const limite = new Date(fimStr + 'T12:00:00');
        while (atual <= limite) {
            if (atual.getDay() !== 0 && atual.getDay() !== 6) uteis++;
            atual.setDate(atual.getDate() + 1);
        }
        return uteis;
    },

    zerarKPIs: function() {
        ['kpi-total','kpi-meta-acumulada','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        const barra = document.getElementById('bar-progress'); 
        if (barra) barra.style.width = '0%';
    }
};