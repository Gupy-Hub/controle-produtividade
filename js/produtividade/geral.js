window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    selecionados: new Set(),
    
    // Feriados Nacionais 2025
    feriados: ["01-01", "03-03", "03-04", "04-18", "04-21", "05-01", "06-19", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"],
    
    // STATUS NEUTROS (Contam Volume se tiver auditora, mas NÃO contam nota)
    statusNeutros: ['REV', 'DUPL', 'EMPR', 'IA', 'NA', 'N/A', 'REVALIDA'],

    init: function() { 
        console.log("🔧 Produtividade: Iniciando (Neutros + HUD)...");
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    setTxt: function(id, valor) {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    },

    setHtml: function(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    },

    getFator: function(val) {
        if (val === null || val === undefined || val === "") return 1;
        return parseFloat(val);
    },

    isDiaUtil: function(dateObj) {
        const day = dateObj.getDay();
        if (day === 0 || day === 6) return false;
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const chave = `${mes}-${dia}`;
        if (this.feriados.includes(chave)) return false;
        return true;
    },

    getDiasUteisNoMes: function(ano, mes) {
        let dias = 0;
        const date = new Date(ano, mes - 1, 1);
        while (date.getMonth() === mes - 1) {
            if (this.isDiaUtil(date)) dias++;
            date.setDate(date.getDate() + 1);
        }
        return dias;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        this.selecionados = new Set();
        const checkMaster = document.getElementById('check-all-master');
        if(checkMaster) checkMaster.checked = false;

        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📅 Buscando dados de ${dataInicio} até ${dataFim}`);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10 text-slate-400"><i class="fas fa-bolt fa-spin mr-2"></i> Processando...</td></tr>';

        try {
            // 1. Busca Produção Bruta
            const { data: producao, error: errProd } = await Sistema.supabase
                .from('producao')
                .select('*')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim)
                .range(0, 50000)
                .order('data_referencia', { ascending: true });
            
            if (errProd) throw errProd;

            // 2. Busca Usuários
            const { data: usuarios, error: errUser } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, perfil, funcao, contrato')
                .range(0, 5000);
            
            if (errUser) throw errUser;
            const mapaUsuarios = {};
            usuarios.forEach(u => mapaUsuarios[u.id] = u);

            // 3. Busca Metas
            const [anoRef, mesRef] = dataInicio.split('-');
            const { data: metasBanco } = await Sistema.supabase
                .from('metas')
                .select('usuario_id, meta_producao')
                .eq('mes', parseInt(mesRef))
                .eq('ano', parseInt(anoRef))
                .range(0, 2000);
            
            const mapaMetas = {};
            if(metasBanco) metasBanco.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            this.cacheData = producao;
            this.cacheDatas = { start: dataInicio, end: dataFim };

            // 4. Agrupamento e Cálculo com Regra de Neutros
            let dadosAgrupados = {};
            
            producao.forEach(item => {
                const uid = item.usuario_id;
                const userObj = mapaUsuarios[uid] || { id: uid, nome: `ID: ${uid}`, funcao: 'ND', contrato: 'ND' };
                
                if(!dadosAgrupados[uid]) {
                    dadosAgrupados[uid] = {
                        usuario: userObj,
                        registros: [],
                        totais: { qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, dias: 0, diasUteis: 0, somaNotas: 0, qtdDocs: 0 },
                        meta_real: mapaMetas[uid] || 0
                    };
                }
                
                const status = (item.status || '').toUpperCase();
                
                // === CORREÇÃO: LISTA EXPANDIDA DE STATUS POSITIVOS ===
                // Antes aceitava só "OK". Agora aceita PROCESSADO, VALIDO, etc.
                const isOk = ['OK', 'VALIDO', 'PROCESSADO', 'CONCLUIDO', 'DONE', 'FINALIZADO', 'SUCESSO'].some(s => status.includes(s));
                const isNok = status.includes('NOK') || status.includes('ERRO') || status.includes('FALHA');
                const isNeutro = this.statusNeutros.some(s => status.includes(s));
                
                // --- LÓGICA DE VOLUME (Quantidade) ---
                // Conta se for OK, NOK ou (Neutro com Auditora preenchida)
                let contaVolume = false;
                if (isOk || isNok) {
                    contaVolume = true;
                } else if (isNeutro && item.auditora && item.auditora.trim() !== '') {
                    contaVolume = true;
                }

                if (contaVolume) {
                    const d = dadosAgrupados[uid].totais;
                    d.qty += (Number(item.quantidade) || 0);
                    d.fifo += (Number(item.fifo) || 0);
                    d.gt += (Number(item.gradual_total) || 0);
                    d.gp += (Number(item.gradual_parcial) || 0);
                    d.fc += (Number(item.perfil_fc) || 0);
                    
                    const f = this.getFator(item.fator);
                    d.diasUteis += f;
                }

                // --- LÓGICA DE ASSERTIVIDADE (Qualidade) ---
                let assertValor = 0; 
                let entraNaMedia = false;

                if (isOk) {
                    dadosAgrupados[uid].totais.somaNotas += 100;
                    dadosAgrupados[uid].totais.qtdDocs += 1;
                    assertValor = 100;
                    entraNaMedia = true;
                } else if (isNok) {
                    dadosAgrupados[uid].totais.somaNotas += 0;
                    dadosAgrupados[uid].totais.qtdDocs += 1;
                    assertValor = 0;
                    entraNaMedia = true;
                }
                
                let assertTxt = "-";
                if (entraNaMedia) {
                    assertTxt = assertValor + "%";
                } else if (isNeutro) {
                    assertTxt = "--"; 
                }

                // Adiciona registro se for relevante
                if (contaVolume || entraNaMedia || isNeutro) {
                    dadosAgrupados[uid].registros.push({ 
                        ...item, 
                        usuario: userObj, 
                        assertividade_real: assertTxt, 
                        assertividade_valor: assertValor,
                        motivo_abono: item.motivo_abono,
                        is_neutro: isNeutro
                    });
                }
            });

            this.dadosOriginais = Object.values(dadosAgrupados);
            
            if (this.usuarioSelecionado) {
                const elName = document.getElementById('selected-name');
                this.filtrarUsuario(this.usuarioSelecionado, elName ? elName.textContent : '');
            } else {
                this.renderizarTabela();
                this.atualizarKPIs(this.dadosOriginais, producao); 
            }
        } catch (error) {
            console.error("Erro render:", error);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-red-500">Erro: ${error.message}</td></tr>`;
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

        if(lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';
            return;
        }

        const isDiaUnico = (Produtividade.getDatasFiltro().inicio === Produtividade.getDatasFiltro().fim);

        lista.forEach(d => {
            const cargo = (d.usuario.funcao || 'ND').toUpperCase();
            const contrato = (d.usuario.contrato || 'ND').toUpperCase();
            const metaBase = d.meta_real; 
            const commonCell = "px-2 py-2 text-center border-r border-slate-200 text-slate-600 font-medium text-xs";

            if (mostrarDetalhes) {
                d.registros.sort((a,b) => a.data_referencia.localeCompare(b.data_referencia)).forEach(r => {
                    const fatorReal = this.getFator(r.fator);
                    const metaCalc = metaBase * fatorReal;
                    let pct = 0; let pctClass = "text-amber-600 font-bold";
                    if (metaCalc > 0) { pct = (r.quantidade / metaCalc) * 100; if(pct >= 100) pctClass = "text-emerald-700 font-black"; } 
                    else if (r.quantidade > 0) { pct = 100; pctClass = "text-blue-600 font-black"; }

                    const [ano, mes, dia] = r.data_referencia.split('-');
                    let corFator = fatorReal === 0.5 ? 'bg-amber-50 text-amber-700' : fatorReal === 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
                    
                    let assertVal = r.assertividade_real; 
                    let corAssert = 'text-slate-400';
                    if (r.is_neutro) {
                        assertVal = "--";
                        corAssert = 'text-slate-300 italic';
                    } else {
                        if (r.assertividade_valor >= 98) corAssert = 'text-emerald-700 font-bold';
                        else corAssert = 'text-rose-600 font-bold';
                    }

                    let motivoIcon = r.motivo_abono ? `<i class="fas fa-info-circle text-blue-400 ml-1 cursor-help" title="${r.motivo_abono}"></i>` : "";

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                    tr.innerHTML = `
                        <td class="px-2 py-2 text-center border-r border-slate-200"><input type="checkbox" class="row-checkbox cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500" value="${r.id}" onchange="Produtividade.Geral.toggleSelection('${r.id}')"></td>
                        <td class="px-2 py-2 text-center border-r border-slate-200 flex items-center justify-center"><select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none w-20 text-center"><option value="1" ${String(fatorReal)=='1'?'selected':''}>Não</option><option value="0.5" ${String(fatorReal)=='0.5'?'selected':''}>Parcial</option><option value="0" ${String(fatorReal)=='0'?'selected':''}>Sim</option></select>${motivoIcon}</td>
                        <td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><div class="flex justify-between items-center"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100 ml-2">${dia}/${mes}</span></div><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td>
                        <td class="${commonCell}">${fatorReal}</td><td class="${commonCell}">${r.fifo}</td><td class="${commonCell}">${r.gradual_total}</td><td class="${commonCell}">${r.gradual_parcial}</td><td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td><td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaCalc)}</td><td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${r.quantidade}</td><td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pctClass} text-xs">${Math.round(pct)}%</span></td><td class="px-2 py-2 text-center text-xs ${corAssert}">${assertVal}</td>`;
                    tbody.appendChild(tr);
                });
            } else {
                const metaTotalPeriodo = metaBase * d.totais.diasUteis;
                let pct = metaTotalPeriodo > 0 ? (d.totais.qty / metaTotalPeriodo) * 100 : (d.totais.qty > 0 ? 100 : 0);
                
                let assertGeralTxt = "-"; let corAssert = "text-slate-400 italic";
                if (d.totais.qtdDocs > 0) {
                    const mediaGeral = d.totais.somaNotas / d.totais.qtdDocs;
                    assertGeralTxt = mediaGeral.toFixed(2).replace('.', ',') + "%";
                    corAssert = mediaGeral >= 98 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold';
                }
                
                let colunaAbonoHtml = `<td class="px-2 py-2 text-center border-r border-slate-200 text-[10px] text-slate-400 italic bg-slate-50">--</td>`;
                if (isDiaUnico && d.registros.length > 0) {
                    const r = d.registros[0];
                    const fatorReal = this.getFator(r.fator);
                    let corFator = fatorReal === 0.5 ? 'bg-amber-50 text-amber-700' : fatorReal === 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
                    let motivoIcon = r.motivo_abono ? `<i class="fas fa-info-circle text-blue-400 ml-1 cursor-help" title="${r.motivo_abono}"></i>` : "";
                    colunaAbonoHtml = `<td class="px-2 py-2 text-center border-r border-slate-200 flex items-center justify-center"><select onchange="Produtividade.Geral.mudarFator('${r.id}', this.value)" class="${corFator} text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 outline-none w-20 text-center"><option value="1" ${String(fatorReal)=='1'?'selected':''}>Não</option><option value="0.5" ${String(fatorReal)=='0.5'?'selected':''}>Parcial</option><option value="0" ${String(fatorReal)=='0'?'selected':''}>Sim</option></select>${motivoIcon}</td>`;
                }
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 border-b border-slate-200";
                tr.innerHTML = `<td class="px-2 py-2 text-center border-r border-slate-200"><input type="checkbox" class="row-checkbox cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500" value="${d.usuario.id}" onchange="Produtividade.Geral.toggleSelection('${d.usuario.id}')"></td>${colunaAbonoHtml}<td class="px-3 py-2 border-r border-slate-200"><div class="flex flex-col cursor-pointer group" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')"><span class="font-bold text-slate-700 text-xs group-hover:text-blue-600 transition truncate">${d.usuario.nome}</span><span class="text-[9px] text-slate-400 uppercase tracking-tight">${cargo} • ${contrato}</span></div></td><td class="${commonCell} font-bold text-slate-700">${d.totais.diasUteis}</td><td class="${commonCell}">${d.totais.fifo}</td><td class="${commonCell}">${d.totais.gt}</td><td class="${commonCell}">${d.totais.gp}</td><td class="${commonCell} bg-slate-50 text-[10px]">${metaBase}</td><td class="${commonCell} bg-slate-50 text-[10px] font-bold text-slate-700">${Math.round(metaTotalPeriodo)}</td><td class="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/30">${d.totais.qty}</td><td class="px-2 py-2 text-center border-r border-slate-200"><span class="${pct>=100?'text-emerald-700 font-black':'text-amber-600 font-bold'} text-xs">${Math.round(pct)}%</span></td><td class="px-2 py-2 text-center text-xs ${corAssert}">${assertGeralTxt}</td>`;
                tbody.appendChild(tr);
            }
        });
    },

    toggleSelection: function(id) { if(this.selecionados.has(id)) this.selecionados.delete(id); else this.selecionados.add(id); },
    toggleAll: function(checked) { document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = checked; checked ? this.selecionados.add(cb.value) : this.selecionados.delete(cb.value); }); },

    mudarFatorTodos: async function(val) { 
        if(val === "") return;
        let motivo = null;
        if (val !== '1') { motivo = prompt("Motivo do abono em massa (Obrigatório):"); if (!motivo || motivo.trim().length < 3) { alert("É obrigatório informar o motivo."); document.getElementById('bulk-fator').value = ""; return; } }
        let ids = [];
        if (this.selecionados.size > 0) {
             const selecao = Array.from(this.selecionados);
             if (this.usuarioSelecionado === null) this.dadosOriginais.forEach(d => { if(this.selecionados.has(d.usuario.id.toString())) d.registros.forEach(r => ids.push(r.id)); });
             else ids = selecao;
        } else {
             ids = this.dadosOriginais.flatMap(d => d.registros.map(r => r.id));
             if(!confirm(`Aplicar a TODOS os ${ids.length} registros visíveis?`)) return;
        }
        if(ids.length === 0) return;
        const { error } = await Sistema.supabase.from('producao').update({ fator: parseFloat(val), motivo_abono: motivo }).in('id', ids); 
        if(!error) this.carregarTela(); else alert("Erro: " + error.message);
    },

    mudarFator: async function(id, val) { 
        let motivo = null;
        if (val !== '1') { motivo = prompt("Motivo do abono (Obrigatório):"); if (!motivo || motivo.trim().length < 3) { alert("Cancelado: Motivo obrigatório."); this.carregarTela(); return; } }
        const { error } = await Sistema.supabase.from('producao').update({ fator: parseFloat(val), motivo_abono: motivo }).eq('id', id); 
        if(!error) this.carregarTela(); 
    },

    atualizarKPIs: function(dadosAgrupados, dadosBrutosProducao) { 
        let metaTotalGeral = 0; let producaoTotalGeral = 0; let somaNotasGeral = 0; let qtdDocsGeral = 0;
        let countAssistentesAtivos = 0; let somaMetasOperacao = 0; let countPessoasMeta = 0; let somaProdOperacao = 0; let countPessoasProd = 0;

        dadosAgrupados.forEach(d => {
            const cargo = (d.usuario.funcao || '').toUpperCase();
            const isGestao = ['AUDITORA', 'GESTORA'].includes(cargo);

            metaTotalGeral += (d.meta_real * d.totais.diasUteis);
            producaoTotalGeral += d.totais.qty;
            somaNotasGeral += (d.totais.somaNotas || 0);
            qtdDocsGeral += (d.totais.qtdDocs || 0);

            if (!isGestao) {
                if (d.totais.diasUteis > 0 || d.totais.qty > 0) countAssistentesAtivos++;
                if (d.meta_real > 0) { somaMetasOperacao += d.meta_real; countPessoasMeta++; }
                if (d.totais.diasUteis > 0) { somaProdOperacao += (d.totais.qty / d.totais.diasUteis); countPessoasProd++; }
            }
        });

        this.setTxt('kpi-validacao-esperado', Math.round(metaTotalGeral).toLocaleString('pt-BR'));
        this.setTxt('kpi-validacao-real', producaoTotalGeral.toLocaleString('pt-BR'));
        const pctVolume = metaTotalGeral > 0 ? (producaoTotalGeral / metaTotalGeral) * 100 : 0;
        const barVol = document.getElementById('bar-volume'); if(barVol) barVol.style.width = Math.min(pctVolume || 0, 100) + '%';

        const pctProd = metaTotalGeral > 0 ? (producaoTotalGeral / metaTotalGeral) * 100 : 0;
        let pctAssert = qtdDocsGeral > 0 ? somaNotasGeral / qtdDocsGeral : 0;
        this.setTxt('kpi-meta-producao-val', Math.round(pctProd) + '%');
        this.setTxt('kpi-meta-assertividade-val', (pctAssert || 0).toFixed(2).replace('.', ',') + '%');

        const PADRAO = 17;
        const pctCap = (countAssistentesAtivos / PADRAO) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(pctCap) + '%');
        this.setTxt('kpi-capacidade-info', `${countAssistentesAtivos}/${PADRAO} Ativos`);
        const barCap = document.getElementById('bar-capacidade'); if(barCap) { barCap.style.width = Math.min(pctCap || 0, 100) + '%'; barCap.className = `h-full rounded-full transition-all duration-1000 ${(pctCap || 0) < 70 ? 'bg-rose-500' : 'bg-purple-500'}`; }

        const datas = Produtividade.getDatasFiltro();
        let diasUteisCalendario = 0;
        let curr = new Date(datas.inicio + "T00:00:00");
        const end = new Date(datas.fim + "T00:00:00");
        const mapaDiasAbonados = {};
        if (dadosBrutosProducao) {
            dadosBrutosProducao.forEach(r => {
                if(!mapaDiasAbonados[r.data_referencia]) mapaDiasAbonados[r.data_referencia] = { total: 0, abonados: 0 };
                mapaDiasAbonados[r.data_referencia].total++;
                if (Number(r.fator) === 0) mapaDiasAbonados[r.data_referencia].abonados++;
            });
        }
        while (curr <= end) {
            if (this.isDiaUtil(curr)) {
                const isoDate = curr.toISOString().split('T')[0];
                const stats = mapaDiasAbonados[isoDate];
                const abonoGeral = (stats && stats.total > 0 && stats.total === stats.abonados);
                if (!abonoGeral) diasUteisCalendario++;
            }
            curr.setDate(curr.getDate() + 1);
        }
        const [anoRef, mesRef] = datas.inicio.split('-');
        const diasUteisMesTotal = this.getDiasUteisNoMes(parseInt(anoRef), parseInt(mesRef));
        this.setTxt('kpi-dias-uteis', `${diasUteisCalendario}/${diasUteisMesTotal}`);

        const mediaMetaDia = countPessoasMeta > 0 ? somaMetasOperacao / countPessoasMeta : 0;
        const mediaRealDia = countPessoasProd > 0 ? somaProdOperacao / countPessoasProd : 0;
        this.setTxt('kpi-media-esperada', Math.round(mediaMetaDia));
        this.setTxt('kpi-media-real', Math.round(mediaRealDia));

        const topProd = [...dadosAgrupados].filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao||'').toUpperCase())).sort((a, b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const topAssert = [...dadosAgrupados].filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao||'').toUpperCase()) && d.totais.qtdDocs >= 10).sort((a, b) => (b.totais.somaNotas/b.totais.qtdDocs) - (a.totais.somaNotas/a.totais.qtdDocs)).slice(0, 3);
        const medals = ['🥇', '🥈', '🥉'];
        const renderTop = (list, isProd) => {
            if(list.length === 0) return '<span class="text-[8px] text-slate-300 text-center">-</span>';
            return list.map((d, i) => {
                const val = isProd ? d.totais.qty : (d.totais.somaNotas/d.totais.qtdDocs).toFixed(1) + '%';
                const color = isProd ? 'text-blue-600' : 'text-emerald-600';
                return `<div class="flex justify-between items-center text-[9px] w-full"><div class="flex items-center gap-1 overflow-hidden"><span class="text-[8px]">${medals[i]}</span><span class="truncate max-w-[45px] font-bold text-slate-600" title="${d.usuario.nome}">${d.usuario.nome.split(' ')[0]}</span></div><span class="font-black ${color}">${val}</span></div>`;
            }).join('');
        };
        this.setHtml('top-prod-list', renderTop(topProd, true));
        this.setHtml('top-assert-list', renderTop(topAssert, false));
    },

    filtrarUsuario: function(id, nome) { this.usuarioSelecionado = id; document.getElementById('selection-header').classList.remove('hidden'); document.getElementById('selected-name').textContent = nome; this.carregar