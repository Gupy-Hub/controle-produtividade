Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    
    init: function() { 
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    setTxt: function(id, valor) {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        // USA O NOVO SELETOR GLOBAL
        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados e metas...</td></tr>';

        try {
            const { data: producao, error: errProd } = await Sistema.supabase
                .from('producao')
                .select(`id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator, justificativa, assertividade, nok, usuario:usuarios ( id, nome, perfil, funcao, contrato )`)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: true });
            
            if (errProd) throw errProd;

            // Busca metas do Mês do início do filtro (referência)
            const [anoRef, mesRef] = dataInicio.split('-');
            
            const { data: metasBanco, error: errMeta } = await Sistema.supabase
                .from('metas')
                .select('usuario_id, meta_producao')
                .eq('mes', parseInt(mesRef))
                .eq('ano', parseInt(anoRef));
            
            const mapaMetas = {};
            if(metasBanco) metasBanco.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            this.cacheData = producao;
            this.cacheDatas = { start: dataInicio, end: dataFim };

            let dadosAgrupados = {};
            producao.forEach(item => {
                const uid = item.usuario ? item.usuario.id : 'desconhecido';
                
                if(!dadosAgrupados[uid]) {
                    const metaDoUsuario = mapaMetas[uid] || 0; 
                    
                    dadosAgrupados[uid] = {
                        usuario: item.usuario || { nome: 'Desconhecido', funcao: 'Assistente', contrato: 'PJ' },
                        registros: [],
                        totais: { qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0 },
                        meta_real: metaDoUsuario
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
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;
        
        const checkGestao = document.getElementById('check-gestao');
        const mostrarGestao = checkGestao ? checkGestao.checked : false;
        
        // Se estamos filtrando por dia (seletor data especifica) ou usuário
        // No novo seletor, "Detalhes" aparece quando usuário é selecionado OU quando o período é curto?
        // Vamos manter: Detalhes só quando clica no usuário. Visão padrão é Consolidada por Pessoa.
        const mostrarDetalhes = (this.usuarioSelecionado !== null);

        let lista = this.usuarioSelecionado ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) : this.dadosOriginais;
        if (!mostrarGestao && !this.usuarioSelecionado) {
            lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        }

        tbody.innerHTML = '';
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        lista.forEach(d => {
            const cargo = (d.usuario.funcao || 'Assistente').toUpperCase();
            const contrato = (d.usuario.contrato || 'PJ').toUpperCase();
            const metaBase = d.meta_real; 
            const commonCell = "px-2 py-2 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

            if (mostrarDetalhes) {
                // VISÃO DIÁRIA DETALHADA DO USUÁRIO
                d.registros.sort((a,b) => a.data_referencia.localeCompare(b.data_referencia)).forEach(r => {
                    const metaCalc = metaBase * r.fator;
                    const pct = metaCalc > 0 ? (r.quantidade / metaCalc) * 100 : 0;
                    const [ano, mes, dia] = r.data_referencia.split('-');
                    let corFator = r.fator == 0.5 ? 'bg-amber-50 text-amber-700' : r.fator == 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
                    let assertVal = r.assertividade || '0%';
                    let assertNum = parseFloat(assertVal.replace('%','').replace(',','.'));
                    let corAssert = assertNum >= 98 ? 'text-emerald-700 font-bold' : (assertNum > 0 ? 'text-rose-600 font-bold' : 'text-slate-400');

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                    tr.innerHTML = `
                        <td class="px-2 py-2 text-center border-r border-slate-200"><select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none w-full text-center"><option value="1" ${String(r.fator)=='1'?'selected':''}>100%</option><option value="0.5" ${String(r.fator)=='0.5'?'selected':''}>50%</option><option value="0" ${String(r.fator)=='0'?'selected':''}>Abonar</option></select></td>
                        <td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><div class="flex justify-between items-center"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 ml-2">${dia}/${mes}</span></div><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td>
                        <td class="${commonCell}">${r.fator}</td>
                        <td class="${commonCell}">${r.fifo}</td>
                        <td class="${commonCell}">${r.gradual_total}</td>
                        <td class="${commonCell}">${r.gradual_parcial}</td>
                        <td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td>
                        <td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaCalc)}</td>
                        <td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${r.quantidade}</td>
                        <td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td>
                        <td class="px-2 py-2 text-center text-xs ${corAssert}">${assertVal}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                // VISÃO GERAL (RESUMO POR PESSOA NO PERÍODO)
                const metaTotalPeriodo = metaBase * d.totais.diasUteis;
                const pct = metaTotalPeriodo > 0 ? (d.totais.qty / metaTotalPeriodo) * 100 : 0;
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                tr.innerHTML = `
                    <td class="px-2 py-2 text-center border-r border-slate-200 text-[10px] text-slate-400 italic bg-slate-50">--</td>
                    <td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td>
                    <td class="${commonCell} font-bold text-slate-700">${d.totais.diasUteis}</td>
                    <td class="${commonCell}">${d.totais.fifo}</td>
                    <td class="${commonCell}">${d.totais.gt}</td>
                    <td class="${commonCell}">${d.totais.gp}</td>
                    <td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td>
                    <td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaTotalPeriodo)}</td>
                    <td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${d.totais.qty}</td>
                    <td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td>
                    <td class="px-2 py-2 text-center text-xs text-slate-400 italic">-</td>
                `;
                tbody.appendChild(tr);
            }
        });
        if(lista.length === 0) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
    },

    // ... Funções auxiliares (KPIs, Filtro Usuario, etc) mantidas idênticas ...
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

    atualizarKPIs: function(data) { // Simplificado pois não precisa calcular dias uteis aqui
        let totalProdGeral = 0; let totalMetaCalculada = 0; 
        let usersCLT = new Set(); let usersPJ = new Set();

        data.forEach(r => {
            const qtd = Number(r.quantidade) || 0; 
            totalProdGeral += qtd; 
            const cargo = r.usuario && r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
            if (!['AUDITORA', 'GESTORA'].includes(cargo)) {
                if(r.usuario && r.usuario.contrato === 'CLT') usersCLT.add(r.usuario.id); else if (r.usuario) usersPJ.add(r.usuario.id);
            }
        });

        this.setTxt('kpi-total', totalProdGeral.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', '--'); 
        this.setTxt('kpi-clt-val', `${usersCLT.size}`);
        this.setTxt('kpi-pj-val', `${usersPJ.size}`);
    },
    
    mudarFator: async function(id, novoFatorStr) {
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
            this.carregarTela(); 
        } catch (error) { alert("Erro: " + error.message); }
    },

    mudarFatorTodos: async function(novoFator) {
        if(!novoFator) return;
        if(!confirm("Aplicar a TODOS?")) { document.getElementById('bulk-fator').value = ""; return; }
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

    // --- NOVA LÓGICA DE EXCLUSÃO ---
    excluirDadosDia: async function() {
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio;
        const e = datas.fim;

        if(!s || !e) return alert("Período não definido.");

        // Mensagem dinâmica (se for 1 dia ou intervalo)
        const msg = s === e ? `Excluir produção do dia ${s}?` : `Excluir produção de ${s} até ${e}?`;

        if(!confirm(`⚠️ ${msg}\n\nIsso apagará TODOS os registros importados neste período.`)) return;
        
        try {
            const { error } = await Sistema.supabase
                .from('producao')
                .delete()
                .gte('data_referencia', s)
                .lte('data_referencia', e);
                
            if(error) throw error;
            
            alert("Dados excluídos com sucesso!");
            this.carregarTela();
        } catch(err) { alert("Erro: " + err.message); }
    }
};