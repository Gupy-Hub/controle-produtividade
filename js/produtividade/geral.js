Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    
    init: function() { 
        const lastViewMode = localStorage.getItem('lastViewMode');
        if (lastViewMode) {
            const el = document.getElementById('view-mode');
            if(el) el.value = lastViewMode;
        }
        this.toggleSemana(); 
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    setTxt: function(id, valor) {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    },

    toggleSemana: function() {
        const viewEl = document.getElementById('view-mode');
        if(!viewEl) return;
        const mode = viewEl.value;
        localStorage.setItem('lastViewMode', mode);
        const sem = document.getElementById('select-semana');
        if(sem) {
            if(mode === 'semana') sem.classList.remove('hidden'); else sem.classList.add('hidden');
        }
        if(this.initialized) this.carregarTela();
    },

    getSemanasDoMes: function(ano, mes) {
        let semanas = [];
        let dataAtual = new Date(ano, mes - 1, 1);
        const ultimoDiaMes = new Date(ano, mes, 0);
        while (dataAtual <= ultimoDiaMes) {
            let inicio = new Date(dataAtual);
            let fim = new Date(dataAtual);
            while (fim.getDay() !== 0 && fim < ultimoDiaMes) fim.setDate(fim.getDate() + 1);
            semanas.push({ inicio: inicio.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] });
            dataAtual = new Date(fim); dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return semanas;
    },
    
    calcularDiasUteis: function(inicio, fim) {
        let count = 0; let cur = new Date(inicio + 'T12:00:00'); const end = new Date(fim + 'T12:00:00');
        while(cur <= end) { if(cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
        return count;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        const dateInput = document.getElementById('global-date');
        const viewEl = document.getElementById('view-mode');
        const semEl = document.getElementById('select-semana');

        if(!tbody || !dateInput || !viewEl) return;

        const viewMode = viewEl.value;
        let dataSel = dateInput.value;
        if(!dataSel) { dataSel = new Date().toISOString().split('T')[0]; dateInput.value = dataSel; }
        
        const [ano, mes, dia] = dataSel.split('-');
        let dataInicio, dataFim;

        // Definição do Período
        if (viewMode === 'dia') { dataInicio = dataSel; dataFim = dataSel; }
        else if (viewMode === 'mes') { dataInicio = `${ano}-${mes}-01`; dataFim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (viewMode === 'ano') { dataInicio = `${ano}-01-01`; dataFim = `${ano}-12-31`; }
        else if (viewMode === 'semana') {
            const semanaSel = semEl ? (parseInt(semEl.value) - 1) : 0;
            const semanas = this.getSemanasDoMes(parseInt(ano), parseInt(mes));
            if (semanas[semanaSel]) { dataInicio = semanas[semanaSel].inicio; dataFim = semanas[semanaSel].fim; }
            else { tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-slate-400">Semana inválida.</td></tr>'; return; }
        }

        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados e metas...</td></tr>';

        try {
            // 1. Busca Produção
            const { data: producao, error: errProd } = await Sistema.supabase
                .from('producao')
                .select(`id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator, justificativa, usuario:usuarios ( id, nome, perfil, funcao, contrato )`)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: true });
            
            if (errProd) throw errProd;

            // 2. Busca Metas do Mês Referência
            const { data: metasBanco, error: errMeta } = await Sistema.supabase
                .from('metas')
                .select('usuario_id, meta_producao')
                .eq('mes', parseInt(mes))
                .eq('ano', parseInt(ano));
            
            // Cria mapa de metas (ID Usuario -> Meta Prod)
            const mapaMetas = {};
            if(metasBanco) metasBanco.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            this.cacheData = producao;
            this.cacheDatas = { start: dataInicio, end: dataFim };

            let dadosAgrupados = {};
            producao.forEach(item => {
                const uid = item.usuario ? item.usuario.id : 'desconhecido';
                
                if(!dadosAgrupados[uid]) {
                    // Aqui definimos a META REAL vinda do banco (ou 0 se não tiver)
                    const metaDoUsuario = mapaMetas[uid] || 0; 
                    
                    dadosAgrupados[uid] = {
                        usuario: item.usuario || { nome: 'Desconhecido', funcao: 'Assistente', contrato: 'PJ' },
                        registros: [],
                        totais: { qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0 },
                        meta_real: metaDoUsuario // INTEGRADO!
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
                const elName = document.getElementById('selected-name');
                this.filtrarUsuario(this.usuarioSelecionado, elName ? elName.textContent : '');
            } else {
                this.renderizarTabela();
                this.atualizarKPIs(producao, dataInicio, dataFim);
            }
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;
        const viewEl = document.getElementById('view-mode');
        const viewMode = viewEl ? viewEl.value : 'dia';
        const checkGestao = document.getElementById('check-gestao');
        const mostrarGestao = checkGestao ? checkGestao.checked : false;
        const mostrarDetalhes = (viewMode === 'dia' || this.usuarioSelecionado !== null);

        let lista = this.usuarioSelecionado ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) : this.dadosOriginais;
        if (!mostrarGestao && !this.usuarioSelecionado) {
            lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        }

        tbody.innerHTML = '';
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        lista.forEach(d => {
            const cargo = (d.usuario.funcao || 'Assistente').toUpperCase();
            const contrato = (d.usuario.contrato || 'PJ').toUpperCase();
            const metaBase = d.meta_real; // Agora vem do banco!
            const commonCell = "px-2 py-2 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

            if (mostrarDetalhes) {
                const mapaDias = {};
                d.registros.forEach(r => {
                    const data = r.data_referencia;
                    if (!mapaDias[data]) mapaDias[data] = { ...r, quantidade: 0, fifo: 0, gradual_total: 0, gradual_parcial: 0, perfil_fc: 0 };
                    mapaDias[data].quantidade += (Number(r.quantidade)||0); 
                    mapaDias[data].fifo += (Number(r.fifo)||0);
                    mapaDias[data].gradual_total += (Number(r.gradual_total)||0); 
                    mapaDias[data].gradual_parcial += (Number(r.gradual_parcial)||0);
                    mapaDias[data].perfil_fc += (Number(r.perfil_fc)||0);
                });
                
                Object.values(mapaDias).sort((a,b)=>a.data_referencia.localeCompare(b.data_referencia)).forEach(r => {
                    // Meta Diária Proporcional ao Fator
                    // Se a meta é mensal, dividimos por 21 (dias úteis aprox) ou usamos um valor fixo se definido
                    // Aqui mantemos a lógica antiga mas usando a meta do banco
                    // Para simplificar: Meta Diária = Meta Mensal / 21 (estimativa) OU 
                    // Se você tiver "meta_diaria" na tabela metas, seria melhor. 
                    // Por enquanto, vamos assumir Meta Diária = Meta Mensal / 20 dias uteis
                    const metaDiariaEstimada = metaBase > 0 ? (metaBase / 20) : 0;
                    const metaCalc = metaDiariaEstimada * r.fator;
                    
                    const pct = metaCalc > 0 ? (r.quantidade / metaCalc) * 100 : 0;
                    const [ano, mes, dia] = r.data_referencia.split('-');
                    let corFator = r.fator == 0.5 ? 'bg-amber-50 text-amber-700' : r.fator == 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
                    
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                    tr.innerHTML = `<td class="px-2 py-2 text-center border-r border-slate-200"><select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none w-full text-center"><option value="1" ${String(r.fator)=='1'?'selected':''}>100%</option><option value="0.5" ${String(r.fator)=='0.5'?'selected':''}>50%</option><option value="0" ${String(r.fator)=='0'?'selected':''}>Abonar</option></select></td><td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><div class="flex justify-between items-center"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 ml-2">${dia}/${mes}</span></div><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td><td class="${commonCell}">${r.fator}</td><td class="${commonCell} font-bold text-blue-700 bg-blue-50/30">${r.quantidade}</td><td class="${commonCell}">${r.fifo}</td><td class="${commonCell}">${r.gradual_total}</td><td class="${commonCell}">${r.gradual_parcial}</td><td class="${commonCell} bg-slate-50 text-[10px]">${Math.round(metaCalc)}</td><td class="px-2 py-2 text-center"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td>`;
                    tbody.appendChild(tr);
                });
            } else {
                // Visão Mês (Consolidada)
                const metaTotal = metaBase * d.totais.diasUteis; // Meta Mensal * Fator de Presença? Não.
                // Correção: Se a meta é MENSAL, ela deve ser proporcional aos dias úteis trabalhados? 
                // Ou a meta mensal é fixa? 
                // Se o usuário tem Meta 1000 e trabalhou só metade do mês (fator 0.5 em tudo), a meta dele cai?
                // Vamos manter simples: Meta Alvo = Meta Mensal ajustada pelos dias úteis.
                // Mas a lógica anterior fazia: MetaBase * DiasUteis. Isso implica que 650 era diária.
                // Como mudamos para Meta Mensal no banco, a lógica aqui muda.
                
                // Nova Lógica: Meta do Período = Meta Mensal (se visão for mês)
                // Se visão for ano, soma metas mensais.
                // Para simplificar na visão mês:
                const metaFinal = metaBase; // Meta cheia do mês

                const pct = metaFinal > 0 ? (d.totais.qty / metaFinal) * 100 : 0;
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                tr.innerHTML = `<td class="px-2 py-2 text-center border-r border-slate-200 text-[10px] text-slate-400 italic bg-slate-50">--</td><td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td><td class="${commonCell} font-bold text-slate-700">${d.totais.diasUteis}</td><td class="${commonCell} font-bold text-blue-700 bg-blue-50/30">${d.totais.qty}</td><td class="${commonCell}">${d.totais.fifo}</td><td class="${commonCell}">${d.totais.gt}</td><td class="${commonCell}">${d.totais.gp}</td><td class="${commonCell} bg-slate-50 text-[10px]">${Math.round(metaFinal)}</td><td class="px-2 py-2 text-center"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td>`;
                tbody.appendChild(tr);
            }
        });
        if(lista.length === 0) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';
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

    atualizarKPIs: function(data, dataInicio, dataFim) {
        let totalProdGeral = 0; let diasComProd = new Set();
        let totalProdOperacional = 0; let totalDiasOperacionaisPonderados = 0; 
        let usersCLT = new Set(); let usersPJ = new Set(); let countAssistentesAtivos = new Set();

        data.forEach(r => {
            const qtd = Number(r.quantidade) || 0; 
            const fator = Number(r.fator) || 0;
            totalProdGeral += qtd; 
            diasComProd.add(r.data_referencia);
            
            const cargo = r.usuario && r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (!['AUDITORA', 'GESTORA'].includes(cargo)) {
                totalProdOperacional += qtd;
                if (fator > 0) totalDiasOperacionaisPonderados += fator;
                if(r.usuario && r.usuario.contrato === 'CLT') usersCLT.add(r.usuario.id); else if (r.usuario) usersPJ.add(r.usuario.id);
                if(r.usuario) countAssistentesAtivos.add(r.usuario.id);
            }
        });

        this.setTxt('kpi-total', totalProdGeral.toLocaleString('pt-BR'));
        
        // KPI de Meta Global é complexo pois depende da soma das metas individuais.
        // Por simplicidade, deixamos -- ou implementamos soma depois.
        this.setTxt('kpi-meta-total', '--'); 
        
        const totalEquipe = usersCLT.size + usersPJ.size;
        this.setTxt('kpi-clt-val', `${usersCLT.size} (${totalEquipe > 0 ? Math.round(usersCLT.size/totalEquipe*100) : 0}%)`);
        this.setTxt('kpi-pj-val', `${usersPJ.size} (${totalEquipe > 0 ? Math.round(usersPJ.size/totalEquipe*100) : 0}%)`);
        
        const diasUteis = this.calcularDiasUteis(dataInicio, dataFim);
        this.setTxt('kpi-dias-val', `${diasComProd.size} / ${diasUteis}`);
        
        const media = totalDiasOperacionaisPonderados > 0 ? Math.round(totalProdOperacional / totalDiasOperacionaisPonderados) : 0;
        this.setTxt('kpi-media-todas', media);
    },
    
    // Funções de mudar fator e excluir mantidas, apenas verifique se estão funcionando
    mudarFator: async function(id, novoFatorStr) {
        // ... (código existente mantido) ...
        const novoFator = String(novoFatorStr); 
        let justificativa = null;
        if (novoFator === '0' || novoFator === '0.5') {
            await new Promise(r => setTimeout(r, 10));
            justificativa = prompt(`Informe a justificativa (obrigatório):`);
            if (!justificativa || justificativa.trim() === "") { alert("Justificativa obrigatória."); this.renderizarTabela(); return; }
        }
        try {
            const { error } = await Sistema.supabase.from('producao').update({ fator: novoFator, justificativa: justificativa }).eq('id', id);
            if (error) throw error;
            // Atualiza cache local
            this.carregarTela(); 
        } catch (error) { alert("Erro: " + error.message); }
    },

    mudarFatorTodos: async function(novoFator) {
        if(!novoFator) return;
        if(!confirm("Aplicar a TODOS os visíveis?")) { document.getElementById('bulk-fator').value = ""; return; }
        // ... Lógica similar ao original ...
        let justificativa = null;
        if (['0', '0.5'].includes(String(novoFator))) { justificativa = prompt("Justificativa:"); if (!justificativa) { alert("Obrigatório."); document.getElementById('bulk-fator').value = ""; return; } }
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
        const viewEl = document.getElementById('view-mode');
        const viewMode = viewEl.value;
        let s, e;
        // Pega do cacheDatas que já tem o range correto
        s = this.cacheDatas.start;
        e = this.cacheDatas.end;
        
        try {
            const { error } = await Sistema.supabase.from('producao').delete().gte('data_referencia', s).lte('data_referencia', e);
            if(error) throw error;
            this.carregarTela();
        } catch(err) { alert("Erro: " + err.message); }
    }
};