Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    
    init: function() { 
        console.log("🔧 Produtividade: Iniciando (Modo Diagnóstico)...");
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    setTxt: function(id, valor) {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    },

    normalizar: function(str) {
        if(!str) return "";
        return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    parsePorcentagem: function(valorStr) {
        if (!valorStr) return 0;
        let limpo = valorStr.toString().replace('%', '').replace(',', '.').trim();
        return parseFloat(limpo) || 0;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📅 Buscando de ${dataInicio} até ${dataFim}`);
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando Qualidade...</td></tr>';

        try {
            // 1. BUSCA PRODUÇÃO
            const { data: producao, error: errProd } = await Sistema.supabase
                .from('producao')
                .select('*')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .order('data_referencia', { ascending: true });
            
            if (errProd) throw errProd;

            // 2. BUSCA USUÁRIOS
            const { data: usuarios, error: errUser } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, perfil, funcao, contrato');
            
            if (errUser) throw errUser;
            
            const mapaUsuarios = {};
            const mapaNomeParaId = {};
            usuarios.forEach(u => {
                mapaUsuarios[u.id] = u;
                if(u.nome) mapaNomeParaId[this.normalizar(u.nome)] = u.id;
            });

            // 3. BUSCA ASSERTIVIDADE
            const { data: qualidade, error: errQuali } = await Sistema.supabase
                .from('assertividade')
                .select('assistente, data_auditoria, ok, nok, porcentagem, status')
                .gte('data_auditoria', dataInicio)
                .lte('data_auditoria', dataFim);

            if (errQuali) throw errQuali;

            console.log(`🔎 Diagnóstico: ${qualidade.length} registros de auditoria encontrados.`);

            const statusValidos = ['OK', 'NOK', 'REV', 'JUST', 'DUPL', 'IA', 'EMPR', 'REC'];
            const mapaQualidadeDiaria = {}; 
            const mapaQualidadeTotal = {};
            
            // Debug de nomes não encontrados
            let nomesSemMatch = new Set();
            let statusInvalidos = new Set();

            if (qualidade) {
                qualidade.forEach(q => {
                    const nomeNorm = this.normalizar(q.assistente);
                    const uid = mapaNomeParaId[nomeNorm];
                    
                    if (!uid) {
                        nomesSemMatch.add(q.assistente); // Loga nomes que não bateram
                        return;
                    }

                    if (q.data_auditoria) {
                        const statusItem = (q.status || '').toUpperCase().trim();
                        
                        if (statusValidos.includes(statusItem)) {
                            const notaDoc = this.parsePorcentagem(q.porcentagem);

                            const somar = (obj) => {
                                if (!obj) obj = { somaNotas: 0, qtdDocs: 0, ok: 0, nok: 0 };
                                obj.somaNotas += notaDoc;
                                obj.qtdDocs += 1;
                                obj.ok += (parseInt(q.ok) || 0);
                                obj.nok += (parseInt(q.nok) || 0);
                                return obj;
                            };

                            const chaveDia = `${uid}_${q.data_auditoria}`;
                            mapaQualidadeDiaria[chaveDia] = somar(mapaQualidadeDiaria[chaveDia]);
                            mapaQualidadeTotal[uid] = somar(mapaQualidadeTotal[uid]);
                        } else {
                            statusInvalidos.add(statusItem); // Loga status ignorados
                        }
                    }
                });
            }

            if (nomesSemMatch.size > 0) console.warn("⚠️ Nomes na auditoria sem usuário correspondente:", [...nomesSemMatch]);
            if (statusInvalidos.size > 0) console.warn("⚠️ Status ignorados (não estão na lista válida):", [...statusInvalidos]);

            // 4. METAS & UNIFICAÇÃO
            const [anoRef, mesRef] = dataInicio.split('-');
            const { data: metasBanco } = await Sistema.supabase
                .from('metas')
                .select('usuario_id, meta_producao').eq('mes', parseInt(mesRef)).eq('ano', parseInt(anoRef));
            
            const mapaMetas = {};
            if(metasBanco) metasBanco.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            this.cacheData = producao;
            this.cacheDatas = { start: dataInicio, end: dataFim };

            let dadosAgrupados = {};
            
            producao.forEach(item => {
                const uid = item.usuario_id;
                const userObj = mapaUsuarios[uid] || { id: uid, nome: `ID: ${uid}`, funcao: 'ND', contrato: 'ND' };
                
                if(!dadosAgrupados[uid]) {
                    const qTotal = mapaQualidadeTotal[uid] || { somaNotas: 0, qtdDocs: 0, ok: 0, nok: 0 };
                    dadosAgrupados[uid] = {
                        usuario: userObj,
                        registros: [],
                        totais: { 
                            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0,
                            somaNotas: qTotal.somaNotas, qtdDocs: qTotal.qtdDocs
                        },
                        meta_real: mapaMetas[uid] || 0
                    };
                }
                
                const chaveQuali = `${uid}_${item.data_referencia}`;
                const dadosQ = mapaQualidadeDiaria[chaveQuali] || { somaNotas: 0, qtdDocs: 0 };

                let assertPct = 0;
                let assertTxt = "-";
                if (dadosQ.qtdDocs > 0) {
                    assertPct = dadosQ.somaNotas / dadosQ.qtdDocs;
                    assertTxt = assertPct.toFixed(2).replace('.', ',') + "%";
                }

                dadosAgrupados[uid].registros.push({ 
                    ...item, usuario: userObj,
                    assertividade_real: assertTxt, assertividade_valor: assertPct
                });
                
                const d = dadosAgrupados[uid].totais;
                const f = Number(item.fator || 1);
                d.qty += (Number(item.quantidade) || 0); d.fifo += (Number(item.fifo) || 0); 
                d.gt += (Number(item.gradual_total) || 0); d.gp += (Number(item.gradual_parcial) || 0); 
                d.fc += (Number(item.perfil_fc) || 0); d.dias += 1; d.diasUteis += f;
            });

            this.dadosOriginais = Object.values(dadosAgrupados);
            
            if (this.usuarioSelecionado) {
                const elName = document.getElementById('selected-name');
                this.filtrarUsuario(this.usuarioSelecionado, elName ? elName.textContent : '');
            } else {
                this.renderizarTabela();
                this.atualizarKPIs(producao, mapaUsuarios);
            }
        } catch (error) {
            console.error("Erro render:", error);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;
        const checkGestao = document.getElementById('check-gestao');
        const mostrarGestao = checkGestao ? checkGestao.checked : false;
        const mostrarDetalhes = (this.usuarioSelecionado !== null);
        let lista = this.usuarioSelecionado ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) : this.dadosOriginais;
        if (!mostrarGestao && !this.usuarioSelecionado) lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));

        tbody.innerHTML = '';
        lista.sort((a, b) => (a.usuario.nome || '').localeCompare(b.usuario.nome || ''));

        if(lista.length === 0) { tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>'; return; }

        lista.forEach(d => {
            const cargo = (d.usuario.funcao || 'ND').toUpperCase();
            const contrato = (d.usuario.contrato || 'ND').toUpperCase();
            const metaBase = d.meta_real; 
            const commonCell = "px-2 py-2 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

            if (mostrarDetalhes) {
                d.registros.sort((a,b) => a.data_referencia.localeCompare(b.data_referencia)).forEach(r => {
                    const metaCalc = metaBase * (r.fator || 1);
                    const pct = metaCalc > 0 ? (r.quantidade / metaCalc) * 100 : 0;
                    const [ano, mes, dia] = r.data_referencia.split('-');
                    let corFator = r.fator == 0.5 ? 'bg-amber-50 text-amber-700' : r.fator == 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
                    let assertVal = r.assertividade_real; let assertNum = r.assertividade_valor;
                    let corAssert = 'text-slate-400';
                    if (assertNum > 0) corAssert = assertNum >= 98 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold';

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                    tr.innerHTML = `<td class="px-2 py-2 text-center border-r border-slate-200"><select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none w-full text-center"><option value="1" ${String(r.fator)=='1'?'selected':''}>100%</option><option value="0.5" ${String(r.fator)=='0.5'?'selected':''}>50%</option><option value="0" ${String(r.fator)=='0'?'selected':''}>Abonar</option></select></td><td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><div class="flex justify-between items-center"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 ml-2">${dia}/${mes}</span></div><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td><td class="${commonCell}">${r.fator}</td><td class="${commonCell}">${r.fifo}</td><td class="${commonCell}">${r.gradual_total}</td><td class="${commonCell}">${r.gradual_parcial}</td><td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td><td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaCalc)}</td><td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${r.quantidade}</td><td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td><td class="px-2 py-2 text-center text-xs ${corAssert}">${assertVal}</td>`;
                    tbody.appendChild(tr);
                });
            } else {
                const metaTotalPeriodo = metaBase * d.totais.diasUteis;
                const pct = metaTotalPeriodo > 0 ? (d.totais.qty / metaTotalPeriodo) * 100 : 0;
                let assertGeralTxt = "-"; let corAssert = "text-slate-400 italic";
                if (d.totais.qtdDocs > 0) {
                    const mediaGeral = d.totais.somaNotas / d.totais.qtdDocs;
                    assertGeralTxt = mediaGeral.toFixed(2).replace('.', ',') + "%";
                    corAssert = mediaGeral >= 98 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold';
                }
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                tr.innerHTML = `<td class="px-2 py-2 text-center border-r border-slate-200 text-[10px] text-slate-400 italic bg-slate-50">--</td><td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td><td class="${commonCell} font-bold text-slate-700">${d.totais.diasUteis}</td><td class="${commonCell}">${d.totais.fifo}</td><td class="${commonCell}">${d.totais.gt}</td><td class="${commonCell}">${d.totais.gp}</td><td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td><td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaTotalPeriodo)}</td><td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${d.totais.qty}</td><td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td><td class="px-2 py-2 text-center text-xs ${corAssert}">${assertGeralTxt}</td>`;
                tbody.appendChild(tr);
            }
        });
    },

    filtrarUsuario: function(id, nome) { this.usuarioSelecionado = id; document.getElementById('selection-header').classList.remove('hidden'); document.getElementById('selected-name').textContent = nome; this.renderizarTabela(); },
    limparSelecao: function() { this.usuarioSelecionado = null; document.getElementById('selection-header').classList.add('hidden'); this.renderizarTabela(); },
    atualizarKPIs: function(data, mapaUsuarios) { let totalProdGeral = 0; let usersCLT = new Set(); let usersPJ = new Set(); data.forEach(r => { const qtd = Number(r.quantidade) || 0; totalProdGeral += qtd; const u = r.usuario || (mapaUsuarios ? mapaUsuarios[r.usuario_id] : null); if (u) { const cargo = u.funcao ? String(u.funcao).toUpperCase() : 'ASSISTENTE'; if (!['AUDITORA', 'GESTORA'].includes(cargo)) { if(u.contrato === 'CLT') usersCLT.add(u.id); else usersPJ.add(u.id); } } }); this.setTxt('kpi-total', totalProdGeral.toLocaleString('pt-BR')); this.setTxt('kpi-clt-val', `${usersCLT.size}`); this.setTxt('kpi-pj-val', `${usersPJ.size}`); },
    mudarFator: async function(id, val) { const { error } = await Sistema.supabase.from('producao').update({ fator: val }).eq('id', id); if(!error) this.carregarTela(); },
    mudarFatorTodos: async function(val) { if(!val) return; if(!confirm("Aplicar a todos?")) return; const ids = this.dadosOriginais.flatMap(d => d.registros.map(r => r.id)); const { error } = await Sistema.supabase.from('producao').update({ fator: val }).in('id', ids); if(!error) this.carregarTela(); },
    excluirDadosDia: async function() { const datas = Produtividade.getDatasFiltro(); const s = datas.inicio; const e = datas.fim; if(!s || !e) return alert("Período não definido."); if(!confirm(`⚠️ ATENÇÃO: Isso apagará apenas a PRODUÇÃO do período. A assertividade (Qualidade) é mantida.`)) return; try { const { error } = await Sistema.supabase.rpc('excluir_producao_periodo', { p_inicio: s, p_fim: e }); if(error) throw error; alert("Produção excluída com sucesso!"); this.carregarTela(); } catch(err) { alert("Erro: " + err.message); } }
};