Produtividade.Geral = {
    META_DIARIA_POR_PESSOA: 120, // Ajuste sua meta aqui

    dadosView: [], 
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; 

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        // 1. Datas de Busca
        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        if (modoVisualizacao === 'mes') {
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }
        
        // 2. Carrega Dados (incluindo contrato)
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id, contrato)')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar dados:", error);
            return;
        }

        // 3. Busca dias úteis (para o KPI de dias)
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
                
                // Soma dias efetivos
                let fator = 1;
                if (row.fator !== undefined && row.fator !== null) fator = row.fator;
                mapa[uid].dias_calc += fator;
            });
            dadosAgrupados = Object.values(mapa);
        } else {
            dadosAgrupados = dadosBrutos.map(row => {
                let fator = 1;
                if (row.fator !== undefined && row.fator !== null) fator = row.fator;
                return { ...row, fator: fator, dias_calc: fator };
            });
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

        // --- CÁLCULO DE TOTAIS E EQUIPES ---
        let totalProducao = 0;
        let totalDiasPonderados = 0;

        // Stats: clt vs pj
        let stats = {
            clt: { qtd: 0, producao: 0 },
            pj: { qtd: 0, producao: 0 }
        };

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalDiasPonderados += reg.dias_calc;

            // Define contrato com segurança
            let contrato = 'PJ';
            if (reg.usuarios && reg.usuarios.contrato) {
                contrato = reg.usuarios.contrato.toUpperCase();
            }
            
            const tipo = (contrato === 'CLT') ? 'clt' : 'pj';

            stats[tipo].qtd++;
            stats[tipo].producao += reg.quantidade;
        });

        const pctCLT = totalProducao > 0 ? (stats.clt.producao / totalProducao) * 100 : 0;
        const pctPJ = totalProducao > 0 ? (stats.pj.producao / totalProducao) * 100 : 0;

        // --- ATUALIZA CARD EQUIPE (HARD RESET E NOVO LAYOUT) ---
        const elEquipe = document.getElementById('kpi-count-clt');
        if (elEquipe) {
            // Remove qualquer classe antiga para evitar conflitos
            elEquipe.className = '';
            // Aplica as classes novas de layout
            elEquipe.className = 'w-full flex flex-col justify-center gap-2 h-full py-1'; 
            
            // Define o HTML novo
            elEquipe.innerHTML = `
                <div class="flex items-center justify-between bg-blue-50 rounded px-2 py-1 border border-blue-100">
                    <div class="flex flex-col leading-none">
                        <span class="text-[10px] font-bold text-slate-500 uppercase">CLT</span>
                        <span class="text-sm font-bold text-blue-700">${stats.clt.qtd} <span class="text-[9px] font-normal text-slate-400">pessoas</span></span>
                    </div>
                    <div class="text-right leading-none">
                        <span class="text-xs font-bold text-blue-600">${pctCLT.toFixed(0)}%</span>
                        <div class="text-[9px] text-slate-400">prod.</div>
                    </div>
                </div>

                <div class="flex items-center justify-between bg-purple-50 rounded px-2 py-1 border border-purple-100">
                    <div class="flex flex-col leading-none">
                        <span class="text-[10px] font-bold text-slate-500 uppercase">PJ</span>
                        <span class="text-sm font-bold text-purple-700">${stats.pj.qtd} <span class="text-[9px] font-normal text-slate-400">pessoas</span></span>
                    </div>
                    <div class="text-right leading-none">
                        <span class="text-xs font-bold text-purple-600">${pctPJ.toFixed(0)}%</span>
                        <div class="text-[9px] text-slate-400">prod.</div>
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

            // Select de Fator (100%, 50%, Abonar)
            let ctrlFator = `<span class="text-xs font-bold text-slate-500">${Number(diasConsiderados).toLocaleString('pt-BR')}d</span>`;
            if (modo === 'dia') {
                const valFator = (row.fator !== undefined) ? row.fator : 1;
                // Prepara classes CSS baseadas no valor
                let selectClass = "text-[10px] font-bold border rounded p-1 outline-none text-slate-700";
                if (valFator == 0) selectClass = "text-[10px] font-bold border rounded p-1 outline-none text-red-500 bg-red-50";

                ctrlFator = `
                    <select onchange="Produtividade.Geral.mudarFatorIndividual('${row.id || row.producao_id}', this.value)" class="${selectClass}">
                        <option value="1" ${valFator == 1 ? 'selected' : ''}>100%</option>
                        <option value="0.5" ${valFator == 0.5 ? 'selected' : ''}>50%</option>
                        <option value="0" ${valFator == 0 ? 'selected' : ''}>Abonar</option>
                    </select>
                `;
            }

            // Define Badge e Nome com Segurança
            let contratoBadge = '';
            let nomeUsuario = 'Desconhecido';
            
            if (row.usuarios) {
                nomeUsuario = row.usuarios.nome;
                if (row.usuarios.contrato === 'CLT') {
                    contratoBadge = `<span class="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1 rounded border border-blue-100 font-bold">CLT</span>`;
                } else {
                    contratoBadge = `<span class="ml-2 text-[9px] bg-purple-50 text-purple-600 px-1 rounded border border-purple-100 font-bold">PJ</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            
            // Monta HTML da linha com cuidado
            tr.innerHTML = `
                <td class="px-4 py-3 text-center">${ctrlFator}</td>
                <td class="px-6 py-3 font-bold text-slate-700">
                    ${nomeUsuario} ${contratoBadge}
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
        if (!prodId || novoFator === undefined) return;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('id', prodId);

        if (error) alert("Erro ao atualizar: " + error.message);
        else this.carregarTela();
    },

    mudarFatorTodos: async function(novoFator) {
        if (novoFator === "") return;
        const elBulk = document.getElementById('bulk-fator');
        
        if (!confirm(`Aplicar fator ${novoFator} para TODOS?`)) {
            if(elBulk) elBulk.value = "";
            return;
        }

        const dataRef = document.getElementById('global-date').value;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('data_referencia', dataRef);

        if (error) alert("Erro: " + error.message);
        else this.carregarTela();
        
        if(elBulk) elBulk.value = "";
    },
    
    limparSelecao: function() { this.carregarTela(); },
    
    excluirDadosDia: async function() {
        if(!confirm("Tem certeza que deseja excluir os dados visualizados?")) return;
        
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        const data = dateInput.value;
        
        let query = Produtividade.supabase.from('producao').delete();

        if (viewMode === 'mes') {
            const [ano, mes] = data.split('-');
            const inicio = `${ano}-${mes}-01`;
            const fim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;
            query = query.gte('data_referencia', inicio).lte('data_referencia', fim);
        } else {
            query = query.eq('data_referencia', data);
        }
        
        const { error } = await query;
        if(!error) this.carregarTela();
        else alert("Erro ao excluir: " + error.message);
    },
    
    toggleSemana: function() { this.carregarTela(); }
};