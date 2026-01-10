Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    
    init: function() { 
        const lastViewMode = localStorage.getItem('lastViewMode');
        if (lastViewMode) {
            document.getElementById('view-mode').value = lastViewMode;
        }
        this.toggleSemana(); 
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    toggleSemana: function() {
        const mode = document.getElementById('view-mode').value;
        localStorage.setItem('lastViewMode', mode);
        const sem = document.getElementById('select-semana');
        if(mode === 'semana') sem.classList.remove('hidden'); else sem.classList.add('hidden');
        if(this.initialized) this.carregarTela();
    },

    getSemanasDoMes: function(ano, mes) {
        let semanas = [];
        let dataAtual = new Date(ano, mes - 1, 1);
        const ultimoDiaMes = new Date(ano, mes, 0);
        while (dataAtual <= ultimoDiaMes) {
            let inicio = new Date(dataAtual);
            let fim = new Date(dataAtual);
            while (fim.getDay() !== 0 && fim < ultimoDiaMes) {
                fim.setDate(fim.getDate() + 1);
            }
            semanas.push({
                inicio: inicio.toISOString().split('T')[0],
                fim: fim.toISOString().split('T')[0]
            });
            dataAtual = new Date(fim);
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return semanas;
    },

    calcularDiasUteis: function(inicio, fim) {
        let count = 0;
        let cur = new Date(inicio + 'T12:00:00'); 
        const end = new Date(fim + 'T12:00:00');
        while(cur <= end) {
            const day = cur.getDay();
            if(day !== 0 && day !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        
        let dataSel = dateInput.value;
        if(!dataSel) { 
            dataSel = new Date().toISOString().split('T')[0]; 
            dateInput.value = dataSel; 
        }
        
        const [ano, mes, dia] = dataSel.split('-');
        let dataInicio, dataFim;

        if (viewMode === 'dia') {
            dataInicio = dataSel; dataFim = dataSel;
        } else if (viewMode === 'mes') {
            dataInicio = `${ano}-${mes}-01`;
            dataFim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;
        } else if (viewMode === 'semana') {
            const semanaSel = parseInt(document.getElementById('select-semana').value) - 1;
            const semanas = this.getSemanasDoMes(parseInt(ano), parseInt(mes));
            if (semanas[semanaSel]) {
                dataInicio = semanas[semanaSel].inicio;
                dataFim = semanas[semanaSel].fim;
            } else {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-slate-400">Semana inválida.</td></tr>';
                return;
            }
        }

        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator, justificativa,
                    usuario:usuarios ( id, nome, perfil, funcao, contrato )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;
            
            this.cacheData = data;
            this.cacheDatas = { start: dataInicio, end: dataFim };

            let dadosAgrupados = {};
            
            data.forEach(item => {
                const uid = item.usuario ? item.usuario.id : 'desconhecido';
                if(!dadosAgrupados[uid]) {
                    const metaBanco = 650;
                    dadosAgrupados[uid] = {
                        usuario: item.usuario || { nome: 'Desconhecido', perfil: 'user', funcao: 'Assistente', contrato: 'PJ' },
                        registros: [],
                        totais: { qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0 },
                        meta_real: metaBanco
                    };
                }
                
                dadosAgrupados[uid].registros.push(item);
                
                const d = dadosAgrupados[uid].totais;
                const f = Number(item.fator);
                
                d.qty += (Number(item.quantidade) || 0);
                d.fifo += (Number(item.fifo) || 0);
                d.gt += (Number(item.gradual_total) || 0);
                d.gp += (Number(item.gradual_parcial) || 0);
                d.fc += (Number(item.perfil_fc) || 0);
                
                d.dias += 1; 
                d.diasUteis += f; 
            });

            this.dadosOriginais = Object.values(dadosAgrupados);
            
            if (this.usuarioSelecionado) {
                this.filtrarUsuario(this.usuarioSelecionado, document.getElementById('selected-name').textContent);
            } else {
                this.renderizarTabela();
                this.atualizarKPIs(data, dataInicio, dataFim);
            }

        } catch (error) {
            console.error("Erro ao carregar:", error);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        const footer = document.getElementById('total-registros-footer');
        const viewMode = document.getElementById('view-mode').value;
        
        const mostrarDetalhes = (viewMode === 'dia' || this.usuarioSelecionado !== null);

        const lista = this.usuarioSelecionado 
            ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado)
            : this.dadosOriginais;

        tbody.innerHTML = '';
        
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        let totalLinhas = 0;

        lista.forEach(d => {
            const cargoExibicao = (d.usuario.funcao || 'Assistente').toUpperCase();
            const contratoExibicao = (d.usuario.contrato || 'PJ').toUpperCase();
            const metaBase = d.meta_real;
            const commonCellClass = "px-2 py-2 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

            if (mostrarDetalhes) {
                // === VISÃO DETALHADA (Dia a Dia) CONSOLIDADA ===
                const mapaDias = {};
                d.registros.forEach(r => {
                    const data = r.data_referencia;
                    if (!mapaDias[data]) {
                        mapaDias[data] = {
                            id: r.id, 
                            data_referencia: data,
                            fator: r.fator,
                            justificativa: r.justificativa,
                            quantidade: 0,
                            fifo: 0,
                            gradual_total: 0,
                            gradual_parcial: 0,
                            perfil_fc: 0
                        };
                    }
                    mapaDias[data].quantidade += (Number(r.quantidade) || 0);
                    mapaDias[data].fifo += (Number(r.fifo) || 0);
                    mapaDias[data].gradual_total += (Number(r.gradual_total) || 0);
                    mapaDias[data].gradual_parcial += (Number(r.gradual_parcial) || 0);
                    mapaDias[data].perfil_fc += (Number(r.perfil_fc) || 0);
                });

                const diasConsolidados = Object.values(mapaDias);
                diasConsolidados.sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));

                diasConsolidados.forEach(r => {
                    totalLinhas++;
                    const metaCalc = metaBase * r.fator;
                    const pct = metaCalc > 0 ? (r.quantidade / metaCalc) * 100 : 0;
                    
                    const [ano, mes, dia] = r.data_referencia.split('-');
                    const dataFormatada = `${dia}/${mes}`;

                    let corFator = 'bg-emerald-50 text-emerald-700';
                    if(r.fator == 0.5) corFator = 'bg-amber-50 text-amber-700';
                    if(r.fator == 0) corFator = 'bg-rose-50 text-rose-700';

                    let iconJustificativa = '';
                    if(r.justificativa && r.justificativa.trim() !== "") {
                        const textoSeguro = r.justificativa.replace(/"/g, '&quot;');
                        iconJustificativa = `<i class="fas fa-comment-alt text-blue-400 ml-1.5 custom-tooltip cursor-help text-[10px]" data-tooltip="${textoSeguro}"></i>`;
                    }

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                    
                    tr.innerHTML = `
                        <td class="px-2 py-2 text-center border-r border-slate-200">
                            <div class="flex items-center justify-center">
                                <select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" 
                                    class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none cursor-pointer w-full text-center">
                                    <option value="1" ${String(r.fator) === '1' ? 'selected' : ''}>100%</option>
                                    <option value="0.5" ${String(r.fator) === '0.5' ? 'selected' : ''}>50%</option>
                                    <option value="0" ${String(r.fator) === '0' ? 'selected' : ''}>Abonar</option>
                                </select>
                                ${iconJustificativa}
                            </div>
                        </td>
                        <td class="px-3 py-2 border-r border-slate-200">
                            <div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span>
                                    <span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 ml-2">${dataFormatada}</span>
                                </div>
                                <span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargoExibicao} • ${contratoExibicao}</span>
                            </div>
                        </td>
                        <td class="${commonCellClass}">${r.fator}</td>
                        <td class="${commonCellClass} font-bold text-blue-700 bg-blue-50/30">${r.quantidade}</td>
                        <td class="${commonCellClass}">${r.fifo || 0}</td>
                        <td class="${commonCellClass}">${r.gradual_total || 0}</td>
                        <td class="${commonCellClass}">${r.gradual_parcial || 0}</td>
                        <td class="${commonCellClass} bg-slate-50 text-[10px]">${Math.round(metaCalc)}</td>
                        <td class="px-2 py-2 text-center">
                             <div class="flex items-center justify-center gap-1">
                                 <span class="${pct >= 100 ? 'text-emerald-700 font-black' : 'text-amber-600 font-bold'} text-xs">
                                    ${Math.round(pct)}%
                                </span>
                             </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

            } else {
                // === VISÃO AGRUPADA ===
                totalLinhas++;
                const metaTotal = metaBase * d.totais.diasUteis;
                const pct = metaTotal > 0 ? (d.totais.qty / metaTotal) * 100 : 0;
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                tr.innerHTML = `
                     <td class="px-2 py-2 text-center border-r border-slate-200 text-[10px] text-slate-400 italic bg-slate-50">
                        --
                    </td>
                    <td class="px-3 py-2 border-r border-slate-200">
                         <div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                            <span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span>
                            <span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargoExibicao} • ${contratoExibicao}</span>
                        </div>
                    </td>
                    <td class="${commonCellClass} font-bold text-slate-700">
                        ${d.totais.diasUteis}
                    </td>
                    <td class="${commonCellClass} font-bold text-blue-700 bg-blue-50/30">${d.totais.qty}</td>
                    <td class="${commonCellClass}">${d.totais.fifo}</td>
                    <td class="${commonCellClass}">${d.totais.gt}</td>
                    <td class="${commonCellClass}">${d.totais.gp}</td>
                    <td class="${commonCellClass} bg-slate-50 text-[10px]">${Math.round(metaTotal)}</td>
                    <td class="px-2 py-2 text-center">
                         <div class="flex items-center justify-center gap-1">
                             <span class="${pct >= 100 ? 'text-emerald-700 font-black' : 'text-amber-600 font-bold'} text-xs">
                                ${Math.round(pct)}%
                            </span>
                         </div>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });
        
        if(footer) footer.innerText = totalLinhas;
        
        if(lista.length === 0) {
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado para este período.</td></tr>';
        }
    },
    
    filtrarUsuario: function(id, nome) {
        this.usuarioSelecionado = id;
        document.getElementById('selection-header').classList.remove('hidden');
        document.getElementById('selected-name').textContent = nome;
        this.renderizarTabela();
        const dadosFiltrados = this.cacheData.filter(r => r.usuario.id == id);
        this.atualizarKPIs(dadosFiltrados, this.cacheDatas.start, this.cacheDatas.end);
    },

    limparSelecao: function() {
        this.usuarioSelecionado = null;
        document.getElementById('selection-header').classList.add('hidden');
        this.renderizarTabela();
        this.atualizarKPIs(this.cacheData, this.cacheDatas.start, this.cacheDatas.end);
    },

    // --- NOVA LÓGICA DE KPIS ---
    atualizarKPIs: function(data, dataInicio, dataFim) {
        let totalProdGeral = 0;
        let metaTotalGeral = 0;
        let diasComProd = new Set();
        let totalDiasTrabalhadosPonderados = 0; // Para calcular média diária
        
        // Estruturas para Equipe e Top Performance
        let usersCLT = new Set();
        let usersPJ = new Set();
        let ranking = {}; // Mapa para agrupar produção por usuário
        
        const isSingleUser = this.usuarioSelecionado !== null;

        data.forEach(r => {
            const qtd = Number(r.quantidade) || 0;
            const metaUser = 650;
            const fator = Number(r.fator) || 0;
            const metaCalc = metaUser * fator;
            
            totalProdGeral += qtd;
            metaTotalGeral += metaCalc;
            diasComProd.add(r.data_referencia);
            
            // Só soma para média se não for abono total (fator > 0)
            if (fator > 0) totalDiasTrabalhadosPonderados += fator;

            const contrato = (r.usuario && r.usuario.contrato) ? String(r.usuario.contrato).toUpperCase() : 'PJ';
            if(contrato === 'CLT') usersCLT.add(r.usuario.id); else usersPJ.add(r.usuario.id);

            // Monta Ranking (Ignora Gestão/Auditoria para o Top 3 se quiser focar na operação)
            const cargo = r.usuario && r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (cargo !== 'AUDITORA' && cargo !== 'GESTORA') {
                if(!ranking[r.usuario.id]) ranking[r.usuario.id] = { nome: r.usuario.nome, total: 0 };
                ranking[r.usuario.id].total += qtd;
            }
        });

        // 1. KPI PRODUÇÃO (Atingido vs Esperado)
        document.getElementById('kpi-total').innerText = totalProdGeral.toLocaleString('pt-BR');
        document.getElementById('kpi-meta-total').innerText = Math.round(metaTotalGeral).toLocaleString('pt-BR');
        
        // Barra de progresso da Produção (Opcional, usando a mesma lógica do atingimento)
        const pctProd = metaTotalGeral > 0 ? (totalProdGeral / metaTotalGeral) * 100 : 0;
        const barProd = document.getElementById('kpi-prod-bar');
        if(barProd) {
             barProd.style.width = Math.min(pctProd, 100) + '%';
             barProd.className = pctProd >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
        }

        // 2. KPI ATINGIMENTO (% vs 100%)
        document.getElementById('kpi-pct').innerText = Math.round(pctProd) + '%';
        const barPct = document.getElementById('kpi-pct-bar');
        if(barPct) {
            barPct.style.width = Math.min(pctProd, 100) + '%';
            barPct.className = pctProd >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-slate-300 rounded-full";
        }

        // 3. KPI EQUIPE (% de cada)
        const clt = usersCLT.size;
        const pj = usersPJ.size;
        const totalEquipe = clt + pj;
        const pctClt = totalEquipe > 0 ? Math.round((clt / totalEquipe) * 100) : 0;
        const pctPj = totalEquipe > 0 ? Math.round((pj / totalEquipe) * 100) : 0;

        document.getElementById('kpi-clt-val').innerText = `${clt} (${pctClt}%)`;
        document.getElementById('kpi-pj-val').innerText = `${pj} (${pctPj}%)`;
        
        const barClt = document.getElementById('kpi-clt-bar');
        if(barClt) barClt.style.width = pctClt + '%';
        
        const barPj = document.getElementById('kpi-pj-bar');
        if(barPj) barPj.style.width = pctPj + '%';
        
        // 4. KPI DIAS ÚTEIS e MÉDIA (Dividido)
        const diasUteisCalendario = this.calcularDiasUteis(dataInicio, dataFim);
        const diasTrabalhadosReal = diasComProd.size; 
        document.getElementById('kpi-dias-val').innerText = `${diasTrabalhadosReal} / ${diasUteisCalendario}`;
        
        // Média: Produção Total / Total de Dias-Pessoa Trabalhados
        const media = totalDiasTrabalhadosPonderados > 0 ? Math.round(totalProdGeral / totalDiasTrabalhadosPonderados) : 0;
        document.getElementById('kpi-media-todas').innerText = media;

        // 5. KPI TOP PERFORMANCE (Top 3)
        const listaRanking = Object.values(ranking).sort((a, b) => b.total - a.total).slice(0, 3);
        const containerTop3 = document.getElementById('kpi-top3-list');
        if(containerTop3) {
            if (listaRanking.length === 0) {
                containerTop3.innerHTML = '<div class="text-[10px] text-slate-400 italic text-center mt-2">Sem dados</div>';
            } else {
                let htmlRanking = '';
                listaRanking.forEach((u, index) => {
                    const colors = ['text-yellow-500', 'text-slate-400', 'text-amber-700']; // Ouro, Prata, Bronze
                    htmlRanking += `
                        <div class="flex justify-between items-center text-[10px] border-b border-slate-50 last:border-0 pb-0.5">
                            <span class="font-bold text-slate-600 truncate max-w-[90px]">
                                <i class="fas fa-trophy ${colors[index]} mr-1 text-[9px]"></i>${u.nome.split(' ')[0]}
                            </span>
                            <span class="font-black text-slate-800">${u.total}</span>
                        </div>
                    `;
                });
                containerTop3.innerHTML = htmlRanking;
            }
        }
    },

    mudarFator: async function(id, novoFatorStr) {
        const novoFator = String(novoFatorStr); 
        let justificativa = null;

        if (novoFator === '0' || novoFator === '0.5') {
            await new Promise(r => setTimeout(r, 10));
            const tipoAbono = novoFator === '0' ? "ABONO TOTAL" : "MEIO PERÍODO";
            justificativa = prompt(`Informe a justificativa para ${tipoAbono} (obrigatório):`);
            if (justificativa === null || justificativa.trim() === "") {
                alert("Ação cancelada: A justificativa é obrigatória.");
                this.renderizarTabela(); 
                return;
            }
        }

        try {
            const { error } = await Sistema.supabase.from('producao').update({ fator: novoFator, justificativa: justificativa }).eq('id', id);
            if (error) throw error;
            
            let usuarioIdAfetado = null;
            this.dadosOriginais.forEach(group => {
                group.registros.forEach(r => {
                    if(r.id == id) { r.fator = novoFator; r.justificativa = justificativa; usuarioIdAfetado = group.usuario.id; }
                });
                if(usuarioIdAfetado === group.usuario.id) {
                    let d = group.totais; d.diasUteis = 0;
                    group.registros.forEach(r => d.diasUteis += Number(r.fator));
                }
            });
            this.renderizarTabela(); this.carregarTela(); 
        } catch (error) { console.error(error); alert("Erro ao salvar: " + error.message); }
    },

    mudarFatorTodos: async function(novoFator) {
        if(!novoFator) return;
        if(!confirm("Aplicar a TODOS os visíveis?")) { document.getElementById('bulk-fator').value = ""; return; }
        
        let justificativa = null;
        if (['0', '0.5'].includes(String(novoFator))) {
            justificativa = prompt("Justificativa para ação em massa:");
            if (!justificativa) { alert("Justificativa obrigatória."); document.getElementById('bulk-fator').value = ""; return; }
        }

        const ids = [];
        const lista = this.usuarioSelecionado ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) : this.dadosOriginais;
        lista.forEach(g => g.registros.forEach(r => ids.push(r.id)));

        try {
            const { error } = await Sistema.supabase.from('producao').update({ fator: novoFator, justificativa: justificativa }).in('id', ids);
            if(error) throw error;
            this.carregarTela(); document.getElementById('bulk-fator').value = "";
        } catch (e) { alert("Erro ao atualizar."); }
    },

    excluirDadosDia: async function() {
        if(!confirm("Excluir dados do período selecionado?")) return;
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        let s, e, [ano, mes] = dateInput.value.split('-');

        if (viewMode === 'dia') { s = dateInput.value; e = dateInput.value; }
        else if (viewMode === 'mes') { s = `${ano}-${mes}-01`; e = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`; }
        else return alert("Selecione Dia ou Mês para excluir.");

        try {
            const { error } = await Sistema.supabase.from('producao').delete().gte('data_referencia', s).lte('data_referencia', e);
            if(error) throw error;
            this.carregarTela();
        } catch(err) { alert("Erro ao excluir: " + err.message); }
    }
};