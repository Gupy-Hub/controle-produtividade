// ARQUIVO: js/minha_area/geral.js
MinhaArea.Geral = {
    carregar: async function() {
        const usuarioId = MinhaArea.getUsuarioAlvo();
        const corpoTabela = document.getElementById('tabela-extrato');
        const datas = MinhaArea.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        // Validação de segurança para evitar erros 400 no Supabase
        if (dataInicio.includes('NaN') || dataFim.includes('NaN')) {
            console.error("Datas inválidas detectadas. Abortando carregamento.");
            return;
        }

        if (!usuarioId) {
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400">Por favor, selecione um usuário.</td></tr>';
            this.zerarKPIs();
            return;
        }

        corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Buscando dados de produção...</td></tr>';

        try {
            // 1. Busca Produção e Justificativas
            const { data: registros, error: erroProducao } = await Sistema.supabase
                .from('producao')
                .select('*') // O '*' garante que o campo 'justificativa' seja incluído
                .eq('usuario_id', usuarioId)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: false });

            if (erroProducao) throw erroProducao;

            // 2. Busca Meta Mensal para cálculo proporcional
            const partesData = dataInicio.split('-');
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta')
                .eq('usuario_id', usuarioId)
                .eq('mes', parseInt(partesData[1]))
                .eq('ano', parseInt(partesData[0]))
                .maybeSingle();

            const metaDiariaReferencia = metaData ? metaData.meta : 650;

            // 3. Processamento e Renderização
            let acumuladoProducao = 0;
            let acumuladoMeta = 0;
            let totalDiasAtivos = 0;
            corpoTabela.innerHTML = '';

            registros.forEach(item => {
                const quantidade = Number(item.quantidade || 0);
                const fatorTrabalho = Number(item.fator || 0);
                const metaDoDia = Math.round(metaDiariaReferencia * fatorTrabalho);
                
                acumuladoProducao += quantidade;
                acumuladoMeta += metaDoDia;
                if (fatorTrabalho > 0) totalDiasAtivos++;

                const percentualAtingimento = metaDoDia > 0 ? (quantidade / metaDoDia) * 100 : 0;
                const corPercentual = percentualAtingimento >= 100 ? 'text-emerald-600' : (percentualAtingimento >= 80 ? 'text-amber-600' : 'text-rose-600');
                
                // Formatação visual da data (DD/MM/YYYY)
                const dataExibicao = item.data_referencia.split('-').reverse().join('/');

                corpoTabela.innerHTML += `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-200 text-xs">
                        <td class="px-3 py-2 font-bold text-slate-700">${dataExibicao}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${fatorTrabalho}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.fifo || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_total || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_parcial || 0}</td>
                        <td class="px-2 py-2 text-center font-black text-blue-700 bg-blue-50/30">${quantidade}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${metaDoDia}</td>
                        <td class="px-2 py-2 text-center font-bold ${corPercentual}">${percentualAtingimento.toFixed(2)}%</td>
                        <td class="px-3 py-2 text-slate-600 italic">
                            ${item.justificativa || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>`;
            });

            // 4. Atualização dos Cards de KPI (Padrão HUD)
            const mediaFinalAtingimento = acumuladoMeta > 0 ? (acumuladoProducao / acumuladoMeta) * 100 : 0;
            
            this.setTxt('kpi-total', acumuladoProducao.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', acumuladoMeta.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', mediaFinalAtingimento.toFixed(2) + '%');
            this.setTxt('kpi-dias', totalDiasAtivos);
            this.setTxt('kpi-media', totalDiasAtivos > 0 ? Math.round(acumuladoProducao / totalDiasAtivos) : 0);
            this.setTxt('kpi-meta-dia', metaDiariaReferencia);
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteis(dataInicio, dataFim));

            // Atualiza a barra de progresso visual
            const barraProgresso = document.getElementById('bar-progress');
            if (barraProgresso) {
                barraProgresso.style.width = `${Math.min(mediaFinalAtingimento, 100)}%`;
            }

            if (registros.length === 0) {
                corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado para este período.</td></tr>';
            }

        } catch (erro) {
            console.error("Falha ao carregar extrato:", erro);
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro técnico ao acessar a base de dados.</td></tr>';
        }
    },

    setTxt: function(idElemento, valorTexto) { 
        const elemento = document.getElementById(idElemento); 
        if (elemento) elemento.innerText = valorTexto; 
    },
    
    calcularDiasUteis: function(inicioString, fimString) {
        let contadorUteis = 0;
        const dataAtual = new Date(inicioString + 'T12:00:00');
        const dataLimite = new Date(fimString + 'T12:00:00');
        while (dataAtual <= dataLimite) {
            const diaSemana = dataAtual.getDay();
            if (diaSemana !== 0 && diaSemana !== 6) contadorUteis++;
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return contadorUteis;
    },

    zerarKPIs: function() {
        ['kpi-total','kpi-meta-acumulada','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        const barra = document.getElementById('bar-progress'); 
        if (barra) barra.style.width = '0%';
    }
};