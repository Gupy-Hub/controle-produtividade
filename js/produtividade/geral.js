Produtividade.Geral = {
    META_DIARIA_POR_PESSOA: 120, // Meta padrão de documentos por dia

    dadosView: [], 
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; // 'dia' ou 'mes'

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        // 1. Define Datas de Início e Fim da consulta
        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        if (modoVisualizacao === 'mes') {
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }
        
        // 2. Carrega Produção (buscando o contrato do usuário)
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id, contrato)')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar dados:", error);
            return;
        }

        // 3. Busca dias úteis do mês (Contexto para o KPI de Dias Úteis)
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
            // Agrupa produção do mês por usuário
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
                
                // Soma os fatores (dias efetivos)
                const fatorDia = (row.fator !== undefined && row.fator !== null) ? row.fator : 1;
                mapa[uid].dias_calc += fatorDia;
            });
            dadosAgrupados = Object.values(mapa);
        } else {
            // Modo Dia: Mapeia individualmente
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

        // --- KPI 1: DIAS ÚTEIS ---
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

        // --- PREPARAÇÃO DOS TOTAIS ---
        let totalProducao = 0;
        let totalDiasPonderados = 0;

        // Stats para o Card Equipe
        let stats = {
            clt: { qtd: 0, producao: 0 },
            pj: { qtd: 0, producao: 0 }
        };

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalDiasPonderados += reg.dias_calc;

            // Identifica contrato (padrão PJ se vazio)
            const contrato = reg.usuarios && reg.usuarios.contrato ? reg.usuarios.contrato.toUpperCase() : 'PJ';
            const tipo = contrato === 'CLT' ? 'clt' : 'pj';

            stats[tipo].qtd++;
            stats[tipo].producao += reg.quantidade;
        });

        const pctCLT = totalProducao > 0 ? (stats.clt.producao / totalProducao) * 100 : 0;
        const pctPJ = totalProducao > 0 ? (stats.pj.producao / totalProducao) * 100 : 0;

        // --- ATUALIZAÇÃO DO CARD EQUIPE (LIMPO E PADRONIZADO) ---
        const elEquipe = document.getElementById('kpi-count-clt');
        if (elEquipe) {
            // 1. Remove classes antigas que quebram o layout (ex: texto gigante)
            elEquipe.className = ''; 
            elEquipe.classList.add('w-full', 'flex', 'flex-col', 'gap-2', 'pt-1'); // Novo container flex
            
            // 2. Insere APENAS o novo HTML organizado
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

        // --- OUTROS KPIs (Produção, Meta, %) ---
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

        // Ordena por maior produção
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

            // Controle de Fator
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

            // Badge de Contrato na Tabela
            const badgeContrato = (row.usuarios.contrato === 'CLT')
                ? `<span class="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1 rounded border border-blue-100">CLT</span>`
                : `<span class="ml-2 text-[9px] bg-purple-50 text-purple-600 px-1 rounded border border-purple-100">PJ</span>`;

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
        if (!confirm(`Aplicar fator ${novoFator} para TODOS?`)) {
            document.getElementById('bulk-fator').value = "";
            return;
        }
        const dataRef = document.getElementById('global-date').value;
        const { error } = await Produtividade.supabaseProdutividade.Geral = {
    META_DIARIA_POR_PESSOA: 120, // Meta padrão

    dadosView: [], 
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; 

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        if (modoVisualizacao === 'mes') {
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }
        
        // Carrega dados incluindo o contrato
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id, contrato)')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar:", error);
            return;
        }

        // Contexto de Dias Úteis
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

        // --- CÁLCULOS GERAIS ---
        let totalProducao = 0;
        let totalDiasPonderados = 0;

        let stats = {
            clt: { qtd: 0, producao: 0 },
            pj: { qtd: 0, producao: 0 }
        };

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalDiasPonderados += reg.dias_calc;

            const contrato = reg.usuarios && reg.usuarios.contrato ? reg.usuarios.contrato.toUpperCase() : 'PJ';
            const tipo = contrato === 'CLT' ? 'clt' : 'pj';

            stats[tipo].qtd++;
            stats[tipo].producao += reg.quantidade;
        });

        const pctCLT = totalProducao > 0 ? (stats.clt.producao / totalProducao) * 100 : 0;
        const pctPJ = totalProducao > 0 ? (stats.pj.producao / totalProducao) * 100 : 0;

        // --- ATUALIZAÇÃO DO CARD EQUIPE (HARD RESET) ---
        const elEquipe = document.getElementById('kpi-count-clt');
        if (elEquipe) {
            // 1. LIMPEZA TOTAL: Remove classes antigas do HTML que quebram o visual
            elEquipe.removeAttribute('class'); 
            
            // 2. APLICAÇÃO DE NOVO LAYOUT: Flex column limpo
            elEquipe.className = 'w-full flex flex-col justify-center gap-2 h-full py-1'; 
            
            // 3. INSERÇÃO DO HTML NOVO
            elEquipe.innerHTML = `
                <div class="flex items-center justify-between bg-blue-50/50 rounded px-3 py-1.5 border border-blue-100">
                    <div class="flex flex-col leading-tight">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CLT</span>
                        <div class="flex items-baseline gap-1">
                            <span class="text-sm font-bold text-slate-700">${stats.clt.qtd}</span>
                            <span class="text-[9px] text-slate-400">pessoas</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end leading-tight">
                        <span class="text-xs font-black text-blue-600">${pctCLT.toFixed(0)}%</span>
                        <span class="text-[9px] text-slate-400">produção</span>
                    </div>
                </div>

                <div class="flex items-center justify-between bg-purple-50/50 rounded px-3 py-1.5 border border-purple-100">
                    <div class="flex flex-col leading-tight">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PJ</span>
                        <div class="flex items-baseline gap-1">
                            <span class="text-sm font-bold text-slate-700">${stats.pj.qtd}</span>
                            <span class="text-[9px] text-slate-400">pessoas</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end leading-tight">
                        <span class="text-xs font-black text-purple-600">${pctPJ.toFixed(0)}%</span>
                        <span class="text-[9px] text-slate-400">produção</span>
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

            const badgeContrato = (row.usuarios.contrato === 'CLT')
                ? `<span class="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1 rounded border border-blue-100 font-bold">CLT</span>`
                : `<span class="ml-2 text-[9px] bg-purple-50 text-purple-600 px-1 rounded border border-purple-100 font-bold">PJ</span>`;

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