/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Engine do Painel "Dia a Dia"
   ATUALIZAÇÃO: Gestão/Admin conta na Produção, mas NUNCA na Assertividade
*/

MinhaArea.Geral = {
    carregar: async function() {
        const rawUid = MinhaArea.getUsuarioAlvo();
        const uid = rawUid ? parseInt(rawUid) : null;
        const isGeral = (uid === null); 
        
        const tbody = document.getElementById('tabela-extrato');
        const alertContainer = document.getElementById('container-checkin-alert');
        
        if (alertContainer) {
            alertContainer.innerHTML = '';
            alertContainer.classList.add('hidden');
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Aplicando regra de exclusão...</span></div></td></tr>';

        try {
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // 1. Produção
            let qProducao = Sistema.supabase.from('producao')
                .select('*').gte('data_referencia', inicio).lte('data_referencia', fim).limit(5000);

            // 2. Assertividade
            let qAssertividade = Sistema.supabase.from('assertividade')
                .select('data_referencia, porcentagem_assertividade, usuario_id')
                .gte('data_referencia', inicio).lte('data_referencia', fim).not('porcentagem_assertividade', 'is', null).limit(5000);

            // 3. Metas
            let qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio).lte('ano', anoFim);

            // 4. Usuários
            let qUsuarios = Sistema.supabase.from('usuarios')
                .select('id, ativo, nome, perfil, funcao');

            if (!isGeral) {
                qProducao = qProducao.eq('usuario_id', uid);
                qAssertividade = qAssertividade.eq('usuario_id', uid);
                qMetas = qMetas.eq('usuario_id', uid);
            }

            let qCheck = null;
            if (!isGeral) {
                qCheck = Sistema.supabase.from('checking_diario')
                    .select('data_referencia, status').eq('usuario_id', uid)
                    .gte('data_referencia', inicio).lte('data_referencia', fim);
            }

            const [prodRes, assertRes, metasRes, userRes, checkRes] = await Promise.all([
                qProducao, qAssertividade, qMetas, qUsuarios, qCheck ? qCheck : Promise.resolve({ data: [] })
            ]);

            const dadosProducaoRaw = prodRes.data || [];
            const dadosAssertividadeRaw = assertRes.data || [];
            const dadosMetasRaw = metasRes.data || [];
            const dadosUsuarios = userRes.data || [];
            const dadosCheckins = checkRes.data || [];

            if (!isGeral) await this.processarCheckingInterface(uid, dadosCheckins);

            // --- MAPEAMENTO ---
            const mapUser = {};
            dadosUsuarios.forEach(u => {
                mapUser[u.id] = {
                    perfil: (u.perfil || 'ASSISTENTE').toUpperCase().trim(),
                    funcao: (u.funcao || '').toUpperCase().trim(),
                    nome: (u.nome || '').toUpperCase().trim(),
                    ativo: u.ativo
                };
            });
            
            const usuariosQueProduziram = new Set(dadosProducaoRaw.map(p => p.usuario_id));

            // --- CÁLCULO DA META (CAPACIDADE) ---
            const mapMetas = {};
            dadosMetasRaw.forEach(m => {
                const a = parseInt(m.ano);
                const ms = parseInt(m.mes);
                const uId = m.usuario_id;
                
                if (!mapMetas[a]) mapMetas[a] = {};
                if (!mapMetas[a][ms]) {
                    mapMetas[a][ms] = { prodTotalDiario: 0, somaIndividual: 0, qtdAssistentesDB: 0, prodValues: [], assertValues: [], assertFinal: 98.0 };
                }
                
                const valProd = m.meta_producao ? parseInt(m.meta_producao) : 0;
                const valAssert = (m.meta_assertividade !== null) ? parseFloat(m.meta_assertividade) : 98.0;

                if (isGeral) {
                    const uData = mapUser[uId] || { perfil: '', funcao: '', nome: '' };
                    const termosGestao = ['GESTOR', 'AUDITOR', 'COORD', 'SUPERVIS', 'ADMIN'];
                    const isGestao = termosGestao.some(t => uData.perfil.includes(t) || uData.funcao.includes(t) || uData.nome.includes('GUPY'));
                    
                    // Gestão nunca entra na contagem de "cabeças" da meta da equipe
                    if (!isGestao) {
                        let considerar = false;
                        if (uData.ativo) considerar = true;
                        else if (!uData.ativo && usuariosQueProduziram.has(uId)) considerar = true;

                        if (considerar && valProd > 0) {
                            mapMetas[a][ms].somaIndividual += valProd;
                            mapMetas[a][ms].qtdAssistentesDB++; 
                            mapMetas[a][ms].prodValues.push(valProd);
                        }
                    }
                    mapMetas[a][ms].assertValues.push(valAssert);
                } else {
                    mapMetas[a][ms].prodTotalDiario = valProd;
                    mapMetas[a][ms].assertFinal = valAssert;
                }
            });

            // Projeção
            if (isGeral) {
                const targetAssistentes = this.getQtdAssistentesConfigurada(); 
                for (const a in mapMetas) {
                    for (const ms in mapMetas[a]) {
                        const d = mapMetas[a][ms];
                        let capacidadeDiaria = d.somaIndividual;
                        const validos = d.qtdAssistentesDB;
                        const gap = targetAssistentes - validos;
                        if (gap > 0) {
                            let valorProjecao = 100;
                            if (d.prodValues.length > 0) valorProjecao = this.calcularModaOuMedia(d.prodValues).valor;
                            capacidadeDiaria += (gap * valorProjecao);
                        } else if (validos === 0) {
                            capacidadeDiaria = 100 * targetAssistentes;
                        }
                        d.prodTotalDiario = capacidadeDiaria;
                        if (d.assertValues.length > 0) {
                            const res = this.calcularMetaInteligente(d.assertValues);
                            d.assertFinal = res.valor;
                        }
                    }
                }
            }

            // --- AGREGAÇÃO DE DADOS ---
            
            // Produção (AQUI SIM: Gestão ENTRA se produzir)
            const mapProd = new Map();
            if (isGeral) {
                dadosProducaoRaw.forEach(p => {
                    const data = p.data_referencia;
                    if (!mapProd.has(data)) mapProd.set(data, { quantidade: 0, fifo: 0, gt: 0, gp: 0, fator_soma: 0, fator_count: 0 });
                    const reg = mapProd.get(data);
                    reg.quantidade += Number(p.quantidade || 0);
                    reg.fifo += Number(p.fifo || 0);
                    reg.gt += Number(p.gradual_total || 0);
                    reg.gp += Number(p.gradual_parcial || 0);
                    reg.fator_soma += Number(p.fator || 1);
                    reg.fator_count++;
                });
                for (let [key, val] of mapProd) val.fator = val.fator_count > 0 ? (val.fator_soma / val.fator_count).toFixed(2) : 1.0;
            } else {
                dadosProducaoRaw.forEach(p => mapProd.set(p.data_referencia, p));
            }

            // Assertividade (AQUI NÃO: Gestão NUNCA ENTRA)
            const mapAssert = new Map();
            dadosAssertividadeRaw.forEach(a => {
                const uId = a.usuario_id;
                
                if (isGeral) {
                    const uData = mapUser[uId] || { perfil: '', funcao: '', nome: '' };
                    const blacklist = ['AUDITORA', 'GESTORA', 'ADMINISTRADOR', 'ADMIN', 'COORDENADOR', 'SUPERVISOR'];
                    const isGestao = blacklist.some(r => uData.funcao.includes(r) || uData.perfil.includes(r) || uData.nome.includes('GUPY') || uData.nome.includes('SUPERADMIN'));
                    
                    // REGRA DE OURO: Se é Gestão, IGNORA. Não importa se produziu.
                    if (isGestao) return; 
                }

                const key = a.data_referencia;
                if(!mapAssert.has(key)) mapAssert.set(key, { soma: 0, qtd: 0 });
                if (a.porcentagem_assertividade !== null) {
                    mapAssert.get(key).soma += this.parseValorPorcentagem(a.porcentagem_assertividade);
                    mapAssert.get(key).qtd++;
                }
            });

            const mapCheckins = new Set(dadosCheckins.map(c => c.data_referencia));
            const listaGrid = [];
            let totalProdReal = 0, totalMetaEsperada = 0, somaFatorProdutivo = 0;
            let totalAssertSoma = 0, totalAssertQtd = 0;
            const qtdTarget = this.getQtdAssistentesConfigurada();

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                if (d.getDay() === 0 || d.getDay() === 6) continue;
                const dataStr = d.toISOString().split('T')[0];
                const anoAtual = d.getFullYear();
                const mesAtual = d.getMonth() + 1;
                
                let configMes = null;
                if (mapMetas[anoAtual] && mapMetas[anoAtual][mesAtual]) configMes = mapMetas[anoAtual][mesAtual];
                else configMes = { prodTotalDiario: (isGeral ? 100 * qtdTarget : 100), assertFinal: 98.0 };

                const metaDiariaBase = configMes.prodTotalDiario;
                const prodDoDia = mapProd.get(dataStr);
                let fator = 1.0, qtdReal = 0, justif = '', temRegistro = false;

                if (prodDoDia) {
                    temRegistro = true;
                    fator = Number(prodDoDia.fator) || 1.0;
                    qtdReal = Number(prodDoDia.quantidade || 0);
                    justif = (prodDoDia.justificativa_abono || prodDoDia.justificativa || prodDoDia.justificativas || '').trim();
                    if (isGeral) justif = ''; 
                    totalProdReal += qtdReal;
                    somaFatorProdutivo += fator;
                }

                const metaDiaCalculada = Math.round(metaDiariaBase * fator);
                totalMetaEsperada += metaDiaCalculada;

                const assertDoDia = mapAssert.get(dataStr);
                let assertDiaDisplay = { val: 0, text: '-', class: 'text-slate-300' };
                
                if (assertDoDia && assertDoDia.qtd > 0) {
                    const mediaDia = assertDoDia.soma / assertDoDia.qtd;
                    totalAssertSoma += assertDoDia.soma;
                    totalAssertQtd += assertDoDia.qtd;
                    assertDiaDisplay.val = mediaDia;
                    assertDiaDisplay.text = this.fmtPct(mediaDia);
                    assertDiaDisplay.class = mediaDia >= configMes.assertFinal ? 
                        'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1' : 
                        'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                }

                if (temRegistro) {
                    listaGrid.push({
                        data: dataStr, fator, qtd: qtdReal, metaDia: metaDiaCalculada,
                        metaConfigAssert: configMes.assertFinal,
                        assertDisplay: assertDiaDisplay, justificativa: justif,
                        fifo: prodDoDia.fifo, gt: prodDoDia.gt, gp: prodDoDia.gp,
                        validado: mapCheckins.has(dataStr)
                    });
                }
            }

            listaGrid.sort((a, b) => b.data.localeCompare(a.data));
            if(tbody) tbody.innerHTML = listaGrid.length ? '' : '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';

            listaGrid.forEach(item => {
                const pctProd = item.metaDia > 0 ? (item.qtd / item.metaDia) * 100 : 0;
                let corProd = item.metaDia > 0 ? (pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold')) : 'text-slate-400';
                const [ano, mes, dia] = item.data.split('-');
                const diaSemana = new Date(item.data+'T12:00:00').toLocaleDateString('pt-BR', {weekday:'short'}).toUpperCase().replace('.','');
                const classJust = item.justificativa ? "text-slate-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block truncate w-full" : "text-slate-200 text-center block";
                
                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600 ${item.validado ? 'bg-emerald-50/5' : ''}">
                        <td class="px-3 py-2 border-r border-slate-100 font-bold text-slate-700 bg-slate-50/30"><span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano} ${!isGeral && item.validado ? '<i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : ''}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${Number(item.fator).toFixed(2)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.fifo||0}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gt||0}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gp||0}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-bold">${item.metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${this.fmtPct(pctProd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${item.metaConfigAssert}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 border-r border-slate-100 max-w-[200px]" title="${item.justificativa||''}"><span class="${classJust}">${item.justificativa||'-'}</span></td>
                    </tr>`;
            });

            this.setTxt('kpi-total', totalProdReal.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaEsperada.toLocaleString('pt-BR'));
            const pctVol = totalMetaEsperada > 0 ? (totalProdReal / totalMetaEsperada) * 100 : 0;
            if(document.getElementById('bar-volume')) document.getElementById('bar-volume').style.width = `${Math.min(pctVol, 100)}%`;
            this.setTxt('kpi-pct', this.fmtPct(pctVol));

            const assertReal = totalAssertQtd > 0 ? (totalAssertSoma / totalAssertQtd) : 0;
            this.setTxt('kpi-assertividade-val', this.fmtPct(assertReal));
            
            const configFim = mapMetas[anoFim]?.[new Date(dtFim).getMonth()+1] || { assertFinal: 98.0 };
            this.setTxt('kpi-meta-assert-target', `${configFim.assertFinal}%`);
            
            const assertAderencia = configFim.assertFinal > 0 ? (assertReal / configFim.assertFinal) * 100 : 0;
            this.setTxt('kpi-assert-performance', this.fmtPct(assertAderencia)); 
            if(document.getElementById('bar-assert')) document.getElementById('bar-assert').style.width = `${Math.min(assertAderencia, 100)}%`;

            const diasUteis = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias', this.fmtDias(somaFatorProdutivo));
            this.setTxt('kpi-dias-uteis', diasUteis);
            const pctDias = diasUteis > 0 ? (somaFatorProdutivo / diasUteis) * 100 : 0;
            if(document.getElementById('bar-dias')) document.getElementById('bar-dias').style.width = `${Math.min(pctDias, 100)}%`;

            const mesRef = new Date(dtFim).getMonth() + 1;
            const metaRefDiaria = mapMetas[anoFim]?.[mesRef]?.prodTotalDiario || (isGeral ? 100 * qtdTarget : 100);
            const mediaDiaria = Math.round(totalProdReal / (somaFatorProdutivo > 0 ? somaFatorProdutivo : 1));
            this.setTxt('kpi-media', mediaDiaria);
            this.setTxt('kpi-meta-dia', metaRefDiaria);
            const pctVel = metaRefDiaria > 0 ? (mediaDiaria / metaRefDiaria) * 100 : 0;
            this.setTxt('kpi-velocidade-pct', this.fmtPct(pctVel));
            if(document.getElementById('bar-velocidade')) document.getElementById('bar-velocidade').style.width = `${Math.min(pctVel, 100)}%`;

        } catch (err) {
            console.error("Erro Geral:", err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    getQtdAssistentesConfigurada: function() {
        const manual = localStorage.getItem('gupy_config_qtd_assistentes');
        const qtd = manual ? parseInt(manual) : 17; 
        return qtd > 0 ? qtd : 17;
    },

    calcularModaOuMedia: function(valores) {
        if (!valores || valores.length === 0) return { valor: 100 };
        const frequencia = {}; let maxFreq = 0; let moda = valores[0]; let soma = 0;
        valores.forEach(v => { soma += v; frequencia[v] = (frequencia[v] || 0) + 1; if (frequencia[v] > maxFreq) { maxFreq = frequencia[v]; moda = v; } });
        if ((maxFreq / valores.length) >= 0.3) { return { valor: moda }; } else { return { valor: Math.round(soma / valores.length) }; }
    },

    calcularMetaInteligente: function(valores) {
        if (!valores || valores.length === 0) return { valor: 98.0, isMedia: false };
        const soma = valores.reduce((a, b) => a + b, 0);
        const frequencia = {}; let maxFreq = 0; let moda = valores[0];
        valores.forEach(v => { frequencia[v] = (frequencia[v] || 0) + 1; if (frequencia[v] > maxFreq) { maxFreq = frequencia[v]; moda = v; } });
        if ((maxFreq / valores.length) >= 0.70) { return { valor: moda, isMedia: false }; } else { return { valor: Number((soma/valores.length).toFixed(2)), isMedia: true }; }
    },

    processarCheckingInterface: async function(uid, checkins) {
        if (!uid || MinhaArea.usuario.id !== parseInt(uid)) return;
        const ontemStr = '2025-12-16'; 
        const jaValidou = checkins.some(c => c.data_referencia === ontemStr);
        const container = document.getElementById('container-checkin-alert');
        if (!container) return;
        if (!jaValidou) {
            container.innerHTML = `<div class="bg-white border-l-4 border-blue-500 shadow-md rounded-r-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in"><div class="flex items-center gap-3"><div class="bg-blue-50 p-3 rounded-full text-blue-600"><i class="fas fa-clipboard-check text-xl"></i></div><div><h4 class="font-bold text-slate-700 text-sm">Checking Diário Pendente (TESTE)</h4><p class="text-xs text-slate-500">Confirme a conferência dos dados do dia 16/12/2025.</p></div></div><button onclick="MinhaArea.Geral.realizarCheckin('${ontemStr}')" class="group bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 hover:shadow-md active:scale-95 whitespace-nowrap"><span>Validar Dados</span><i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i></button></div>`;
            container.classList.remove('hidden');
        } else {
            container.innerHTML = `<div class="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-center justify-center gap-2 shadow-sm opacity-90 transition-all"><i class="fas fa-check-circle text-emerald-600"></i><span class="text-emerald-800 font-bold text-xs">Dados de 16/12/2025 confirmados!</span></div>`;
            container.classList.remove('hidden');
        }
    },

    realizarCheckin: async function(dataStr) {
        if(!confirm(`Confirma validação de ${dataStr}?`)) return;
        try {
            await Sistema.supabase.from('checking_diario').insert({ usuario_id: MinhaArea.usuario.id, data_referencia: dataStr, status: 'VALIDADO' });
            this.carregar();
        } catch (e) { alert('Erro: ' + e.message); }
    },

    fmtPct: function(v) { return (v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%'; },
    fmtNum: function(v) { return (v||0).toLocaleString('pt-BR'); },
    fmtDias: function(v) { return (v||0).toLocaleString('pt-BR', {maximumFractionDigits:1}); },
    parseValorPorcentagem: function(v) { return typeof v === 'number' ? v : parseFloat(String(v).replace('%','').replace(',','.')) || 0; },
    calcularDiasUteisMes: function(i, f) {
        let c = 0, cur = new Date(i+'T12:00:00'), end = new Date(f+'T12:00:00');
        while(cur<=end) { if(cur.getDay()!==0 && cur.getDay()!==6) c++; cur.setDate(cur.getDate()+1); }
        return c;
    },
    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};