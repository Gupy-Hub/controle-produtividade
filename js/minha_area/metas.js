/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas (Eixo X Contínuo + Compatível com Novos Filtros)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        console.log(`🚀 Metas: Carregando de ${inicio} até ${fim}`);

        this.resetarCards(true);
        const uid = MinhaArea.getUsuarioAlvo(); 
        
        try {
            // 1. DADOS REAIS (RPC)
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            // Mapa para acesso rápido (O(1))
            const mapaDados = {};
            (dadosDiarios || []).forEach(d => {
                const key = d.data_ref || d.data; 
                if(key) mapaDados[key] = d;
            });

            // 2. METAS CONFIGURADAS
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

            // 3. LOOP CRONOLÓGICO (Preenche lacunas)
            const labels = [];
            const dProdR = [], dProdM = [];
            const dAssR = [], dAssM = [];

            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0;

            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            let currentDt = new Date(inicio + 'T12:00:00');
            const endDt = new Date(fim + 'T12:00:00');

            // Proteção contra loop infinito (máx 366 dias)
            let safetyCounter = 0;
            while (currentDt <= endDt && safetyCounter < 370) {
                safetyCounter++;
                
                const isoDate = currentDt.toISOString().split('T')[0];
                const diaMes = currentDt.getDate();
                const mes = currentDt.getMonth() + 1;
                const isFDS = (currentDt.getDay() === 0 || currentDt.getDay() === 6);

                const metaDoMes = mapMetasConfig[mes] || { prod: metaPadraoProd, assert: 98.0 };
                const metaDia = isFDS ? 0 : metaDoMes.prod;

                const dadosDia = mapaDados[isoDate] || { total_producao: 0, total_auditados: 0, total_nok: 0, media_assertividade: 0 };

                labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                
                dProdR.push(dadosDia.total_producao);
                dProdM.push(metaDia);

                // Assertividade: null se 0 (para não desenhar linha no zero)
                const valAssert = dadosDia.media_assertividade > 0 ? parseFloat(dadosDia.media_assertividade) : null;
                dAssR.push(valAssert);
                dAssM.push(metaDoMes.assert);

                totalVal += dadosDia.total_producao;
                totalMeta += metaDia;
                totalAudit += dadosDia.total_auditados;
                totalNok += dadosDia.total_nok;

                if (valAssert !== null) {
                    somaMediasAssert += valAssert;
                    diasComAssert++;
                }

                currentDt.setDate(currentDt.getDate() + 1);
            }

            // 4. KPIS TOTAIS
            const mediaFinalAssert = diasComAssert > 0 ? (somaMediasAssert / diasComAssert) : 0;
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // 5. ATUALIZAR INTERFACE
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

            // 6. RENDERIZAR GRÁFICOS
            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dProdR, dProdM, 'Produção', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dAssR, dAssM, 'Qualidade', '#059669', true);

        } catch (err) {
            console.error("Erro Metas:", err);
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    getLabelPeriodo: function(i, f) {
        // Ex: 01/10 a 31/10
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
        
        // Destruição segura
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
                        pointRadius: 3 
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
                            autoSkip: false, // Força mostrar tudo
                            maxRotation: 45, 
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