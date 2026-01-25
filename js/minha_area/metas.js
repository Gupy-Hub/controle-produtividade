/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO 2026: Gráficos High-End (Gradientes, Smooth Curves) + Bento Layout Support
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,

    // --- MANIPULAÇÃO DE DADOS (Core Inalterado) ---
    fetchAll: async function(table, queryBuilder) {
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const { data, error } = await queryBuilder
                .range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) throw error;
            if (data.length > 0) {
                allData = allData.concat(data);
                page++;
                if (data.length < pageSize) hasMore = false;
            } else {
                hasMore = false;
            }
        }
        return allData;
    },

    carregar: async function() {
        console.log("🚀 Metas: Iniciando renderização High-Fidelity...");
        const uid = MinhaArea.getUsuarioAlvo(); 
        const isGeral = (uid === null);

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            // Buscas (Otimizadas)
            const qProducao = Sistema.supabase.from('producao')
                .select('*').gte('data_referencia', inicio).lte('data_referencia', fim);

            const qAssertividade = Sistema.supabase.from('assertividade')
                .select('data_referencia, porcentagem_assertividade, status, qtd_nok, usuario_id') 
                .gte('data_referencia', inicio).lte('data_referencia', fim)
                .not('porcentagem_assertividade', 'is', null);

            const qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio).lte('ano', anoFim);

            const qUsuarios = Sistema.supabase.from('usuarios')
                .select('id, ativo, nome, perfil, funcao');

            let dadosProducaoRaw = [], dadosAssertividadeRaw = [], dadosMetasRaw = [], dadosUsuarios = [];

            if (!isGeral) {
                const [p, a, m, u] = await Promise.all([
                    qProducao.eq('usuario_id', uid),
                    qAssertividade.eq('usuario_id', uid),
                    qMetas.eq('usuario_id', uid),
                    qUsuarios
                ]);
                dadosProducaoRaw = p.data || [];
                dadosAssertividadeRaw = a.data || [];
                dadosMetasRaw = m.data || [];
                dadosUsuarios = u.data || [];
            } else {
                const [p, a, m, u] = await Promise.all([
                    this.fetchAll('producao', qProducao),
                    this.fetchAll('assertividade', qAssertividade),
                    qMetas,
                    this.fetchAll('usuarios', qUsuarios)
                ]);
                dadosProducaoRaw = p;
                dadosAssertividadeRaw = a;
                dadosMetasRaw = m.data || m;
                dadosUsuarios = u;
            }

            // --- LÓGICA DE NEGÓCIO (Mantida) ---
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

            // Cálculo Meta
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

            // Dados Reais
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
                    if (idsBloqueados.has(uId)) return;
                    if (!mapUser[uId]) return;
                }
                if(!mapAssert.has(dataKey)) mapAssert.set(dataKey, []);
                let valStr = String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.');
                let val = parseFloat(valStr);
                if (!isNaN(val)) mapAssert.get(dataKey).push(val);
            });

            // Preparação Gráficos
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

            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Visão Mensal' : 'Visão Diária');
            
            // --- RENDERIZAÇÃO 2026: Gráficos com Gradientes e Curvas ---
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dataProdReal, dataProdMeta, 'Validação', '#3b82f6', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dataAssertReal, dataAssertMeta, 'Assertividade', '#10b981', true);

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

    atualizarCardsKPI: function(mapProd, asserts, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsBloqueados) {
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
                if (idsBloqueados.has(uId)) return;
                if (!mapUser[uId]) return;
            }
            const status = (a.status || '').toUpperCase();
            if (!STATUS_IGNORAR.includes(status)) {
                let val = parseFloat(String(a.porcentagem_assertividade || '0').replace('%','').replace(',','.'));
                if(!isNaN(val)) { somaAssertMedia += val; qtdAssertMedia++; }
            }
            if (a.qtd_nok && Number(a.qtd_nok) > 0) totalErros++;
        });

        const mediaAssert = qtdAssertMedia > 0 ? (somaAssertMedia / qtdAssertMedia) : 0;
        const totalAuditados = asserts.length; 
        const semAuditoria = Math.max(0, totalValidados - totalAuditados);
        const totalAcertos = totalAuditados - totalErros;
        const pctAuditado = totalValidados > 0 ? ((totalAuditados / totalValidados) * 100) : 0;

        // Atualização DOM
        this.setTxt('meta-prod-real', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', totalMeta > 0 ? (totalValidados/totalMeta)*100 : 0, 'bg-gradient-to-r from-blue-500 to-blue-400'); // Gradiente via classe Tailwind

        this.setTxt('meta-assert-real', mediaAssert.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        const metaAssertRef = 98.0; 
        this.setTxt('meta-assert-meta', metaAssertRef.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})+'%');
        this.setBar('bar-meta-assert', (mediaAssert/metaAssertRef)*100, mediaAssert >= metaAssertRef ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-rose-500 to-rose-400');

        this.setTxt('auditoria-total-validados', totalValidados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-auditados', totalAuditados.toLocaleString('pt-BR'));
        this.setTxt('auditoria-sem-audit', semAuditoria.toLocaleString('pt-BR'));
        this.setTxt('auditoria-pct-cobertura', pctAuditado.toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%');
        this.setTxt('auditoria-total-ok', totalAcertos.toLocaleString('pt-BR')); 
        this.setTxt('auditoria-total-nok', totalErros.toLocaleString('pt-BR')); 
        
        // Indicador Visual de Fluxo (Barra de Auditoria)
        const elAuditBar = document.getElementById('bar-auditoria-flow');
        if (elAuditBar) {
             elAuditBar.style.width = Math.min(pctAuditado, 100) + '%';
        }
    },

    renderizarGrafico: function(canvasId, labels, dataReal, dataMeta, labelReal, colorHex, isPercent) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const ctx2d = ctx.getContext('2d');

        // --- TENDÊNCIA 2026: Gradient Fills ---
        // Cria um gradiente vertical suave para o preenchimento da linha
        let gradient = ctx2d.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, colorHex + '66'); // 40% opacidade no topo
        gradient.addColorStop(1, colorHex + '00'); // 0% opacidade na base (fade out)

        if (canvasId === 'graficoEvolucaoProducao') {
            if (this.chartProd) this.chartProd.destroy();
        } else {
            if (this.chartAssert) this.chartAssert.destroy();
        }

        const config = {
            type: 'line', // Mudança para Line Chart preenchido (Area Chart)
            data: {
                labels: labels,
                datasets: [
                    {
                        label: labelReal,
                        data: dataReal,
                        backgroundColor: gradient,
                        borderColor: colorHex,
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: colorHex,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBorderWidth: 2,
                        fill: true, // Preenchimento ativado
                        tension: 0.4, // Curva suave (Bézier)
                        order: 2
                    },
                    {
                        label: 'Meta',
                        data: dataMeta,
                        type: 'line',
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        pointRadius: 0,
                        borderDash: [6, 6],
                        tension: 0.4,
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
                        backgroundColor: 'rgba(30, 41, 59, 0.9)', // Tooltip escura (contraste)
                        titleColor: '#f1f5f9',
                        bodyColor: '#e2e8f0',
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
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
                        grid: { color: '#f1f5f9', tickLength: 0 }, 
                        ticks: { 
                            font: { family: "'Nunito', sans-serif", size: 11, weight: '600' },
                            color: '#94a3b8',
                            padding: 10,
                            callback: function(val) { return isPercent ? val + '%' : val; } 
                        } 
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { font: { family: "'Nunito', sans-serif", size: 10 }, color: '#94a3b8' }
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
         'auditoria-total-validados','auditoria-total-auditados','auditoria-sem-audit',
         'auditoria-total-ok','auditoria-total-nok','auditoria-pct-cobertura']
         .forEach(id => this.setTxt(id, '--'));
        
        ['bar-meta-assert','bar-meta-prod','bar-auditoria-flow'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.style.width = '0%'; 
        });
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