Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [],
    usuarioSelecionado: null,
    
    init: function() { 
        this.toggleSemana(); 
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    toggleSemana: function() {
        const mode = document.getElementById('view-mode').value;
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

    // Nova função para calcular dias úteis (Seg-Sex)
    calcularDiasUteis: function(inicio, fim) {
        let count = 0;
        let cur = new Date(inicio + 'T12:00:00'); // Hora fixa para evitar fuso
        const end = new Date(fim + 'T12:00:00');
        
        while(cur <= end) {
            const day = cur.getDay();
            if(day !== 0 && day !== 6) { // 0=Domingo, 6=Sábado
                count++;
            }
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
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-slate-400">Semana inválida para este mês.</td></tr>';
                return;
            }
        }

        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator, justificativa,
                    usuario:usuarios ( id, nome, perfil, cargo, meta_diaria )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;
            
            let dadosAgrupados = {};
            data.forEach(item => {
                const uid = item.usuario ? item.usuario.id : 'desconhecido';
                
                if(!dadosAgrupados[uid]) {
                    // Garante a leitura da meta do banco
                    const metaBanco = item.usuario ? Number(item.usuario.meta_diaria) : 0;
                    
                    dadosAgrupados[uid] = {
                        usuario: item.usuario || { nome: 'Desconhecido', perfil: 'PJ', cargo: 'Assistente', meta_diaria: 650 },
                        registros: [],
                        totais: { qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0 },
                        meta_real: metaBanco > 0 ? metaBanco : 650 // Usa a meta do banco ou 650 se for zero/null
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
            this.renderizarTabela();
            
            // Passamos as datas para o cálculo correto dos dias úteis
            this.atualizarKPIs(data, dataInicio, dataFim);

        } catch (error) {
            console.error("Erro ao carregar:", error);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        const lista = this.usuarioSelecionado 
            ? this.dadosOriginais.filter(d => d.usuario.id === this.usuarioSelecionado)
            : this.dadosOriginais;

        tbody.innerHTML = '';
        
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        lista.forEach(d => {
            const isDia = document.getElementById('view-mode').value === 'dia';
            
            const cargoExibicao = (d.usuario.cargo || 'Assistente').toUpperCase();
            
            let perfilRaw = (d.usuario.perfil || 'PJ').toUpperCase();
            if (perfilRaw === 'USER') perfilRaw = 'PJ'; 
            const perfilExibicao = perfilRaw;

            const metaBase = d.meta_real;

            if (isDia && d.registros.length === 1) {
                const r = d.registros[0];
                const metaCalc = metaBase * r.fator;
                const pct = metaCalc > 0 ? (r.quantidade / metaCalc) * 100 : 0;
                
                let corFator = 'bg-green-50 text-green-700 border-green-200';
                if(r.fator == 0.5) corFator = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                if(r.fator == 0) corFator = 'bg-red-50 text-red-700 border-red-200';

                let iconJustificativa = '';
                if(r.justificativa && r.justificativa.trim() !== "") {
                    const textoSeguro = r.justificativa.replace(/"/g, '&quot;');
                    iconJustificativa = `<i class="fas fa-question-circle text-blue-500 ml-2 custom-tooltip" data-tooltip="${textoSeguro}"></i>`;
                }

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
                
                tr.innerHTML = `
                    <td class="px-4 py-3 text-center border-r border-slate-100 w-28">
                        <div class="flex items-center justify-center relative">
                            <select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" 
                                class="${corFator} text-[10px] font-bold border rounded px-1 py-1 outline-none cursor-pointer w-20 appearance-none text-center">
                                <option value="1" ${String(r.fator) === '1' ? 'selected' : ''}>100%</option>
                                <option value="0.5" ${String(r.fator) === '0.5' ? 'selected' : ''}>50%</option>
                                <option value="0" ${String(r.fator) === '0' ? 'selected' : ''}>Abonar</option>
                            </select>
                            ${iconJustificativa}
                        </div>
                    </td>
                    <td class="px-6 py-3 font-bold text-slate-700">
                        <div class="flex items-center gap-2 cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                             <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                ${(d.usuario.nome || 'U').substring(0,2).toUpperCase()}
                            </div>
                            <div class="flex flex-col">
                                <span>${d.usuario.nome}</span>
                                <span class="text-[9px] text-slate-400 font-bold text-blue-600 uppercase tracking-wider">
                                    ${cargoExibicao} <span class="text-slate-300 mx-1">•</span> ${perfilExibicao}
                                </span>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-3 text-center font-bold text-slate-500 text-xs">${r.fator}</td>
                    <td class="px-6 py-3 text-center">
                         <input type="number" value="${r.quantidade}" disabled
                            class="w-16 text-center bg-slate-100 cursor-not-allowed border border-slate-200 rounded px-1 py-0.5 text-slate-500 font-bold outline-none">
                    </td>
                    <td class="px-6 py-3 text-center text-slate-500">${r.fifo || 0}</td>
                    <td class="px-6 py-3 text-center text-slate-500">${r.gradual_total || 0}</td>
                    <td class="px-6 py-3 text-center text-slate-500">${r.gradual_parcial || 0}</td>
                    <td class="px-6 py-3 text-center font-bold text-slate-400 text-xs">${Math.round(metaCalc)}</td>
                    <td class="px-6 py-3 text-center">
                         <span class="${pct >= 100 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-amber-600 bg-amber-50 border-amber-100'} px-2 py-1 rounded text-xs font-black border">
                            ${Math.round(pct)}%
                        </span>
                    </td>
                `;
                tbody.appendChild(tr);
            } else {
                const metaTotal = metaBase * d.totais.diasUteis;
                const pct = metaTotal > 0 ? (d.totais.qty / metaTotal) * 100 : 0;
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
                tr.innerHTML = `
                     <td class="px-4 py-3 text-center border-r border-slate-100 w-28 text-xs text-slate-400 italic">
                        Agrupado
                    </td>
                    <td class="px-6 py-3 font-bold text-slate-700">
                        <div class="flex items-center gap-2 cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                             <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                ${(d.usuario.nome || 'U').substring(0,2).toUpperCase()}
                            </div>
                             <div class="flex flex-col">
                                <span>${d.usuario.nome}</span>
                                <span class="text-[9px] text-slate-400 font-bold text-blue-600 uppercase tracking-wider">
                                    ${cargoExibicao} <span class="text-slate-300 mx-1">•</span> ${perfilExibicao}
                                </span>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-3 text-center font-bold text-slate-500 text-xs">${d.totais.diasUteis} / ${d.totais.dias}</td>
                    <td class="px-6 py-3 text-center font-bold text-blue-700">${d.totais.qty}</td>
                    <td class="px-6 py-3 text-center text-slate-500">${d.totais.fifo}</td>
                    <td class="px-6 py-3 text-center text-slate-500">${d.totais.gt}</td>
                    <td class="px-6 py-3 text-center text-slate-500">${d.totais.gp}</td>
                    <td class="px-6 py-3 text-center font-bold text-slate-400 text-xs">${Math.round(metaTotal)}</td>
                    <td class="px-6 py-3 text-center">
                         <span class="${pct >= 100 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-amber-600 bg-amber-50 border-amber-100'} px-2 py-1 rounded text-xs font-black border">
                            ${Math.round(pct)}%
                        </span>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });
        
        if(lista.length === 0) {
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400">Nenhum registro encontrado para este período.</td></tr>';
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
        } else {
            justificativa = null;
        }

        try {
            const { error } = await Sistema.supabase
                .from('producao')
                .update({ fator: novoFator, justificativa: justificativa })
                .eq('id', id);

            if (error) throw error;
            
            let usuarioIdAfetado = null;
            this.dadosOriginais.forEach(group => {
                group.registros.forEach(r => {
                    if(r.id == id) {
                        r.fator = novoFator; 
                        r.justificativa = justificativa; 
                        usuarioIdAfetado = group.usuario.id;
                    }
                });
                if(usuarioIdAfetado === group.usuario.id) {
                    let d = group.totais; 
                    d.diasUteis = 0;
                    group.registros.forEach(r => d.diasUteis += Number(r.fator));
                }
            });
            
            this.renderizarTabela(); 
            this.carregarTela(); 

        } catch (error) {
            console.error(error);
            alert("Erro ao salvar: " + error.message);
        }
    },

    mudarFatorTodos: async function(novoFator) {
        if(!novoFator) return;
        if(!confirm("Tem certeza que deseja aplicar isso a TODOS os registros visíveis?")) {
            document.getElementById('bulk-fator').value = "";
            return;
        }

        let justificativa = null;
        if (String(novoFator) === '0' || String(novoFator) === '0.5') {
            justificativa = prompt("Informe a justificativa para a ação em massa:");
            if (justificativa === null || justificativa.trim() === "") {
                alert("Justificativa obrigatória.");
                document.getElementById('bulk-fator').value = "";
                return;
            }
        }

        const ids = [];
        const lista = this.usuarioSelecionado 
            ? this.dadosOriginais.filter(d => d.usuario.id === this.usuarioSelecionado)
            : this.dadosOriginais;

        lista.forEach(g => g.registros.forEach(r => ids.push(r.id)));

        if(ids.length === 0) return;

        try {
            const { error } = await Sistema.supabase
                .from('producao')
                .update({ fator: novoFator, justificativa: justificativa })
                .in('id', ids);

            if(error) throw error;
            
            this.carregarTela();
            document.getElementById('bulk-fator').value = "";
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar em massa.");
        }
    },

    excluirDadosDia: async function() {
        if(!confirm("Isso apagará TODOS os dados de produção do período selecionado na tela. Continuar?")) return;
        
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        let dataSel = dateInput.value;
        const [ano, mes, dia] = dataSel.split('-');
        let s, e;

        if (viewMode === 'dia') { s = dataSel; e = dataSel; }
        else if (viewMode === 'mes') { s = `${ano}-${mes}-01`; e = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`; }
        else return alert("Modo de exclusão não suportado (use dia ou mês).");

        try {
            const { error } = await Sistema.supabase
                .from('producao')
                .delete()
                .gte('data_referencia', s)
                .lte('data_referencia', e);

            if(error) throw error;
            this.carregarTela();
        } catch(err) {
            alert("Erro ao excluir: " + err.message);
        }
    },

    filtrarUsuario: function(id, nome) {
        this.usuarioSelecionado = id;
        document.getElementById('selection-header').classList.remove('hidden');
        document.getElementById('selected-name').textContent = nome;
        this.renderizarTabela();
    },

    limparSelecao: function() {
        this.usuarioSelecionado = null;
        document.getElementById('selection-header').classList.add('hidden');
        this.renderizarTabela();
    },

    // ATUALIZADO: Recebe datas para calcular dias úteis do calendário
    atualizarKPIs: function(data, dataInicio, dataFim) {
        let totalProd = 0;
        let metaTotal = 0;
        let diasComProd = new Set();
        let usersCLT = new Set();
        let usersPJ = new Set();
        
        data.forEach(r => {
            totalProd += (Number(r.quantidade) || 0);
            
            const metaUser = Number(r.usuario.meta_diaria) > 0 ? Number(r.usuario.meta_diaria) : 650;
            metaTotal += (metaUser * r.fator);
            
            diasComProd.add(r.data_referencia);
            
            let perfil = String(r.usuario.perfil).trim().toUpperCase();
            if(perfil === 'USER') perfil = 'PJ'; 

            if(perfil === 'CLT') {
                usersCLT.add(r.usuario.id);
            } else {
                usersPJ.add(r.usuario.id);
            }
        });

        const pct = metaTotal > 0 ? (totalProd / metaTotal) * 100 : 0;
        document.getElementById('kpi-total').innerText = totalProd.toLocaleString('pt-BR');
        document.getElementById('kpi-meta-total').innerText = Math.round(metaTotal).toLocaleString('pt-BR');
        document.getElementById('kpi-pct').innerText = Math.round(pct) + '%';
        
        const bar = document.getElementById('kpi-pct-bar');
        if(bar) {
            bar.style.width = Math.min(pct, 100) + '%';
            bar.className = pct >= 100 
                ? "h-full bg-emerald-400 rounded-full transition-all duration-500" 
                : "h-full bg-white/90 rounded-full transition-all duration-500";
        }

        const clt = usersCLT.size;
        const pj = usersPJ.size;
        const totalUsers = clt + pj;
        
        const elClt = document.getElementById('kpi-clt-val');
        if(elClt) elClt.innerText = `${clt} (${totalUsers > 0 ? Math.round(clt/totalUsers*100) : 0}%)`;
        
        const elPj = document.getElementById('kpi-pj-val');
        if(elPj) elPj.innerText = `${pj} (${totalUsers > 0 ? Math.round(pj/totalUsers*100) : 0}%)`;
        
        const barClt = document.getElementById('kpi-clt-bar');
        if(barClt) barClt.style.width = (totalUsers > 0 ? (clt/totalUsers)*100 : 0) + '%';
        
        const barPj = document.getElementById('kpi-pj-bar');
        if(barPj) barPj.style.width = (totalUsers > 0 ? (pj/totalUsers)*100 : 0) + '%';

        // --- CORREÇÃO DO CARD DIAS ÚTEIS ---
        // Calcula dias úteis do calendário (Semana ou Mês selecionado)
        const diasUteisTotais = this.calcularDiasUteis(dataInicio, dataFim);
        
        const elDias = document.getElementById('kpi-dias-val');
        if(elDias) elDias.innerText = diasUteisTotais; // Mostra total de dias úteis possíveis
        
        const elDiasTotal = document.getElementById('kpi-dias-total');
        if(elDiasTotal) elDiasTotal.innerText = `/ ${diasComProd.size} (Trab)`; // Mostra dias trabalhados
        
        const media = totalUsers > 0 ? Math.round(totalProd / totalUsers) : 0;
        const elMedia = document.getElementById('kpi-media-todas');
        if(elMedia) elMedia.innerText = media;
    }
};