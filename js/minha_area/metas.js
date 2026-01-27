/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas com Granularidade Adaptativa (UX/UI Refinado)
   REGRA UX: Períodos longos (>31 dias) agrupam por MÊS. Períodos curtos agrupam por DIA.
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const diffDias = (new Date(fim) - new Date(inicio)) / (1000 * 60 * 60 * 24);
        
        // REGRA DE UX: Se o filtro for maior que 35 dias (ex: Trimestre/Ano), agrupa por MÊS.
        const modoMensal = diffDias > 35;

        console.log(`🚀 Metas: Carregando de ${inicio} até ${fim}. Modo Mensal: ${modoMensal}`);

        this.resetarCards(true);
        const uid = MinhaArea.getUsuarioAlvo(); 
        
        try {
            // 1. BUSCA DADOS BRUTOS (RPC)
            // A RPC retorna dados diários. Nós agregaremos no Javascript se necessário.
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            // Mapa O(1) para acesso rápido aos dados diários
            const mapaDados = {};
            (dadosDiarios || []).forEach(d => {
                const key = d.data_ref || d.data; 
                if(key) mapaDados[key] = d;
            });

            // 2. BUSCA METAS CONFIGURADAS
            const dtInicio = new Date(inicio + 'T12:00:00');
            const anoRef = dtInicio.getFullYear();
            
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, meta_producao, meta_assertividade') 
                .eq('ano', anoRef);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);
            
            const { data: configMetas } = await qMetas;
            
            const mapMetasConfig = {};
            (configMetas || []).forEach(m => {
                mapMetasConfig[m.mes] = { 
                    prod: m.meta_producao || 100, 
                    assert: m.meta_assertividade || 98.0 
                };
            });

            // --- PROCESSAMENTO ADAPTATIVO (O SEGREDO DA UX) ---
            const chartData = { labels: [], prodReal: [], prodMeta: [], assReal: [], assMeta: [] };
            
            // Acumuladores Globais (Cards)
            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0; // Para média ponderada

            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            // Variáveis de iteração
            let currentDt = new Date(inicio + 'T12:00:00');
            const endDt = new Date(fim + 'T12:00:00');

            if (modoMensal) {
                // --- MODO MENSAL (Agregação) ---
                // Iteramos mês a mês dentro do range
                
                // Ajusta para o dia 1 do mês inicial para garantir iteração correta
                currentDt.setDate(1); 

                while (currentDt <= endDt) {
                    const mes = currentDt.getMonth() + 1;
                    const ano = currentDt.getFullYear();
                    const nomeMes = currentDt.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.','');
                    
                    // Inicializa acumuladores do MÊS
                    let mesProdReal = 0, mesProdMeta = 0;
                    let mesAudit = 0, mesNok = 0;
                    
                    const metaDoMesCfg = mapMetasConfig[mes] || { prod: metaPadraoProd, assert: 98.0 };
                    
                    // Itera dias dentro deste mês para somar
                    const ultimoDiaMes = new Date(ano, mes, 0).getDate();
                    let diasUteisMes = 0;

                    for(let d=1; d<=ultimoDiaMes; d++) {
                        const diaObj = new Date(ano, mes-1, d);
                        if (diaObj < new Date(inicio) || diaObj > new Date(fim)) continue; // Respeita limites exatos

                        const isFDS = (diaObj.getDay() === 0 || diaObj.getDay() === 6);
                        const isoDate = diaObj.toISOString().split('T')[0];
                        const dadosDia = mapaDados[isoDate] || { total_producao: 0, total_auditados: 0, total_nok: 0 };

                        mesProdReal += dadosDia.total_producao;
                        if (!isFDS) {
                            mesProdMeta += metaDoMesCfg.prod;
                            diasUteisMes++;
                        }
                        
                        mesAudit += dadosDia.total_auditados;
                        mesNok += dadosDia.total_nok;
                    }

                    // Se o mês tem dados ou está dentro do range válido, adiciona ao gráfico
                    // (Lógica simples: se o loop passou por aqui, adiciona)
                    if (currentDt >= new Date(inicio) || new Date(ano, mes, 0) <= endDt) {
                        chartData.labels.push(`${nomeMes}`);
                        chartData.prodReal.push(mesProdReal);
                        chartData.prodMeta.push(mesProdMeta); // Meta acumulada do mês

                        // Assertividade do Mês (Ponderada)
                        const assertMes = mesAudit > 0 ? ((mesAudit - mesNok) / mesAudit * 100) : null;
                        chartData.assReal.push(assertMes);
                        chartData.assMeta.push(metaDoMesCfg.assert);
                    }

                    // Acumula Totais Globais
                    totalVal += mesProdReal;
                    totalMeta += mesProdMeta;
                    totalAudit += mesAudit;
                    totalNok += mesNok;
                    
                    // Avança 1 Mês
                    currentDt.setMonth(currentDt.getMonth() + 1);
                }

            } else {
                // --- MODO DIÁRIO (Original) ---
                while (currentDt <= endDt) {
                    const isoDate = currentDt.toISOString().split('T')[0];
                    const diaMes = currentDt.getDate();
                    const mes = currentDt.getMonth() + 1;
                    const isFDS = (currentDt.getDay() === 0 || currentDt.getDay() === 6);

                    const metaDoMes = mapMetasConfig[mes] || { prod: metaPadraoProd, assert: 98.0 };
                    const metaDia = isFDS ? 0 : metaDoMes.prod;
                    const dadosDia = mapaDados[isoDate] || { total_producao: 0, total_auditados: 0, total_nok: 0, media_assertividade: 0 };

                    chartData.labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                    chartData.prodReal.push(dadosDia.total_producao);
                    chartData.prodMeta.push(metaDia);

                    const valAssert = dadosDia.media_assertividade > 0 ? parseFloat(dadosDia.media_assertividade) : null;
                    chartData.assReal.push(valAssert);
                    chartData.assMeta.push(metaDoMes.assert);

                    totalVal += dadosDia.total_producao;
                    totalMeta += metaDia;
                    totalAudit += dadosDia.total_auditados;
                    totalNok += dadosDia.total_nok;

                    currentDt.setDate(currentDt.getDate() + 1);
                }
            }

            // 4. KPIS TOTAIS (Mesma lógica para ambos)
            // Assertividade Global Ponderada (Total OK / Total Auditados)
            const mediaFinalAssert = totalAudit > 0 ? ((totalAudit - totalNok) / totalAudit * 100) : 0;
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // 5. ATUALIZAR INTERFACE (DOM)
            this.setTxt('meta-prod-real', totalVal.toLocaleString('pt-BR'));
            this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
            this.setBar('bar-meta-prod', totalMeta > 0 ? (totalVal/totalMeta)*100 : 0, 'bg-blue-600');

            this.setTxt('meta-assert-real', mediaFinalAssert.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%');
            this.setTxt('meta-assert-meta', 'Meta: 98,00%'); 
            this.setBar('bar-meta-assert', mediaFinalAssert, mediaFinalAssert>=98?'bg-emerald-500':'bg-rose-500');

            this.setTxt('auditoria-total-auditados', totalAudit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', totalVal.toLocaleString('pt-BR'));
            this.setTxt('auditoria-pct-cobertura', cob.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
            this.setBar('bar-auditoria-cov', cob, 'bg-purple-500');

            this.setTxt('auditoria-total-ok', (totalAudit - totalNok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', totalNok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', res, res>=95?'bg-emerald-500':'bg-rose-500');

            // 6. RENDERIZAR GRÁFICOS (Com Tipo Correto)
            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            
            // UX: Se for mensal, Bar Chart fica melhor para volume. Se for diário, Line.
            // Mas para consistência visual com "Evolução", manteremos Line mas smoothed.
            
            this.renderizarGrafico('graficoEvolucaoProducao', chartData.labels, chartData.prodReal, chartData.prodMeta, 'Produção', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', chartData.labels, chartData.assReal, chartData.assMeta, 'Qualidade', '#059669', true);

        } catch (err) {
            console.error("Erro Metas:", err);
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    getLabelPeriodo: function(i, f) {
        const d1 = i.split('-').reverse().slice(0,2).join('/');
        const d2 = f.split('-').reverse().slice(0,2).join('/');
        return `${d1} a ${d2}`;
    },

    getQtdAssistentesConfigurada: function() { 
        const m = localStorage.getItem('gupy_config_qtd_assistentes'); 
        return m ? parseInt(m) : 17; 
    },

    renderizarGrafico: function(id, lbl, dReal, dMeta, label, cor, isPct) {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        
        if(id.includes('Producao')) { 
            if(this.chartProd) { this.chartProd.destroy(); this.chartProd = null; }
        } else { 
            if(this.chartAssert) { this.chartAssert.destroy(); this.chartAssert = null; }
        }
        
        const config = {
            type: 'line',
            data: {
                labels: lbl,
                datasets: [
                    { 
                        label: label, 
                        data: dReal, 
                        borderColor: cor, 
                        backgroundColor: cor+'15', 
                        fill: true, 
                        tension: 0.3, 
                        pointRadius: lbl.length > 20 ? 0 : 3, // UX: Remove bolinhas se tiver muitos pontos
                        pointHoverRadius: 5
                    },
                    { 
                        label: 'Meta', 
                        data: dMeta, 
                        borderColor: '#94a3b8', 
                        borderDash: [5,5], 
                        tension: 0.1, 
                        fill: false, 
                        pointRadius: 0,
                        borderWidth: 2
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
                        padding: 10,
                        callbacks: {
                            label: c => ` ${c.dataset.label}: ` + (c.raw?.toLocaleString('pt-BR') || '-') + (isPct ? '%' : '')
                        }
                    } 
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        ticks: { callback: v => isPct ? v+'%' : v } 
                    }, 
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            font: { size: 10 },
                            color: '#64748b',
                            autoSkip: false, 
                            maxRotation: 0, // UX: Mantém labels retos
                            minRotation: 0
                        } 
                    } 
                }
            }
        };

        const novoChart = new Chart(ctx, config);
        
        if(id.includes('Producao')) this.chartProd = novoChart; 
        else this.chartAssert = novoChart;
    },

    resetarCards: function(showLoading) {
        const ids = ['meta-assert-real','meta-prod-real','auditoria-total-validados','auditoria-total-auditados','auditoria-total-ok','auditoria-total-nok'];
        ids.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = showLoading ? '<i class="fas fa-spinner fa-spin text-blue-300"></i>' : '--'; });
        ['bar-meta-assert','bar-meta-prod','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, v) { const e = document.getElementById(id); if(e) e.innerText = v; },
    setBar: function(id, v, c) { const e = document.getElementById(id); if(e) { e.style.width = Math.min(v, 100) + '%'; e.className = `h-full rounded-full transition-all duration-700 ${c}`; } }
};