/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v4.3 - SMART BATCHING (Híbrido: Rápido para leves, Seguro para pesados)
   MOTIVO: Eliminar erros 500 no console e otimizar tempo de download
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false, // 🔒 Trava de segurança

    // --- MANIPULAÇÃO DE DADOS ---
    fetchParalelo: async function(tabela, colunas, filtrosFn) {
        // 1. Count Inicial
        let qCount = Sistema.supabase.from(tabela).select('*', { count: 'exact', head: true });
        qCount = filtrosFn(qCount);
        const { count, error } = await qCount;
        
        if (error) { 
            console.error(`❌ Erro count ${tabela}:`, error); 
            return []; 
        }
        if (!count || count === 0) return [];

        const pageSize = 1000;
        const totalPages = Math.ceil(count / pageSize);
        let allData = [];

        // CONFIGURAÇÃO INTELIGENTE DE LOTE
        // Se for assertividade (pesada), vai 1 por 1 (Serial) para não travar o banco.
        // Se forem outras (leves), vai 5 por 5 (Paralelo) para ser rápido.
        const isHeavyTable = (tabela === 'assertividade');
        const BATCH_SIZE = isHeavyTable ? 1 : 5;
        const modo = isHeavyTable ? 'SERIAL (Blindado)' : 'TURBO (Rápido)';

        console.log(`🛡️ [v4.3] ${tabela}: Baixando ${count} registros (${totalPages} pgs). Modo: ${modo}...`);

        // Helper: Retry Strategy
        const fetchPageSafe = async (pageIndex) => {
            const maxRetries = 5; 
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    let q = Sistema.supabase.from(tabela)
                        .select(colunas)
                        .order('id', { ascending: true }) 
                        .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);
                    
                    q = filtrosFn(q);
                    
                    const { data, error } = await q;
                    if (error) throw error;
                    return data || [];
                } catch (err) {
                    // Backoff mais agressivo para tabela pesada
                    const baseDelay = isHeavyTable ? 3000 : 1000;
                    const delay = baseDelay * attempt; 
                    
                    console.warn(`⚠️ [RETRY] ${tabela} Pág ${pageIndex}: Tentativa ${attempt}/${maxRetries} falhou. Aguardando ${delay}ms...`);
                    
                    if (attempt === maxRetries) throw err;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        };

        // 2. Processamento
        for (let i = 0; i < totalPages; i += BATCH_SIZE) {
            const batchPromises = [];
            for (let j = i; j < i + BATCH_SIZE && j < totalPages; j++) {
                batchPromises.push(fetchPageSafe(j));
            }

            try {
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(data => {
                    if (data) allData = allData.concat(data);
                });
                
                // Feedback visual de progresso
                const progresso = Math.min(((i + BATCH_SIZE) / totalPages) * 100, 100).toFixed(0);
                
                // Log reduzido para não travar o navegador
                if (i % (BATCH_SIZE * 5) === 0 || progresso == '100') {
                    console.log(`⏳ [${modo}] ${tabela}: ${progresso}% carregado (${allData.length} recs)...`);
                }
                
            } catch (err) {
                console.error(`❌ [FALHA CRÍTICA] Lote ${i} da tabela ${tabela}.`, err);
            }
        }
        
        const gap = count - allData.length;
        if (gap === 0) {
             console.log(`✅ [${modo}] ${tabela}: Sucesso Total. ${allData.length}/${count}.`);
        } else {
             console.warn(`⚠️ [${modo}] ${tabela}: Concluído com gap. ${allData.length}/${count} (Faltam: ${gap})`);
        }
        
        return allData;
    },

    carregar: async function() {
        if (this.isLocked) {
            console.warn("⛔ Metas: Aguarde o carregamento atual terminar.");
            return;
        }
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo Espelho (v4.3 - Smart Batching)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}

        const uid = MinhaArea.getUsuarioAlvo(); 
        const isGeral = (uid === null);
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            console.time("⏱️ Tempo Total");

            // Queries e Filtros
            const applyFiltersProd = (q) => {
                let qq = q.gte('data_referencia', inicio).lte('data_referencia', fim);
                if (uid) qq = qq.eq('usuario_id', uid);
                return qq;
            };
            const applyFiltersAssert = (q) => {
                let qq = q.gte('data_referencia', inicio).lte('data_referencia', fim);
                if (uid) qq = qq.eq('usuario_id', uid);
                return qq;
            };
            const applyFiltersUser = (q) => q;

            let qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio).lte('ano', anoFim);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);

            let dadosProducaoRaw = [], dadosAssertividadeRaw = [], dadosMetasRaw = [], dadosUsuarios = [];

            // --- EXECUÇÃO OTIMIZADA ---
            
            // 1. Dados Leves (Usuários + Metas) -> Pode ir rápido
            dadosUsuarios = await this.fetchParalelo('usuarios', 'id, ativo, nome, perfil, funcao', applyFiltersUser);
            const resMetas = await qMetas;
            dadosMetasRaw = resMetas.data || [];

            // 2. Produção (Médio) -> Modo Turbo
            dadosProducaoRaw = await this.fetchParalelo('producao', '*', applyFiltersProd);

            // 3. Assertividade (Pesado) -> Modo Serial (Blindado)
            // Aqui é onde ocorriam os erros 500. Agora irá 1 por 1.
            dadosAssertividadeRaw = await this.fetchParalelo('assertividade', 'id, data_referencia, porcentagem_assertividade, status, qtd_nok, usuario_id, auditora_nome', applyFiltersAssert);
            
            console.timeEnd("⏱️ Tempo Total");

            // --- PROCESSAMENTO (Business Logic) ---
            const idsBloqueados = new Set();
            const mapUser = {};
            const termosGestao = ['AUDITORA', 'GESTORA', 'ADMIN', 'COORD', 'SUPERVIS', 'LIDER'];
            const nomesBloqueados = ['VANESSA', 'KEILA', 'BRENDA', 'PATRICIA', 'PATRÍCIA', 'GUPY'];

            dadosUsuarios.forEach(u => {
                mapUser[u.id] = {
                    perfil: (u.perfil || 'ASSISTENTE').toUpperCase().trim(),
                    funcao: (u.funcao || '').toUpperCase().trim(),
                    nome: (u.nome || '').toUpperCase().trim(),
                    ativo: u.ativo
                };
                const nomeUpper = mapUser[u.id].nome;
                const funcaoUpper = mapUser[u.id].funcao;
                const perfilUpper = mapUser[u.id].perfil;
                const isGestao = termosGestao.some(t => funcaoUpper.includes(t) || perfilUpper.includes(t));
                const isNomeProibido = nomesBloqueados.some(n => nomeUpper.includes(n));
                if (isGestao || isNomeProibido) idsBloqueados.add(u.id);
            });

            const usuariosQueProduziram = new Set(dadosProducaoRaw.map(p => p.usuario_id));

            // Configuração Metas
            const mapMetas = {};
            dadosMetasRaw.forEach(m => {
                const a = parseInt(m.ano);
                const ms = parseInt(m.mes);
                const uId = m.usuario_id;
                
                if (!mapMetas[a]) mapMetas[a] = {};
                if (!mapMetas[a][ms]) mapMetas[a][ms] = { prodTotalDiario: 0, somaIndividual: 0, qtdAssistentesDB: 0, prodValues: [], assertValues: [], assertFinal: 98.0 };
                
                const valProd = m.meta_producao ? parseInt(m.meta_producao) : 0;
                const valAssert = (m.meta_assertividade !== null) ? parseFloat(m.meta_assertividade) : 98.0;

                if (isGeral) {
                    const isBloqueado = idsBloqueados.has(uId);
                    const uData = mapUser[uId];
                    if (!isBloqueado && uData) {
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

            // Mapas de Produção e Assertividade
            const mapProd = new Map();
            if (isGeral) {
                dadosProducaoRaw.forEach(p => {
                    const data = p.data_referencia;
                    if (!mapProd.has(data)) mapProd.set(data, { quantidade: 0, fator_soma: 0, fator_count: 0, fator: 0 });
                    const reg = mapProd.get(data);
                    reg.quantidade += Number(p.quantidade || 0);
                    reg.fator_soma += Number(p.fator || 1);
                    reg.fator_count++;
                });
                for (let [key, val] of mapProd) val.fator = val.fator_count > 0 ? (val.fator_soma / val.fator_count) : 1.0;
            } else {
                dadosProducaoRaw.forEach(p => mapProd.set(p.data_referencia, p));
            }

            const mapAssert = new Map();
            const STATUS_IGNORAR_GRAFICO = ['REV', 'EMPR', 'DUPL', 'IA']; 
            dadosAssertividadeRaw.forEach(a => {
                const uId = a.usuario_id;
                const dataKey = a.data_referencia;
                if (!dataKey) return;
                if (isGeral && (idsBloqueados.has(uId) || !mapUser[uId])) return;
                const status = (a.status || '').toUpperCase();
                if (!STATUS_IGNORAR_GRAFICO.includes(status) && a.porcentagem_assertividade !== null) {
                    if(!mapAssert.has(dataKey)) mapAssert.set(dataKey, []);
                    let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                    if (!isNaN(val)) mapAssert.get(dataKey).push(val);
                }
            });

            // Gráficos e KPIs
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            const labels = [], dataProdReal = [], dataProdMeta = [], dataAssertReal = [], dataAssertMeta = [];
            const aggMensal = new Map(); 
            const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                const isFDS = (d.getDay() === 0 || d.getDay() === 6);
                if (!modoMensal && isFDS) continue; 
                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;
                const dia = d.getDate();

                const metaConfig = mapMetas[ano]?.[mes] || { prodTotalDiario: (isGeral ? 100 * this.getQtdAssistentesConfigurada() : 100), assertFinal: 98.0 };
                const prodDia = mapProd.get(dataStr);
                const qtd = prodDia ? Number(prodDia.quantidade || 0) : 0;
                const fator = prodDia ? Number(prodDia.fator) : (isFDS ? 0 : 1); 
                const metaDia = Math.round(metaConfig.prodTotalDiario * (isNaN(fator) ? 1 : fator));
                const assertsDia = mapAssert.get(dataStr) || [];
                
                if (modoMensal) {
                    const chaveMes = `${ano}-${mes}`;
                    if (!aggMensal.has(chaveMes)) aggMensal.set(chaveMes, { label: mesesNomes[mes-1], prodReal: 0, prodMeta: 0, assertSoma: 0, assertQtd: 0, assertMetaSoma: 0 });
                    const slot = aggMensal.get(chaveMes);
                    slot.prodReal += qtd;
                    slot.prodMeta += metaDia;
                    if (assertsDia.length > 0) assertsDia.forEach(v => { slot.assertSoma += v; slot.assertQtd++; });
                    slot.assertMetaSoma = metaConfig.assertFinal; 
                } else {
                    labels.push(`${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                    dataProdReal.push(qtd);
                    dataProdMeta.push(metaDia);
                    dataAssertReal.push(assertsDia.length > 0 ? (assertsDia.reduce((a,b)=>a+b,0)/assertsDia.length) : null);
                    dataAssertMeta.push(Number(metaConfig.assertFinal));
                }
            }

            if (modoMensal) {
                for (const [key, val] of aggMensal.entries()) {
                    labels.push(val.label); 
                    dataProdReal.push(val.prodReal);
                    dataProdMeta.push(val.prodMeta);
                    dataAssertReal.push(val.assertQtd > 0 ? (val.assertSoma / val.assertQtd) : null);
                    dataAssertMeta.push(Number(val.assertMetaSoma)); 
                }
            }

            this.atualizarCardsKPI(mapProd, dadosAssertividadeRaw, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsBloqueados);

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Mensal' : 'Diário');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade', '#059669', true);

        } catch (err) {
            console.error("❌ Erro Metas:", err);
        } finally {
            this.isLocked = false; 
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

    atualizarCardsKPI: function(mapProd, asserts, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsBloqueados) {
        let totalValidados = 0; 
        let totalMeta = 0;
        let somaAssertMedia = 0;
        let qtdAssertMedia = 0;
        let countTotalAuditados = 0;
        let countErros = 0;
        let somaMetaAssertConfigurada = 0;
        let diasParaMediaMeta = 0;
        const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

        let tempDate = new Date(dtInicio);
        for (let d = new Date(tempDate); d <= dtFim; d.setDate(d.getDate() + 1)) {
            const isFDS = (d.getDay() === 0 || d.getDay() === 6);
            const dataStr = d.toISOString().split('T')[0];
            const ano = d.getFullYear();
            const mes = d.getMonth() + 1;
            const metaConfig = mapMetas[ano]?.[mes] || { prodTotalDiario: (isGeral ? 100 * this.getQtdAssistentesConfigurada() : 100), assertFinal: 98.0 };
            const prodDia = mapProd.get(dataStr);
            const fator = prodDia ? Number(prodDia.fator) : (isFDS ? 0 : 1);
            if (prodDia) totalValidados += Number(prodDia.quantidade || 0);
            totalMeta += Math.round(metaConfig.prodTotalDiario * (isNaN(fator)?1:fator));
            somaMetaAssertConfigurada += metaConfig.assertFinal;
            diasParaMediaMeta++;
        }

        asserts.forEach(a => {
            const uId = a.usuario_id;
            let isKpiEligible = true;
            if (isGeral && (idsBloqueados.has(uId) || !mapUser[uId])) isKpiEligible = false;
            const status = (a.status || '').toUpperCase();
            if (isKpiEligible && !STATUS_IGNORAR.includes(status) && a.porcentagem_assertividade !== null) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { somaAssertMedia += val; qtdAssertMedia++; }
            }
            if (a.auditora_nome && a.auditora_nome.trim() !== '') {
                countTotalAuditados++; 
                if (a.qtd_nok && Number(a.qtd_nok) > 0) countErros++;
            }
        });

        const mediaAssert = qtdAssertMedia > 0 ? (somaAssertMedia / qtdAssertMedia) : 0;
        const metaAssertRef = diasParaMediaMeta > 0 ? (somaMetaAssertConfigurada / diasParaMediaMeta) : 98.0;
        const totalAcertos = countTotalAuditados - countErros;
        const pctCobertura = totalValidados > 0 ? ((countTotalAuditados / totalValidados) * 100) : 0;
        const pctResultado = countTotalAuditados > 0 ? ((totalAcertos / countTotalAuditados) * 100) : 100;

        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-blue-600');
        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-emerald-500' : 'bg-rose-500');
        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', countTotalAuditados.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-pct-cobertura', pctCobertura.toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%');
        this.setBar('bar-auditoria-cov', pctCobertura, 'bg-purple-500');
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-total-nok', countErros.toLocaleString('pt-BR')); 
        this.setBar('bar-auditoria-res', pctResultado, pctResultado >= 95 ? 'bg-emerald-500' : 'bg-rose-500');
    },

    renderizarGrafico: function(canvasId, labels, dataReal, dataMeta, labelReal, colorHex, isPercent) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (canvasId === 'graficoEvolucaoProducao') { if (this.chartProd) this.chartProd.destroy(); } 
        else { if (this.chartAssert) this.chartAssert.destroy(); }

        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: labelReal,
                        data: dataReal,
                        borderColor: colorHex,
                        borderWidth: 2,
                        backgroundColor: colorHex + '10', 
                        pointBackgroundColor: '#fff',
                        pointBorderColor: colorHex,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        fill: true,
                        tension: 0.3,
                        order: 2
                    },
                    {
                        label: 'Meta',
                        data: dataMeta,
                        borderColor: '#cbd5e1',
                        borderWidth: 2,
                        pointRadius: 0,
                        borderDash: [4, 4],
                        tension: 0.3,
                        fill: false,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 6,
                        displayColors: true,
                        bodyFont: { size: 11 },
                        callbacks: {
                            label: function(ctx) {
                                let val = ctx.raw;
                                if (val === null || val === undefined) return ctx.dataset.label + ': -';
                                val = val.toLocaleString('pt-BR', { minimumFractionDigits: isPercent ? 2 : 0, maximumFractionDigits: isPercent ? 2 : 0 });
                                return ctx.dataset.label + ': ' + val + (isPercent ? '%' : '');
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        border: { display: false },
                        grid: { color: '#f1f5f9' }, 
                        ticks: { font: { size: 10 }, color: '#94a3b8', callback: function(val) { return isPercent ? val + '%' : val; } } 
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                    }
                }
            }
        };
        const newChart = new Chart(ctx, config);
        if (canvasId === 'graficoEvolucaoProducao') this.chartProd = newChart;
        else this.chartAssert = newChart;
    },

    resetarCards: function() {
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta',
         'auditoria-total-validados','auditoria-total-auditados','auditoria-pct-cobertura',
         'auditoria-total-ok','auditoria-total-nok'].forEach(id => this.setTxt(id, '--'));
        ['bar-meta-assert','bar-meta-prod','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.style.width = '0%'; 
        });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, colorClass) {
        const el = document.getElementById(id);
        if(el) {
            el.style.width = Math.min(pct, 100) + '%';
            el.className = `h-full rounded-full transition-all duration-700 ${colorClass}`;
        }
    }
};