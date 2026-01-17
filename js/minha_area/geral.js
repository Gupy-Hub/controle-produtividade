MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        const alertContainer = document.getElementById('container-checkin-alert');
        
        // Limpa alerta anterior
        if (alertContainer) alertContainer.innerHTML = '';
        if (alertContainer) alertContainer.classList.add('hidden');

        if (!uid) {
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Processando dados e validações...</span></div></td></tr>';

        try {
            // Conversão de datas para Date objects
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // 1. Buscas Otimizadas (INCLUINDO CHECKING)
            const [prodRes, assertRes, metasRes, checkRes] = await Promise.all([
                Sistema.supabase.from('producao').select('*').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim).limit(2000), 
                Sistema.supabase.from('assertividade').select('data_auditoria, porcentagem').eq('usuario_id', uid).gte('data_auditoria', inicio).lte('data_auditoria', fim).not('porcentagem', 'is', null).neq('porcentagem', '').limit(5000), 
                Sistema.supabase.from('metas').select('mes, ano, meta, meta_assertividade').eq('usuario_id', uid).gte('ano', anoInicio).lte('ano', anoFim),
                
                // Busca Validações (Checkings) no período
                Sistema.supabase.from('checking_diario').select('data_referencia, status, data_checkin').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim)
            ]);

            if (prodRes.error) throw prodRes.error;
            if (checkRes.error) throw checkRes.error;

            // --- LÓGICA DO CHECKING DIÁRIO (ONTEM) ---
            await this.processarCheckingInterface(uid, checkRes.data || []);

            // 2. Mapas de Acesso Rápido
            const mapMetas = {};
            (metasRes.data || []).forEach(m => {
                if (!mapMetas[m.ano]) mapMetas[m.ano] = {};
                mapMetas[m.ano][m.mes] = { prod: Number(m.meta), assert: Number(m.meta_assertividade) };
            });

            const mapProd = new Map();
            prodRes.data.forEach(p => mapProd.set(p.data_referencia, p));

            const mapAssert = new Map();
            assertRes.data.forEach(a => {
                const key = a.data_auditoria;
                if(!mapAssert.has(key)) mapAssert.set(key, { soma: 0, qtd: 0 });
                const valRaw = a.porcentagem;
                if (valRaw !== null && valRaw !== undefined && String(valRaw).trim() !== '') {
                    mapAssert.get(key).soma += this.parseValorPorcentagem(valRaw);
                    mapAssert.get(key).qtd++;
                }
            });

            // Mapa de Checkings (Para pintar o grid)
            const mapCheckins = new Set();
            (checkRes.data || []).forEach(c => mapCheckins.add(c.data_referencia));

            // 5. CÁLCULO CALENDÁRIO
            const listaGrid = [];
            let totalProdReal = 0, totalMetaEsperada = 0, somaFatorProdutivo = 0, diasComProducaoReal = 0;
            let totalAssertSoma = 0, totalAssertQtd = 0;
            
            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                if (d.getDay() === 0 || d.getDay() === 6) continue;

                const dataStr = d.toISOString().split('T')[0];
                const anoAtual = d.getFullYear();
                const mesAtual = d.getMonth() + 1;
                const metaConfig = mapMetas[anoAtual]?.[mesAtual] || { prod: 650, assert: 98.0 };
                
                const prodDoDia = mapProd.get(dataStr);
                
                let fator = 1.0;
                let qtdReal = 0;
                let justif = '';
                let temRegistro = false;

                if (prodDoDia) {
                    temRegistro = true;
                    fator = Number(prodDoDia.fator); 
                    if (isNaN(fator)) fator = 1.0;
                    qtdReal = Number(prodDoDia.quantidade || 0);
                    
                    justif = (prodDoDia.justificativa_abono || '').trim();
                    if (!justif) justif = (prodDoDia.justificativa || '').trim();
                    if (!justif) justif = (prodDoDia.justificativas || '').trim();

                    totalProdReal += qtdReal;
                    somaFatorProdutivo += fator;
                    if (fator > 0) diasComProducaoReal++;
                }

                const metaDiaCalculada = Math.round(metaConfig.prod * fator);
                totalMetaEsperada += metaDiaCalculada;

                const assertDoDia = mapAssert.get(dataStr);
                let assertDiaDisplay = { val: 0, text: '-', class: 'text-slate-300' };
                
                if (assertDoDia && assertDoDia.qtd > 0) {
                    const mediaDia = assertDoDia.soma / assertDoDia.qtd;
                    totalAssertSoma += assertDoDia.soma;
                    totalAssertQtd += assertDoDia.qtd;
                    assertDiaDisplay.val = mediaDia;
                    assertDiaDisplay.text = this.fmtPct(mediaDia);
                    assertDiaDisplay.class = mediaDia >= metaConfig.assert ? 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded px-1' : 'text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1';
                }

                if (temRegistro) {
                    listaGrid.push({
                        data: dataStr,
                        fator: fator,
                        qtd: qtdReal,
                        metaDia: metaDiaCalculada,
                        metaConfigAssert: metaConfig.assert,
                        assertDisplay: assertDiaDisplay,
                        justificativa: justif,
                        fifo: Number(prodDoDia.fifo || 0),
                        gt: Number(prodDoDia.gradual_total || 0),
                        gp: Number(prodDoDia.gradual_parcial || 0),
                        // Flag para saber se este dia foi validado
                        validado: mapCheckins.has(dataStr)
                    });
                }
            }

            listaGrid.sort((a, b) => b.data.localeCompare(a.data));

            // 6. Renderização Grid
            if(tbody) tbody.innerHTML = '';
            
            if (listaGrid.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            listaGrid.forEach(item => {
                const pctProd = item.metaDia > 0 ? (item.qtd / item.metaDia) * 100 : 0;
                let corProd = 'text-slate-400';
                if (item.metaDia > 0) corProd = pctProd >= 100 ? 'text-emerald-600 font-bold' : (pctProd >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');

                const [ano, mes, dia] = item.data.split('-');
                const dateObj = new Date(item.data + 'T12:00:00');
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');

                const temJust = item.justificativa && item.justificativa.length > 0;
                const classJust = temJust ? "text-slate-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block truncate w-full" : "text-slate-200 text-center block";

                // ÍCONE DE VALIDAÇÃO (CHECK) NO GRID
                const iconValidado = item.validado 
                    ? `<i class="fas fa-check-circle text-emerald-500 ml-1" title="Validado pela assistente"></i>` 
                    : `<i class="far fa-circle text-slate-200 ml-1 text-[8px]" title="Não validado"></i>`;

                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50/30 transition border-b border-slate-200 text-xs text-slate-600 ${item.validado ? 'bg-emerald-50/10' : ''}">
                        <td class="px-3 py-2 border-r border-slate-100 last:border-0 truncate font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano} ${iconValidado}
                        </td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center">${item.fator}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.fifo}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gt}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-500">${item.gp}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center font-black text-blue-700 bg-blue-50/20 border-x border-blue-100">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400">${item.metaDia}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center ${corProd}">${this.fmtPct(pctProd)}</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center text-slate-400 font-mono">${item.metaConfigAssert}%</td>
                        <td class="px-2 py-2 border-r border-slate-100 text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 border-r border-slate-100 last:border-0 max-w-[200px]" title="${temJust ? 'Obs: '+item.justificativa : ''}"><span class="${classJust}">${item.justificativa || '-'}</span></td>
                    </tr>`;
            });

            // 7. KPIs
            this.setTxt('kpi-total', totalProdReal.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaEsperada.toLocaleString('pt-BR'));
            const pctVol = totalMetaEsperada > 0 ? (totalProdReal / totalMetaEsperada) * 100 : 0;
            const barVolume = document.getElementById('bar-volume');
            if(barVolume) barVolume.style.width = `${Math.min(pctVol, 100)}%`;

            const mediaAssertGlobal = totalAssertQtd > 0 ? (totalAssertSoma / totalAssertQtd) : 0;
            this.setTxt('kpi-assertividade-val', this.fmtPct(mediaAssertGlobal));
            this.setTxt('kpi-pct', this.fmtPct(pctVol));

            const diasUteisPeriodo = this.calcularDiasUteisMes(inicio, fim);
            const diasProdutivos = somaFatorProdutivo;
            this.setTxt('kpi-dias', this.fmtDias(diasProdutivos)); 
            this.setTxt('kpi-dias-uteis', diasUteisPeriodo);
            
            const pctDias = diasUteisPeriodo > 0 ? (diasProdutivos / diasUteisPeriodo) * 100 : 0;
            const barDias = document.getElementById('bar-dias');
            if(barDias) barDias.style.width = `${Math.min(pctDias, 100)}%`;

            const divisorVelocidade = somaFatorProdutivo > 0 ? somaFatorProdutivo : 1;
            const mediaDiariaReal = Math.round(totalProdReal / divisorVelocidade);
            const metaReferencia = mapMetas[anoFim]?.[new Date(dtFim).getMonth()+1]?.prod || 650;
            const pctVelocidade = metaReferencia > 0 ? (mediaDiariaReal / metaReferencia) * 100 : 0;
            
            const elMedia = document.getElementById('kpi-media');
            if(elMedia) elMedia.innerHTML = `${mediaDiariaReal} <span class="text-slate-300 mx-1">/</span> <span class="${pctVelocidade >= 100 ? 'text-emerald-500' : 'text-amber-500'}">${this.fmtPct(pctVelocidade)}</span>`;
            this.setTxt('kpi-meta-dia', metaReferencia);

        } catch (err) {
            console.error(err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    // --- LÓGICA DE CHECKING / VALIDAÇÃO ---
    processarCheckingInterface: async function(uid, checkins) {
        // Se eu não sou o usuário dono da conta (sou gestor olhando), não mostro botão de ação
        if (MinhaArea.usuario.id !== parseInt(uid)) return;

        // 1. Calcula "Ontem" (Regra de Negócio: Só valida D-1)
        const hoje = new Date();
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        
        // Pula Fim de Semana (Se hoje é seg (1), ontem foi dom (0) -> valida sexta?)
        // Regra simples: Valida o dia cronológico anterior. Se foi domingo, valida domingo. 
        // Se a empresa não trabalha domingo, ok, valida que não trabalhou.
        // *Ajuste Fino:* Se ontem foi Domingo (0), recua para Sexta? 
        // Para simplificar e evitar erros de lógica complexa, vamos validar D-1 cronológico.
        // Se D-1 foi domingo e não teve produção, ela valida "Zero Produção".
        
        const ontemStr = ontem.toISOString().split('T')[0];
        const ontemFormatado = ontem.toLocaleDateString('pt-BR');

        // 2. Verifica se já validou "Ontem"
        const jaValidou = checkins.some(c => c.data_referencia === ontemStr);

        const container = document.getElementById('container-checkin-alert');
        if (!container) return;

        if (!jaValidou) {
            // MOSTRA BOTÃO DE AÇÃO
            container.innerHTML = `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between shadow-sm animate-pulse">
                    <div class="flex items-center gap-3">
                        <div class="bg-blue-100 p-2 rounded-full text-blue-600"><i class="fas fa-calendar-check text-xl"></i></div>
                        <div>
                            <h4 class="font-bold text-blue-900 text-sm">Checking Diário Pendente</h4>
                            <p class="text-xs text-blue-700">Por favor, confirme que analisou seus dados de ontem (${ontemFormatado}).</p>
                        </div>
                    </div>
                    <button onclick="MinhaArea.Geral.realizarCheckin('${ontemStr}')" 
                        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition flex items-center gap-2">
                        <i class="fas fa-check"></i> Validar ${ontemFormatado}
                    </button>
                </div>`;
            container.classList.remove('hidden');
        } else {
            // (Opcional) Mostra confirmação discreta ou nada
            // container.innerHTML = `<div class="text-center text-xs text-emerald-600 font-bold py-1"><i class="fas fa-check-circle"></i> Dados de ontem (${ontemFormatado}) validados com sucesso.</div>`;
            // container.classList.remove('hidden');
            container.classList.add('hidden'); // Melhor esconder para não poluir
        }
    },

    realizarCheckin: async function(dataStr) {
        if(!confirm(`Confirma que analisou e valida os dados do dia ${dataStr.split('-').reverse().join('/')}?`)) return;

        try {
            const uid = MinhaArea.usuario.id;
            const { error } = await Sistema.supabase
                .from('checking_diario')
                .insert({ usuario_id: uid, data_referencia: dataStr, status: 'VALIDADO' });

            if (error) throw error;

            // Feedback visual e recarrega
            const container = document.getElementById('container-checkin-alert');
            container.innerHTML = `<div class="bg-emerald-100 text-emerald-700 p-3 rounded-lg text-center font-bold border border-emerald-200"><i class="fas fa-check-circle"></i> Sucesso! Validação registrada.</div>`;
            
            setTimeout(() => {
                this.carregar(); // Recarrega para pintar o grid
            }, 1500);

        } catch (e) {
            alert('Erro ao validar: ' + e.message);
        }
    },

    // --- Helpers Format ---
    fmtPct: function(val) {
        if (val === null || val === undefined || isNaN(val)) return '0,00%';
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },
    fmtNum: function(val) { return val ? val.toLocaleString('pt-BR') : '0'; },
    fmtDias: function(val) { return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); },
    
    parseValorPorcentagem: function(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        let str = String(val).replace('%', '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    },

    calcularDiasUteisMes: function(inicio, fim) {
        let count = 0;
        const cur = new Date(inicio + 'T12:00:00');
        const end = new Date(fim + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    },

    zerarKPIs: function() {
        ['kpi-total','kpi-meta-acumulada','kpi-assertividade-val','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        const bars = ['bar-volume', 'bar-dias'];
        bars.forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};