/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Engine do Painel "Dia a Dia"
   ATUALIZAÇÃO: Filtro de Status (Ativos + Inativos com Produção)
*/

MinhaArea.Geral = {
    carregar: async function() {
        // --- 1. PREPARAÇÃO DE AMBIENTE ---
        const rawUid = MinhaArea.getUsuarioAlvo();
        const uid = rawUid ? parseInt(rawUid) : null;
        const isGeral = (uid === null); // Se null, é Visão Geral (Equipe)
        
        console.group("🚀 [DEBUG META] Iniciando Carga - Lógica de Status & Capacidade");
        console.log("Modo:", isGeral ? "Equipe" : "Individual");

        const tbody = document.getElementById('tabela-extrato');
        const alertContainer = document.getElementById('container-checkin-alert');
        
        if (alertContainer) {
            alertContainer.innerHTML = '';
            alertContainer.classList.add('hidden');
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Analisando equipe ativa...</span></div></td></tr>';

        try {
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // --- 2. BUSCA DE DADOS ---
            
            // Query 1: Produção
            let qProducao = Sistema.supabase.from('producao')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .limit(5000);

            // Query 2: Assertividade
            let qAssertividade = Sistema.supabase.from('assertividade')
                .select('data_referencia, porcentagem_assertividade, usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .not('porcentagem_assertividade', 'is', null)
                .limit(5000);

            // Query 3: Metas (Diárias)
            let qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio)
                .lte('ano', anoFim);

            // Query 4: Status dos Usuários (Novo Filtro)
            // Precisamos saber quem está ativo ou inativo hoje para decidir a meta
            let qUsuarios = Sistema.supabase.from('usuarios')
                .select('id, status, nome');

            if (!isGeral) {
                qProducao = qProducao.eq('usuario_id', uid);
                qAssertividade = qAssertividade.eq('usuario_id', uid);
                qMetas = qMetas.eq('usuario_id', uid);
                // Não filtramos qUsuarios aqui pois precisamos do status do alvo de qualquer jeito
            }

            // Query 5: Check-ins
            let qCheck = null;
            if (!isGeral) {
                qCheck = Sistema.supabase.from('checking_diario')
                    .select('data_referencia, status')
                    .eq('usuario_id', uid)
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim);
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

            // --- 3. MAPEAMENTO DE STATUS & PRODUÇÃO ---
            
            // Cria mapa de Status: ID -> 'ATIVO' | 'INATIVO'
            const mapStatusUser = {};
            dadosUsuarios.forEach(u => mapStatusUser[u.id] = (u.status || 'INATIVO').toUpperCase());

            // Cria Set de quem produziu no período (Para validar inativos que trabalharam)
            const usuariosQueProduziram = new Set(dadosProducaoRaw.map(p => p.usuario_id));

            // --- 4. CÁLCULO DA CAPACIDADE DIÁRIA (Meta) ---
            const mapMetas = {};
            
            dadosMetasRaw.forEach(m => {
                const a = parseInt(m.ano);
                const ms = parseInt(m.mes);
                const uId = m.usuario_id;
                
                if (!mapMetas[a]) mapMetas[a] = {};
                if (!mapMetas[a][ms]) {
                    mapMetas[a][ms] = { 
                        prodTotalDiario: 0,    
                        somaIndividual: 0,     
                        qtdAssistentesDB: 0,
                        prodValues: [],   
                        assertValues: [], 
                        assertFinal: 98.0, 
                        isMedia: false 
                    };
                }
                
                const valProd = m.meta_producao ? parseInt(m.meta_producao) : 0;
                const valAssert = (m.meta_assertividade !== null) ? parseFloat(m.meta_assertividade) : 98.0;

                if (isGeral) {
                    // LÓGICA DE FILTRAGEM (Ativos vs Inativos)
                    const status = mapStatusUser[uId] || 'INATIVO'; // Default Inativo se não achar
                    const produziuNoMes = usuariosQueProduziram.has(uId);

                    let considerarMeta = false;

                    // REGRA 1: Se é ATIVO, considera a meta (mesmo que não tenha produzido ainda)
                    if (status === 'ATIVO') {
                        considerarMeta = true;
                    } 
                    // REGRA 2: Se é INATIVO, só considera se produziu no período (trabalhou antes de sair)
                    else if (status === 'INATIVO' && produziuNoMes) {
                        considerarMeta = true;
                        // console.log(`⚠️ Considerando Inativo ID ${uId} pois tem produção.`);
                    }

                    if (considerarMeta && valProd > 0) {
                        mapMetas[a][ms].somaIndividual += valProd;
                        mapMetas[a][ms].qtdAssistentesDB++;
                        mapMetas[a][ms].prodValues.push(valProd); // Guarda para calculo de Moda
                    }
                    
                    // Assertividade sempre acumula para média geral
                    mapMetas[a][ms].assertValues.push(valAssert);

                } else {
                    // Visão Individual: Pega direto
                    mapMetas[a][ms].prodTotalDiario = valProd;
                    mapMetas[a][ms].assertFinal = valAssert;
                }
            });

            // Aplica Projeção para a Equipe (Preencher lacunas até o Target)
            if (isGeral) {
                const targetAssistentes = this.getQtdAssistentesConfigurada(); 
                
                for (const a in mapMetas) {
                    for (const ms in mapMetas[a]) {
                        const d = mapMetas[a][ms];
                        
                        let capacidadeDiaria = d.somaIndividual;
                        const assistentesValidos = d.qtdAssistentesDB;
                        const gap = targetAssistentes - assistentesValidos;
                        
                        if (gap > 0) {
                            // Se faltam assistentes para chegar no target (ex: target 17, achou 15 válidos)
                            // Projeta os faltantes usando a MODA ou MÉDIA dos válidos
                            let valorProjecao = 100; // fallback

                            if (d.prodValues.length > 0) {
                                valorProjecao = this.calcularModaOuMedia(d.prodValues).valor;
                            } else {
                                // Se não achou ninguém, usa 100
                                valorProjecao = 100;
                            }

                            const projecaoTotal = gap * valorProjecao;
                            capacidadeDiaria += projecaoTotal;
                            
                            console.log(`ℹ️ [Mês ${ms}/${a}] Ativos/Efetivos: ${assistentesValidos}. Projetando +${gap} x ${valorProjecao}.`);
                        } 
                        else if (assistentesValidos === 0) {
                            // Fallback extremo
                            capacidadeDiaria = 100 * targetAssistentes;
                        }

                        d.prodTotalDiario = capacidadeDiaria;
                        
                        // Assertividade (Média)
                        if (d.assertValues.length > 0) {
                            const res = this.calcularMetaInteligente(d.assertValues);
                            d.assertFinal = res.valor;
                            d.isMedia = res.isMedia;
                        }
                    }
                }
            }

            // --- 5. AGREGAÇÃO DE DADOS REAIS ---
            const mapProd = new Map();
            if (isGeral) {
                dadosProducaoRaw.forEach(p => {
                    const data = p.data_referencia;
                    if (!mapProd.has(data)) mapProd.set(data, { quantidade: 0, fifo: 0, gradual_total: 0, gradual_parcial: 0, fator_soma: 0, fator_count: 0, justificativa: 'Visão Consolidada' });
                    const reg = mapProd.get(data);
                    reg.quantidade += Number(p.quantidade || 0);
                    reg.fifo += Number(p.fifo || 0);
                    reg.gradual_total += Number(p.gradual_total || 0);
                    reg.gradual_parcial += Number(p.gradual_parcial || 0);
                    reg.fator_soma += Number(p.fator || 1);
                    reg.fator_count++;
                });
                for (let [key, val] of mapProd) val.fator = val.fator_count > 0 ? (val.fator_soma / val.fator_count).toFixed(2) : 1.0;
            } else {
                dadosProducaoRaw.forEach(p => mapProd.set(p.data_referencia, p));
            }

            const mapAssert = new Map();
            dadosAssertividadeRaw.forEach(a => {
                const key = a.data_referencia;
                if(!mapAssert.has(key)) mapAssert.set(key, { soma: 0, qtd: 0 });
                if (a.porcentagem_assertividade !== null) {
                    mapAssert.get(key).soma += this.parseValorPorcentagem(a.porcentagem_assertividade);
                    mapAssert.get(key).qtd++;
                }
            });

            const mapCheckins = new Set(dadosCheckins.map(c => c.data_referencia));

            // --- 6. RENDERIZAÇÃO DO GRID ---
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
                if (mapMetas[anoAtual] && mapMetas[anoAtual][mesAtual]) {
                    configMes = mapMetas[anoAtual][mesAtual];
                } else {
                    const metaPadrao = isGeral ? (100 * qtdTarget) : 100;
                    configMes = { prodTotalDiario: metaPadrao, assertFinal: 98.0, isMedia: false };
                }

                // Capacidade Diária (Já calculada com Ativos + Inativos Produtivos + Projeção)
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
                        fifo: prodDoDia.fifo, gt: prodDoDia.gradual_total, gp: prodDoDia.gradual_parcial,
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
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-bold" title="Meta Ajustada">${item.metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${this.fmtPct(pctProd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${item.metaConfigAssert}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 border-r border-slate-100 max-w-[200px]" title="${item.justificativa||''}"><span class="${classJust}">${item.justificativa||'-'}</span></td>
                    </tr>`;
            });

            // --- 7. ATUALIZAÇÃO KPIS ---
            this.setTxt('kpi-total', totalProdReal.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaEsperada.toLocaleString('pt-BR'));
            const pctVol = totalMetaEsperada > 0 ? (totalProdReal / totalMetaEsperada) * 100 : 0;
            if(document.getElementById('bar-volume')) document.getElementById('bar-volume').style.width = `${Math.min(pctVol, 100)}%`;
            
            this.setTxt('kpi-assertividade-val', this.fmtPct(totalAssertQtd > 0 ? (totalAssertSoma / totalAssertQtd) : 0));
            this.setTxt('kpi-pct', this.fmtPct(pctVol));
            
            const configFim = mapMetas[anoFim]?.[new Date(dtFim).getMonth()+1] || { assertFinal: 98.0, isMedia: false };
            const elMetaTag = document.getElementById('kpi-meta-assert-target');
            if (elMetaTag) {
                const label = (isGeral && configFim.isMedia) ? 'Meta (Média)' : 'Meta';
                elMetaTag.innerText = `${label}: ${configFim.assertFinal}%`;
            }

            const diasUteis = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias', this.fmtDias(somaFatorProdutivo));
            this.setTxt('kpi-dias-uteis', diasUteis);
            const pctDias = diasUteis > 0 ? (somaFatorProdutivo / diasUteis) * 100 : 0;
            if(document.getElementById('bar-dias')) document.getElementById('bar-dias').style.width = `${Math.min(pctDias, 100)}%`;

            // KPI VELOCIDADE
            const mesRef = new Date(dtFim).getMonth() + 1;
            const metaRefObj = mapMetas[anoFim]?.[mesRef];
            const metaRefDiaria = metaRefObj ? metaRefObj.prodTotalDiario : (isGeral ? 100 * qtdTarget : 100);

            const divisorVelocidade = somaFatorProdutivo > 0 ? somaFatorProdutivo : 1;
            const mediaDiaria = Math.round(totalProdReal / divisorVelocidade);
            
            const pctVel = metaRefDiaria > 0 ? (mediaDiaria / metaRefDiaria) * 100 : 0;
            
            const elMedia = document.getElementById('kpi-media');
            if(elMedia) elMedia.innerHTML = `${mediaDiaria} <span class="text-slate-300 mx-1">/</span> <span class="${pctVel >= 100 ? 'text-emerald-500' : 'text-amber-500'}">${this.fmtPct(pctVel)}</span>`;
            this.setTxt('kpi-meta-dia', metaRefDiaria);

            console.groupEnd();

        } catch (err) {
            console.error("Erro Geral:", err);
            console.groupEnd();
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    // --- FUNÇÕES AUXILIARES ---

    getQtdAssistentesConfigurada: function() {
        const manual = localStorage.getItem('gupy_config_qtd_assistentes');
        const qtd = manual ? parseInt(manual) : 17; 
        return qtd > 0 ? qtd : 17;
    },

    getDiasUteisNoMes: function(mes, ano) {
        const ultimoDia = new Date(ano, mes, 0).getDate();
        let uteis = 0;
        for (let i = 1; i <= ultimoDia; i++) {
            const dia = new Date(ano, mes - 1, i).getDay();
            if (dia !== 0 && dia !== 6) uteis++;
        }
        return uteis;
    },

    calcularModaOuMedia: function(valores) {
        if (!valores || valores.length === 0) return { valor: 100 };
        
        const frequencia = {};
        let maxFreq = 0;
        let moda = valores[0];
        let soma = 0;

        valores.forEach(v => {
            soma += v;
            frequencia[v] = (frequencia[v] || 0) + 1;
            if (frequencia[v] > maxFreq) {
                maxFreq = frequencia[v];
                moda = v;
            }
        });

        // Se mais de 30% da amostra tiver o mesmo valor, usa a Moda
        if ((maxFreq / valores.length) >= 0.3) {
            return { valor: moda };
        } else {
            return { valor: Math.round(soma / valores.length) };
        }
    },

    calcularMetaInteligente: function(valores) {
        if (!valores || valores.length === 0) return { valor: 98.0, isMedia: false };
        const soma = valores.reduce((a, b) => a + b, 0);
        const media = soma / valores.length;
        const frequencia = {};
        let maxFreq = 0;
        let moda = valores[0];

        valores.forEach(v => {
            frequencia[v] = (frequencia[v] || 0) + 1;
            if (frequencia[v] > maxFreq) {
                maxFreq = frequencia[v];
                moda = v;
            }
        });

        if ((maxFreq / valores.length) >= 0.70) {
            return { valor: moda, isMedia: false };
        } else {
            return { valor: Number(media.toFixed(2)), isMedia: true };
        }
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