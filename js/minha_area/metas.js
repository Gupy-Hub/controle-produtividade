/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas Final (KPIs Padronizados com Progresso no Rodapé)
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
        
        // UX: Agrupa por mês se o período for longo (>35 dias)
        const modoMensal = diffDias > 35;

        console.log(`🚀 Metas: Carregando de ${inicio} até ${fim}. Modo Mensal: ${modoMensal}`);

        this.resetarCards(true);
        const uid = MinhaArea.getUsuarioAlvo(); 
        
        try {
            // 1. DADOS (RPC)
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            const mapaDados = {};
            (dadosDiarios || []).forEach(d => {
                const key = d.data_ref || d.data; 
                if(key) mapaDados[key] = d;
            });

            // 2. METAS
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

            // --- PROCESSAMENTO ---
            const chartData = { labels: [], prodReal: [], prodMeta: [], assReal: [], assMeta: [] };
            
            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            let currentDt = new Date(inicio + 'T12:00:00');
            const endDt = new Date(fim + 'T12:00:00');

            if (modoMensal) {
                // MODO MENSAL
                currentDt.setDate(1); 
                while (currentDt <= endDt) {
                    const mes = currentDt.getMonth() + 1;
                    const ano = currentDt.getFullYear();
                    const nomeMes = currentDt.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.','');
                    
                    let mesProdReal = 0, mesProdMeta = 0;
                    let mesAudit = 0, mesNok = 0;
                    
                    const metaDoMesCfg = mapMetasConfig[mes] || { prod: metaPadraoProd, assert: 98.0 };
                    const ultimoDiaMes = new Date(ano, mes, 0).getDate();

                    for(let d=1; d<=ultimoDiaMes; d++) {
                        const diaObj = new Date(ano, mes-1, d);
                        if (diaObj < new Date(inicio) || diaObj > new Date(fim)) continue; 

                        const isFDS = (diaObj.getDay() === 0 || diaObj.getDay() === 6);
                        const isoDate = diaObj.toISOString().split('T')[0];
                        const dadosDia = mapaDados[isoDate] || { total_producao: 0, total_auditados: 0, total_nok: 0 };

                        mesProdReal += dadosDia.total_producao;
                        if (!isFDS) mesProdMeta += metaDoMesCfg.prod;
                        
                        mesAudit += dadosDia.total_auditados;
                        mesNok += dadosDia.total_nok;
                    }

                    if (currentDt >= new Date(inicio) || new Date(ano, mes, 0) <= endDt) {
                        chartData.labels.push(`${nomeMes}`);
                        chartData.prodReal.push(mesProdReal);
                        chartData.prodMeta.push(mesProdMeta); 

                        const assertMes = mesAudit > 0 ? ((mesAudit - mesNok) / mesAudit * 100) : null;
                        chartData.assReal.push(assertMes);
                        chartData.assMeta.push(metaDoMesCfg.assert);
                    }

                    totalVal += mesProdReal;
                    totalMeta += mesProdMeta;
                    totalAudit += mesAudit;
                    totalNok += mesNok;
                    
                    currentDt.setMonth(currentDt.getMonth() + 1);
                }
            } else {
                // MODO DIÁRIO
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

            // 4. CÁLCULO KPIS
            const pctProd = totalMeta > 0 ? (totalVal/totalMeta)*100 : 0;
            const mediaFinalAssert = totalAudit > 0 ? ((totalAudit - totalNok) / totalAudit * 100) : 0; // Média Real
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // 5. ATUALIZAR INTERFACE (DOM)
            
            // --- VALIDAÇÃO ---
            this.setTxt('meta-prod-real', totalVal.toLocaleString('pt-BR'));
            this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
            this.setBar('bar-meta-prod', pctProd, 'bg-blue-600');
            this.atualizarPorcentagemCard('bar-meta-prod', pctProd, 'Progresso');

            // --- ASSERTIVIDADE ---
            this.setTxt('meta-assert-real', mediaFinalAssert.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%');
            this.setTxt('meta-assert-meta', 'Meta: 98,00%'); 
            this.setBar('bar-meta-assert', mediaFinalAssert, mediaFinalAssert>=98?'bg-emerald-500':'bg-rose-500');
            this.atualizarPorcentagemCard('bar-meta-assert', mediaFinalAssert, 'Índice Real');

            // --- COBERTURA ---
            this.setTxt('auditoria-total-auditados', totalAudit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', totalVal.toLocaleString('pt-BR'));
            // Removemos/Ocultamos o texto antigo se necessário, aqui focamos no update do novo footer
            this.setTxt('auditoria-pct-cobertura', cob.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'); 
            this.setBar('bar-auditoria-cov', cob, 'bg-purple-500');
            this.atualizarPorcentagemCard('bar-auditoria-cov', cob, 'Cobertura');

            // --- RESULTADO ---
            this.setTxt('auditoria-total-ok', (totalAudit - totalNok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', totalNok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', res, res>=95?'bg-emerald-500':'bg-rose-500');
            this.atualizarPorcentagemCard('bar-auditoria-res', res, 'Aprovação');

            // 6. RENDERIZAR GRÁFICOS
            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            
            this.renderizarGrafico('graficoEvolucaoProducao', chartData.labels, chartData.prodReal, chartData.prodMeta, 'Produção', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', chartData.labels, chartData.assReal, chartData.assMeta, 'Qualidade', '#059669', true);

        } catch (err) {
            console.error("Erro Metas:", err);
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    // --- HELPER: Injeção de Porcentagem no Rodapé do Card ---
    atualizarPorcentagemCard: function(barId, pct, labelTxt = 'Progresso') {
        const bar = document.getElementById(barId);
        if(!bar) return;
        const container = bar.parentElement.parentElement; // div.min-card
        if(!container) return;

        // Verifica se já existe, se não, cria
        let label = container.querySelector('.pct-dynamic-label');
        if(!label) {
            label = document.createElement('div');
            label.className = 'flex justify-between items-center mt-2 text-[10px] text-slate-500 font-bold pct-dynamic-label animate-enter';
            label.innerHTML = `<span class="pct-lbl"></span><span class="pct-val"></span>`;
            container.appendChild(label);
        }

        label.querySelector('.pct-lbl').innerText = labelTxt;
        const valSpan = label.querySelector('.pct-val');
        
        // Formatação Inteligente (Se for > 100, mostra normal)
        valSpan.innerText = pct.toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%';
        
        // Coloração Dinâmica
        if (pct >= 100 || (labelTxt === 'Aprovação' && pct >= 95) || (labelTxt === 'Índice Real' && pct >= 98)) {
            valSpan.className = 'pct-val text-emerald-600 font-black';
        } else if (pct >= 80) {
            valSpan.className = 'pct-val text-blue-600 font-bold';
        } else {
            valSpan.className = 'pct-val text-rose-600 font-bold';
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
                        pointRadius: lbl.length > 20 ? 0 : 3, 
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
                            maxRotation: 0,
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
    setBar: function(id, v, c) { const e = document.getElementById(id); if(e) { e.style.width = Math.min(v||0, 100) + '%'; e.className = `h-full rounded-full transition-all duration-700 ${c}`; } }
};