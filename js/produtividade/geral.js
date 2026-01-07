Produtividade.Geral = {
    META_PADRAO: 650, // Meta padrão corrigida para 650
    usuarioSelecionado: null,

    dadosView: [], 
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        const weekSelectEl = document.getElementById('select-semana');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; 
        
        // --- 1. CONTROLE DE INTERFACE (VISIBILIDADE) ---
        // Fazemos isso aqui dentro para garantir que a tela esteja sempre no estado certo
        if (weekSelectEl) {
            if (modoVisualizacao === 'semana') weekSelectEl.classList.remove('hidden');
            else weekSelectEl.classList.add('hidden');
        }
        
        const ctrlFatorMassa = document.getElementById('bulk-fator');
        if (ctrlFatorMassa) {
            ctrlFatorMassa.disabled = (modoVisualizacao !== 'dia');
        }

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        // --- 2. DEFINIÇÃO DO PERÍODO DE BUSCA ---
        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        if (modoVisualizacao === 'mes') {
            // Do dia 01 ao último dia do mês
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        } 
        else if (modoVisualizacao === 'semana') {
            // Calcula intervalo da semana (1-7, 8-14...)
            const numSemana = parseInt(weekSelectEl ? weekSelectEl.value : 1);
            const diaInicioSemana = (numSemana - 1) * 7 + 1;
            let diaFimSemana = numSemana * 7;
            const ultimoDiaMes = new Date(ano, mes, 0).getDate();
            
            if (diaFimSemana > ultimoDiaMes) diaFimSemana = ultimoDiaMes;
            
            if (diaInicioSemana > ultimoDiaMes) {
                // Caso a semana comece depois do fim do mês
                dataInicio = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDiaMes}`;
                dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDiaMes}`;
            } else {
                dataInicio = `${ano}-${String(mes).padStart(2, '0')}-${String(diaInicioSemana).padStart(2, '0')}`;
                dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(diaFimSemana).padStart(2, '0')}`;
            }
        }
        
        // --- 3. CARREGAMENTO DE DADOS ---
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id, contrato)')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar produção:", error);
            return;
        }

        const { data: metasDb } = await Produtividade.supabase
            .from('metas')
            .select('*')
            .order('data_inicio', { ascending: true });

        // --- 4. CONTEXTO DE DIAS ÚTEIS ---
        // Se for visualização de DIA, queremos o contexto do MÊS (ex: "Dia 5/22")
        // Se for Mês/Semana, queremos o contexto daquele período
        let inicioContexto = dataInicio;
        let fimContexto = dataFim;
        
        if (modoVisualizacao === 'dia') {
             inicioContexto = `${ano}-${String(mes).padStart(2, '0')}-01`;
             const ultimoDia = new Date(ano, mes, 0).getDate();
             fimContexto = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }

        const { data: diasDb } = await Produtividade.supabase
            .from('producao')
            .select('data_referencia')
            .gte('data_referencia', inicioContexto)
            .lte('data_referencia', fimContexto);

        const diasUnicosSet = new Set(diasDb ? diasDb.map(d => d.data_referencia) : []);
        const diasTrabalhadosTime = Array.from(diasUnicosSet).sort();

        this.processarDados(producao, metasDb || [], modoVisualizacao, diasTrabalhadosTime, inicioContexto, fimContexto);
    },

    processarDados: function(dadosBrutos, listaMetas, modo, diasTrabalhadosTime, inicioContexto, fimContexto) {
        let dadosAgrupados = [];

        const getMetaParaData = (uid, dataRefString) => {
            const metasUser = listaMetas.filter(m => m.usuario_id == uid);
            const metaVigente = metasUser.filter(m => m.data_inicio <= dataRefString).pop();
            return metaVigente ? metaVigente.valor_meta : this.META_PADRAO;
        };

        // AGRUPAMENTO
        if (modo === 'mes' || modo === 'semana') {
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
                        dias_calc: 0,
                        meta_acumulada: 0,
                        dias_unicos_set: new Set() 
                    };
                }
                mapa[uid].quantidade += (row.quantidade || 0);
                mapa[uid].fifo += (row.fifo || 0);
                mapa[uid].gradual_total += (row.gradual_total || 0);
                mapa[uid].gradual_parcial += (row.gradual_parcial || 0);
                mapa[uid].perfil_fc += (row.perfil_fc || 0);
                
                const fator = (row.fator !== undefined && row.fator !== null) ? row.fator : 1;
                mapa[uid].dias_calc += fator;
                mapa[uid].dias_unicos_set.add(row.data_referencia);

                const metaDoDia = getMetaParaData(uid, row.data_referencia);
                mapa[uid].meta_acumulada += Math.round(metaDoDia * fator);
            });
            dadosAgrupados = Object.values(mapa).map(u => ({ ...u, dias_unicos_count: u.dias_unicos_set.size }));
        } else {
            // MODO DIA
            dadosAgrupados = dadosBrutos.map(row => {
                const fator = (row.fator !== undefined && row.fator !== null) ? row.fator : 1;
                const metaDoDia = getMetaParaData(row.usuario_id, row.data_referencia);
                return { 
                    ...row, 
                    fator: fator, 
                    dias_calc: fator,
                    meta_acumulada: Math.round(metaDoDia * fator),
                    dias_unicos_count: 1
                };
            });
        }

        // FILTRO DE USUÁRIO
        const elHeader = document.getElementById('selection-header');
        const elName = document.getElementById('selected-name');
        let dadosFiltrados = dadosAgrupados;
        
        if (this.usuarioSelecionado) {
            dadosFiltrados = dadosAgrupados.filter(d => d.usuario_id == this.usuarioSelecionado.id);
            if(elHeader) elHeader.classList.remove('hidden');
            if(elName) elName.innerText = this.usuarioSelecionado.nome;
        } else {
            if(elHeader) elHeader.classList.add('hidden');
            if(elName) elName.innerText = "";
        }

        this.dadosView = dadosFiltrados;
        this.atualizarKPIs(dadosFiltrados, diasTrabalhadosTime, inicioContexto, fimContexto, modo);
        this.renderizarTabela(modo);
    },

    atualizarKPIs: function(dados, diasTrabalhadosTime, inicioContexto, fimContexto, modo) {
        // --- KPI DIAS ÚTEIS ---
        let diasComDados = 0;
        if (this.usuarioSelecionado && dados.length > 0) {
            diasComDados = dados[0].dias_unicos_count || 0;
        } else {
            diasComDados = diasTrabalhadosTime.length;
        }

        const getDiasUteisIntervalo = (inicio, fim) => {
            let count = 0;
            let curr = new Date(inicio + 'T00:00:00');
            let end = new Date(fim + 'T00:00:00');
            while (curr <= end) {
                const wd = curr.getDay();
                if (wd !== 0 && wd !== 6) count++;
                curr.setDate(curr.getDate() + 1);
            }
            return count;
        };
        const totalUteis = getDiasUteisIntervalo(inicioContexto, fimContexto);

        if(document.getElementById('kpi-dias-val')) document.getElementById('kpi-dias-val').innerText = diasComDados;
        if(document.getElementById('kpi-dias-total')) document.getElementById('kpi-dias-total').innerText = `/ ${totalUteis}`;

        // --- TOTAIS ---
        let totalProducao = 0;
        let totalMeta = 0;
        let totalDiasPonderados = 0;

        let stats = {
            clt: { qtd: 0, producao: 0 },
            pj: { qtd: 0, producao: 0 }
        };

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalMeta += reg.meta_acumulada;
            totalDiasPonderados += reg.dias_calc;

            const contrato = reg.usuarios && reg.usuarios.contrato ? reg.usuarios.contrato.toUpperCase() : 'PJ';
            const tipo = (contrato === 'CLT') ? 'clt' : 'pj';

            stats[tipo].qtd++;
            stats[tipo].producao += reg.quantidade;
        });

        const pctCLT = totalProducao > 0 ? (stats.clt.producao / totalProducao) * 100 : 0;
        const pctPJ = totalProducao > 0 ? (stats.pj.producao / totalProducao) * 100 : 0;

        if(document.getElementById('kpi-clt-val')) document.getElementById('kpi-clt-val').innerText = `${stats.clt.qtd} (${pctCLT.toFixed(0)}%)`;
        if(document.getElementById('kpi-clt-bar')) document.getElementById('kpi-clt-bar').style.width = `${pctCLT}%`;
        
        if(document.getElementById('kpi-pj-val')) document.getElementById('kpi-pj-val').innerText = `${stats.pj.qtd} (${pctPJ.toFixed(0)}%)`;
        if(document.getElementById('kpi-pj-bar')) document.getElementById('kpi-pj-bar').style.width = `${pctPJ}%`;

        const atingimento = totalMeta > 0 ? (totalProducao / totalMeta) * 100 : 0;
        const mediaProducao = totalDiasPonderados > 0 ? Math.round(totalProducao / totalDiasPonderados) : 0;
        // Se a meta calculada for 0 (ninguém trabalhou ou abonado), mostra a padrão
        const mediaMeta = totalDiasPonderados > 0 ? Math.round(totalMeta / totalDiasPonderados) : this.META_PADRAO;

        if(document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = totalProducao.toLocaleString('pt-BR');
        if(document.getElementById('kpi-meta-total')) document.getElementById('kpi-meta-total').innerText = totalMeta.toLocaleString('pt-BR');
        
        if(document.getElementById('kpi-pct')) document.getElementById('kpi-pct').innerText = atingimento.toFixed(1) + "%";
        if(document.getElementById('kpi-pct-bar')) document.getElementById('kpi-pct-bar').style.width = `${Math.min(atingimento, 100)}%`;

        if(document.getElementById('kpi-media-todas')) document.getElementById('kpi-media-todas').innerText = mediaProducao;
        if(document.getElementById('kpi-meta-individual')) document.getElementById('kpi-meta-individual').innerText = mediaMeta;
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
            const metaIndividual = row.meta_acumulada;
            const pct = metaIndividual > 0 ? (row.quantidade / metaIndividual) * 100 : 0;
            
            let corStatus = "text-red-600 bg-red-50";
            if (pct >= 100) corStatus = "text-emerald-600 bg-emerald-50";
            else if (pct >= 80) corStatus = "text-yellow-600 bg-yellow-50";
            
            let pctTexto = pct.toFixed(0) + "%";
            if (metaIndividual === 0) {
                corStatus = "text-slate-500 bg-slate-100";
                pctTexto = "Abn";
            }

            let ctrlFator = `<span class="text-xs font-bold text-slate-500">${Number(row.dias_calc).toLocaleString('pt-BR')}d</span>`;
            if (modo === 'dia') {
                const valFator = (row.fator !== undefined) ? row.fator : 1;
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

            let badgeContrato = '';
            let nomeUsuario = 'Desconhecido';
            let uid = row.usuario_id; 

            if (row.usuarios) {
                nomeUsuario = row.usuarios.nome;
                if (row.usuarios.contrato === 'CLT') {
                    badgeContrato = `<span class="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1 rounded border border-blue-100 font-bold">CLT</span>`;
                } else {
                    badgeContrato = `<span class="ml-2 text-[9px] bg-purple-50 text-purple-600 px-1 rounded border border-purple-100 font-bold">PJ</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="px-4 py-3 text-center">${ctrlFator}</td>
                <td class="px-6 py-3 font-bold text-slate-700 cursor-pointer hover:text-blue-600 hover:underline underline-offset-2 transition"
                    onclick="Produtividade.Geral.selecionarUsuario('${uid}', '${nomeUsuario}')" title="Clique para ver detalhes">
                    ${nomeUsuario} ${badgeContrato}
                </td>
                <td class="px-6 py-3 text-center text-slate-500 font-bold bg-slate-50/50">${Number(row.dias_calc).toLocaleString('pt-BR')}</td>
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

    // Função auxiliar para o botão de troca de modo
    toggleSemana: function() {
        this.carregarTela();
    },

    selecionarUsuario: function(id, nome) {
        this.usuarioSelecionado = { id, nome };
        this.carregarTela(); 
    },

    limparSelecao: function() {
        this.usuarioSelecionado = null;
        this.carregarTela();
    },

    mudarFatorIndividual: async function(prodId, novoFator) {
        if (!prodId || novoFator === undefined) return;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('id', prodId);
        if (error) alert("Erro: " + error.message);
        else this.carregarTela();
    },

    mudarFatorTodos: async function(novoFator) {
        if (novoFator === "") return;
        if (!confirm(`Aplicar fator ${novoFator} para TODOS?`)) {
            document.getElementById('bulk-fator').value = "";
            return;
        }
        const dataRef = document.getElementById('global-date').value;
        const { error } = await Produtividade.supabase
            .from('producao')
            .update({ fator: parseFloat(novoFator) })
            .eq('data_referencia', dataRef);
        if (error) alert("Erro: " + error.message);
        else this.carregarTela();
        document.getElementById('bulk-fator').value = "";
    },
    
    excluirDadosDia: async function() {
        if(!confirm("Excluir dados visualizados?")) return;
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        const data = dateInput.value;
        
        let query = Produtividade.supabase.from('producao').delete();
        
        const [ano, mes] = data.split('-');
        
        if (viewMode === 'mes') {
            const inicio = `${ano}-${mes}-01`;
            const fim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;
            query = query.gte('data_referencia', inicio).lte('data_referencia', fim);
        } else if (viewMode === 'semana') {
            const weekEl = document.getElementById('select-semana');
            const numSemana = parseInt(weekEl.value || 1);
            const diaInicio = (numSemana - 1) * 7 + 1;
            const diaFim = Math.min(numSemana * 7, new Date(ano, mes, 0).getDate());
            const dIni = `${ano}-${mes}-${String(diaInicio).padStart(2,'0')}`;
            const dFim = `${ano}-${mes}-${String(diaFim).padStart(2,'0')}`;
            query = query.gte('data_referencia', dIni).lte('data_referencia', dFim);
        } else {
            query = query.eq('data_referencia', data);
        }
        
        const { error } = await query;
        if(!error) this.carregarTela();
        else alert("Erro: " + error.message);
    }
};