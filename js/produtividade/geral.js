Produtividade.Geral = {
    META_DIARIA_POR_PESSOA: 120, // Meta padrão

    dadosView: [], 
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; // 'dia', 'mes'

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        // 1. Define Datas de Início e Fim
        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        if (modoVisualizacao === 'mes') {
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }
        
        [cite_start]// 2. Carrega Produção (INCLUINDO 'contrato' AGORA) [cite: 7]
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id, contrato)') // <--- Adicionado contrato
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar:", error);
            return;
        }

        // 3. Busca dias úteis do mês (Contexto)
        const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`;
        
        const { data: diasDb } = await Produtividade.supabase
            .from('producao')
            .select('data_referencia')
            .gte('data_referencia', inicioMes)
            .lte('data_referencia', fimMes);

        const diasUnicosSet = new Set(diasDb ? diasDb.map(d => d.data_referencia) : []);
        const diasTrabalhadosTime = Array.from(diasUnicosSet).sort();

        this.processarDados(producao, modoVisualizacao, diasTrabalhadosTime, dataSelecionada);
    },

    processarDados: function(dadosBrutos, modo, diasTrabalhadosTime, dataRef) {
        let dadosAgrupados = [];

        if (modo === 'mes') {
            const mapa = {};
            dadosBrutos.forEach(row => {
                const uid = row.usuario_id;
                if (!mapa[uid]) {
                    mapa[uid] = {
                        ...row,
                        quantidade: 0,
                        fifo: 0,
                        gradual_total: 0,
                        gradual_parcial: 0,
                        perfil_fc: 0,
                        dias_calc: 0 
                    };
                }
                mapa[uid].quantidade += (row.quantidade || 0);
                mapa[uid].fifo += (row.fifo || 0);
                mapa[uid].gradual_total += (row.gradual_total || 0);
                mapa[uid].gradual_parcial += (row.gradual_parcial || 0);
                mapa[uid].perfil_fc += (row.perfil_fc || 0);
                
                const fatorDia = (row.fator !== undefined && row.fator !== null) ? row.fator : 1;
                mapa[uid].dias_calc += fatorDia;
            });
            dadosAgrupados = Object.values(mapa);
        } else {
            dadosAgrupados = dadosBrutos.map(row => ({
                ...row,
                fator: (row.fator !== undefined && row.fator !== null) ? row.fator : 1,
                dias_calc: (row.fator !== undefined && row.fator !== null) ? row.fator : 1
            }));
        }

        this.dadosView = dadosAgrupados;
        this.atualizarKPIs(dadosAgrupados, diasTrabalhadosTime, dataRef);
        this.renderizarTabela(modo);
    },

    atualizarKPIs: function(dados, diasTrabalhadosTime, dataRef) {
        const [ano, mes] = dataRef.split('-').map(Number);

        // --- KPI DIAS ÚTEIS ---
        const diasComDados = diasTrabalhadosTime.length;
        const getDiasUteisMes = (y, m) => {
            let total = 0;
            const ultimoDia = new Date(y, m, 0).getDate();
            for(let i=1; i<=ultimoDia; i++) {
                const dt = new Date(y, m-1, i);
                const wd = dt.getDay();
                if(wd !== 0 && wd !== 6) total++;
            }
            return total;
        };
        const totalUteisMes = getDiasUteisMes(ano, mes);
        const elDias = document.getElementById('kpi-dias');
        if (elDias) elDias.innerText = `${diasComDados} / ${totalUteisMes}`;

        // --- TOTAIS GERAIS ---
        let totalProducao = 0;
        let totalDiasPonderados = 0;

        // --- CÁLCULO COMPARATIVO (CLT vs PJ) ---
        // Inicializa contadores
        let stats = {
            clt: { qtd: 0, producao: 0 },
            pj: { qtd: 0, producao: 0 }
        };

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalDiasPonderados += reg.dias_calc;

            // Verifica Contrato (Se não tiver definido, assume PJ)
            const contrato = reg.usuarios && reg.usuarios.contrato ? reg.usuarios.contrato.toUpperCase() : 'PJ';
            const tipo = contrato === 'CLT' ? 'clt' : 'pj';

            stats[tipo].qtd++;
            stats[tipo].producao += reg.quantidade;
        });

        // Calcula Porcentagens (Share de Produção)
        const pctCLT = totalProducao > 0 ? (stats.clt.producao / totalProducao) * 100 : 0;
        const pctPJ = totalProducao > 0 ? (stats.pj.producao / totalProducao) * 100 : 0;

        // --- ATUALIZAÇÃO DO CARD EQUIPE ---
        const elEquipe = document.getElementById('kpi-count-clt');
        if (elEquipe) {
            // Remove classes antigas de texto grande
            elEquipe.classList.remove('text-3xl', 'text-4xl', 'font-black');
            elEquipe.classList.add('text-sm'); // Ajusta tamanho para caber a lista
            
            // Insere HTML formatado
            elEquipe.innerHTML = `
                <div class="flex flex-col w-full px-1">
                    <div class="flex justify-between items-center border-b border-slate-100 pb-1 mb-1">
                        <span class="font-bold text-slate-600">CLT: ${stats.clt.qtd}</span>
                        <span class="text-blue-600 font-bold text-xs">${pctCLT.toFixed(0)}%</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-slate-600">PJ: ${stats.pj.qtd}</span>
                        <span class="text-indigo-600 font-bold text-xs">${pctPJ.toFixed(0)}%</span>
                    </div>
                </div>
            `;
        }

        // --- OUTROS KPIs ---
        const metaCalculada = totalDiasPonderados * this.META_DIARIA_POR_PESSOA;
        const atingimento = metaCalculada > 0 ? (totalProducao / metaCalculada) * 100 : 0;
        const media = totalDiasPonderados > 0 ? Math.round(totalProducao / totalDiasPonderados) : 0;

        if(document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = totalProducao.toLocaleString('pt-BR');
        if(document.getElementById('kpi-meta-total')) document.getElementById('kpi-meta-total').innerText = metaCalculada.toLocaleString('pt-BR');
        if(document.getElementById('kpi-pct')) document.getElementById('kpi-pct').innerText = atingimento.toFixed(1) + "%";
        if(document.getElementById('kpi-media-todas')) document.getElementById('kpi-media-todas').innerText = media;
    },

    renderizarTabela: function(modo) {
        const tbody = document.getElementById('tabela-corpo');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.dadosView.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-slate-400">Nenhum dado encontrado.</td></tr>`;
            return;
        }

        this.dadosView.sort((a, b) => b.quantidade - a.quantidade);

        this.dadosView.forEach(row => {
            const diasConsiderados = row.dias_calc; 
            const metaIndividual = Math.round(diasConsiderados * this.META_DIARIA_POR_PESSOA);
            const pct = metaIndividual > 0 ? (row.quantidade / metaIndividual) * 100 : 0;
            
            let corStatus = "text-red-600 bg-red-50";
            if (pct >= 100) corStatus = "text-emerald-600 bg-emerald-50";
            else if (pct >= 80) corStatus = "text-yellow-600 bg-yellow-50";
            
            let pctTexto = pct.toFixed(0) + "%";
            if (metaIndividual === 0) {
                corStatus = "text-slate-500 bg-slate-100";
                pctTexto = "Abn";
            }

            let ctrlFator = `<span class="text-xs font-bold text-slate-500">${Number(diasConsiderados).toLocaleString('pt-BR')}d</span>`;
            if (modo === 'dia') {
                const valFator = row.fator !== undefined ? row.fator : 1;
                ctrlFator = `
                    <select onchange="Produtividade.Geral.mudarFatorIndividual('${row.id || row.producao_id}', this.value)" 
                            class="text-[10px] font-bold border rounded p-1 outline-none ${valFator == 0 ? 'text-red-500 bg-red-50' : 'text-slate-700'}">
                        <option value="1" ${valFator == 1 ? 'selected' : ''}>100%</option>
                        <option value="0.5" ${valFator == 0.5 ? 'selected' : ''}>50%</option>
                        <option value="0" ${valFator == 0 ? 'selected' : ''}>Abonar</option>
                    </select>
                `;
            }

            // Visualização do Contrato na Tabela (Opcional, mas útil)
            const badgeContrato = (row.usuarios.contrato === 'CLT')
                ? `<span class="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1 rounded border border-blue-100">CLT</span>`
                : `<span class="ml-2 text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded border border-indigo-100">PJ</span>`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="px-4 py-3 text-center">${ctrlFator}</td>
                <td class="px-6 py-3 font-bold text-slate-700">
                    ${row.usuarios ? row.usuarios.nome : 'Desconhecido'} ${badgeContrato}
                </td>
                <td class="px-6 py-3 text-center text-slate-500 font-bold bg-slate-50/50">${Number(diasConsiderados).toLocaleString('pt-BR')}</td>
                <td class="px-6 py-3 text-center font-black text-blue-700 text-lg">${(row.quantidade || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.fifo || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_total || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_parcial || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-400 text-xs">${metaIndividual}</td>
                <td class="px-6 py-3 text-center">
                    <span class="${corStatus} px-2 py-1 rounded text-xs font-bold border border-current opacity-80">${pctTexto}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    mudarFatorIndividual: async function(prodId, novoFator) {
        if (!prodId) return;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('id', prodId);
        if (error) alert("Erro: " + error.message); else this.carregarTela();
    },

    mudarFatorTodos: async function(novoFator) {
        if (novoFator === "") return;
        if (!confirm(`Aplicar fator ${novoFator} para TODOS?`)) return;
        const dataRef = document.getElementById('global-date').value;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('data_referencia', dataRef);
        if (error) alert("Erro: " + error.message); else this.carregarTela();
        document.getElementById('bulk-fator').value = "";
    },
    
    limparSelecao: function() { this.carregarTela(); },
    
    excluirDadosDia: async function() {
        if(!confirm("Excluir dados visualizados?")) return;
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        const data = dateInput.value;
        let query = Produtividade.supabase.from('producao').delete();
        if (viewMode === 'mes') {
            const [ano, mes] = data.split('-');
            const inicio = `${ano}-${mes}-01`;
            const fim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;
            query = query.gte('data_referencia', inicio).lte('data_referencia', fim);
        } else { query = query.eq('data_referencia', data); }
        const { error } = await query;
        if(!error) this.carregarTela();
    },
    
    toggleSemana: function() { this.carregarTela(); }
};