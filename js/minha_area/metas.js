/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: Filtro SNIPER (Nomes + Cargos)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    carregar: async function() {
        console.log("🚀 Metas: Iniciando carregamento...");
        const uid = MinhaArea.getUsuarioAlvo(); 
        const isGeral = (uid === null);

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // 1. Buscas
            let qProducao = Sistema.supabase.from('producao')
                .select('*').gte('data_referencia', inicio).lte('data_referencia', fim).limit(5000);

            let qAssertividade = Sistema.supabase.from('assertividade')
                .select('data_referencia, porcentagem_assertividade, status, qtd_nok, usuario_id') 
                .gte('data_referencia', inicio).lte('data_referencia', fim).not('porcentagem_assertividade', 'is', null).limit(5000);

            let qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio).lte('ano', anoFim);

            let qUsuarios = Sistema.supabase.from('usuarios')
                .select('id, ativo, nome, perfil, funcao')
                .limit(10000); 

            if (!isGeral) {
                qProducao = qProducao.eq('usuario_id', uid);
                qAssertividade = qAssertividade.eq('usuario_id', uid);
                qMetas = qMetas.eq('usuario_id', uid);
            }

            const [prodRes, assertRes, metasRes, userRes] = await Promise.all([
                qProducao, qAssertividade, qMetas, qUsuarios
            ]);

            const dadosProducaoRaw = prodRes.data || [];
            const dadosAssertividadeRaw = assertRes.data || []; 
            const dadosMetasRaw = metasRes.data || [];
            const dadosUsuarios = userRes.data || [];

            // --- CRIAÇÃO DA LISTA NEGRA (IDS PROIBIDOS) ---
            const idsProibidosNaAssertividade = new Set();
            const mapUser = {};

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

                // 1. Pelo Cargo/Perfil
                const termosGestao = ['AUDITORA', 'GESTORA', 'ADMIN', 'COORD', 'SUPERVIS', 'LIDER'];
                let isGestao = termosGestao.some(t => funcaoUpper.includes(t) || perfilUpper.includes(t));

                // 2. Pelo NOME (Filtro Nominal)
                const nomesBloqueados = ['VANESSA', 'KEILA', 'BRENDA', 'PATRICIA', 'PATRÍCIA', 'GUPY'];
                const isNomeBloqueado = nomesBloqueados.some(n => nomeUpper.includes(n));

                if (isGestao || isNomeBloqueado) {
                    idsProibidosNaAssertividade.add(u.id);
                    idsProibidosNaAssertividade.add(String(u.id));
                }
            });

            const usuariosQueProduziram = new Set(dadosProducaoRaw.map(p => p.usuario_id));

            // --- CÁLCULO DA META ---
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
                    const isBloqueado = idsProibidosNaAssertividade.has(uId) || idsProibidosNaAssertividade.has(String(uId));
                    const uData = mapUser[uId];

                    // Ignora Meta se estiver na lista negra
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

            // --- PROCESSAMENTO DADOS REAIS ---
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
            const STATUS_IGNORAR = ['REV', 'EMPR', 'DUPL', 'IA'];

            dadosAssertividadeRaw.forEach(a => {
                const uId = a.usuario_id;
                const dataKey = a.data_referencia;
                if (!dataKey) return;
                
                const status = (a.status || '').toUpperCase();
                if (STATUS_IGNORAR.includes(status)) return;

                if (isGeral) {
                    // SNIPER CHECK:
                    if (idsProibidosNaAssertividade.has(uId) || idsProibidosNaAssertividade.has(String(uId))) {
                        return; // Ignora se for Vanessa, Keila, etc.
                    }
                    if (!mapUser[uId]) return; // Ignora desconhecidos
                }

                if(!mapAssert.has(dataKey)) mapAssert.set(dataKey, []);
                let valStr = String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.');
                let val = parseFloat(valStr);
                if (!isNaN(val)) mapAssert.get(dataKey).push(val);
            });

            // --- GRÁFICOS ---
            const diffDays = (dtFim - dtInicio) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDays > 35;
            
            const labels = [], dataProdReal = [], dataProdMeta = [], dataAssertReal = [], dataAssertMeta = [];
            const aggMensal = new Map(); 
            const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

            this.atualizarCardsKPI(mapProd, dadosAssertividadeRaw, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsProibidosNaAssertividade);

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação (Docs)', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade (%)', '#059669', true);

        } catch (err) {
            console.error("❌ Erro Metas:", err);
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

    atualizarCardsKPI: function(mapProd, asserts, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsProibidosNaAssertividade) {
        let totalValidados = 0; 
        let totalMeta = 0;
        let somaAssertMedia = 0;
        let qtdAssertMedia = 0;
        let totalErros = 0; 

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
        }

        asserts.forEach(a => {
            const uId = a.usuario_id;
            
            if (isGeral) {
                // SNIPER CHECK KPI:
                if (idsProibidosNaAssertividade.has(uId) || idsProibidosNaAssertividade.has(String(uId))) {
                    return; 
                }
                if (!mapUser[uId]) return;
            }

            const status = (a.status || '').toUpperCase();
            if (!STATUS_IGNORAR.includes(status)) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { 
                    somaAssertMedia += val; 
                    qtdAssertMedia++; 
                }
            }
            
            if (a.qtd_nok && Number(a.qtd_nok) > 0) totalErros++;
        });

        const mediaAssert = qtdAssertMedia > 0 ? (somaAssertMedia / qtdAssertMedia) : 0;
        const totalAuditados = asserts.length; 
        const semAuditoria = Math.max(0, totalValidados - totalAuditados);
        const totalAcertos = totalAuditados - totalErros;

        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-blue-600');

        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        const metaAssertRef = 98.0; 
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-emerald-500' : 'bg-rose-500');

        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
        
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-total-nok', totalErros.toLocaleString('pt-BR')); 
    },

    renderizarGrafico: function(canvasId, labels, dataReal, dataMeta, labelReal, colorReal, isPercent) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (canvasId === 'graficoEvolucaoProducao') {
            if (this.chartProd) this.chartProd.destroy();
        } else {
            if (this.chartAssert) this.chartAssert.destroy();
        }

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: labelReal,
                        data: dataReal,
                        backgroundColor: colorReal,
                        borderRadius: 4,
                        barPercentage: 0.6,
                        order: 2
                    },
                    {
                        label: 'Meta Esperada',
                        data: dataMeta,
                        type: 'line',
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#94a3b8',
                        pointRadius: 3,
                        borderDash: [5, 5],
                        tension: 0.1,
                        order: 1,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } },
                    tooltip: {
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
                        grid: { color: '#f1f5f9' }, 
                        ticks: { callback: function(val) { return isPercent ? val + '%' : val; } } 
                    },
                    x: { grid: { display: false } }
                }
            }
        };

        const newChart = new Chart(ctx, config);

        if (canvasId === 'graficoEvolucaoProducao') this.chartProd = newChart;
        else this.chartAssert = newChart;
    },

    resetarCards: function() {
        ['meta-assert-real','meta-assert-meta','meta-prod-real','meta-prod-meta','auditoria-total-validados','auditoria-total-auditados','auditoria-sem-audit','auditoria-total-ok','auditoria-total-nok'].forEach(id => this.setTxt(id, '--'));
        ['bar-meta-assert','bar-meta-prod'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, colorClass) {
        const el = document.getElementById(id);
        if(el) {
            el.style.width = Math.min(pct, 100) + '%';
            el.className = `h-full rounded-full transition-all duration-1000 ${colorClass}`;
        }
    }
};