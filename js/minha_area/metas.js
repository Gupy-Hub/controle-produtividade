/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v5.1 - SERVER SIDE (RPC) + ROBUST DATA MAPPING
   MOTIVO: Performance Instantânea e correção de mapeamento de dados (dia a dia)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        // 1. Trava de segurança para evitar cliques múltiplos
        if (this.isLocked) return;
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo RPC (v5.1 - Instantâneo)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}
        console.time("⏱️ Tempo Total");

        // Exibe os spinners de carregamento nos cards
        this.resetarCards(true);

        const uid = MinhaArea.getUsuarioAlvo(); 
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        try {
            // 2. CHAMADA ÚNICA AO SERVIDOR (RPC)
            // O banco de dados processa tudo e retorna apenas o resumo diário (~30 linhas)
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            console.log(`✅ RPC Retornou ${dadosDiarios.length} registros diários.`);

            // 3. BUSCAR CONFIGURAÇÃO DE METAS (Leve)
            // Necessário para saber qual a meta esperada para cada mês
            const dtInicio = new Date(inicio + 'T12:00:00');
            const ano = dtInicio.getFullYear();
            
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, meta_producao, meta_assertividade') 
                .eq('ano', ano);
            
            if (uid) qMetas = qMetas.eq('usuario_id', uid);
            
            const { data: configMetas } = await qMetas;
            
            // Mapa de Metas para acesso rápido (Mês -> Meta)
            const mapMetas = {};
            (configMetas || []).forEach(m => {
                mapMetas[m.mes] = { 
                    prod: m.meta_producao || 100, 
                    assert: m.meta_assertividade || 98.0 
                };
            });

            // 4. PROCESSAMENTO DOS DADOS PARA GRÁFICOS E KPI
            const labels = [];
            const dProdR = [], dProdM = [];
            const dAssR = [], dAssM = [];

            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0;

            // Define meta padrão caso não tenha configuração específica no banco
            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            dadosDiarios.forEach(dia => {
                // BLINDAGEM: Aceita tanto 'data_ref' (v4 SQL) quanto 'data' (v3 SQL)
                const dataString = dia.data_ref || dia.data;
                
                if (!dataString) return; 

                const dataObj = new Date(dataString + 'T12:00:00');
                const diaMes = dataObj.getDate();
                const mes = dataObj.getMonth() + 1;
                const isFDS = (dataObj.getDay() === 0 || dataObj.getDay() === 6);
                
                const metaDoMes = mapMetas[mes] || { prod: metaPadraoProd, assert: 98.0 };
                
                // Meta diária: Se for Fim de Semana, a meta é 0.
                const metaDia = isFDS ? 0 : metaDoMes.prod;

                // Popula Arrays do Gráfico
                labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                
                // Produção
                dProdR.push(dia.total_producao);
                dProdM.push(metaDia);
                
                // Assertividade (Trata nulos para não quebrar o gráfico)
                const valAssert = dia.media_assertividade > 0 ? parseFloat(dia.media_assertividade) : null;
                dAssR.push(valAssert);
                dAssM.push(metaDoMes.assert);

                // Acumuladores para os Cards (KPIs)
                totalVal += dia.total_producao;
                totalMeta += metaDia;
                totalAudit += dia.total_auditados;
                totalNok += dia.total_nok;
                
                if (valAssert !== null) {
                    somaMediasAssert += valAssert;
                    diasComAssert++;
                }
            });

            // 5. CÁLCULO FINAL DOS INDICADORES
            const mediaFinalAssert = diasComAssert > 0 ? (somaMediasAssert / diasComAssert) : 0;
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // 6. ATUALIZAÇÃO DA TELA (DOM)
            
            // KPI Produção
            this.setTxt('meta-prod-real', totalVal.toLocaleString('pt-BR'));
            this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
            this.setBar('bar-meta-prod', totalMeta > 0 ? (totalVal/totalMeta)*100 : 0, 'bg-blue-600');

            // KPI Assertividade
            this.setTxt('meta-assert-real', mediaFinalAssert.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%');
            this.setTxt('meta-assert-meta', 'Meta: 98,00%'); 
            this.setBar('bar-meta-assert', mediaFinalAssert, mediaFinalAssert>=98?'bg-emerald-500':'bg-rose-500');

            // KPI Auditoria - Cobertura
            this.setTxt('auditoria-total-auditados', totalAudit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', totalVal.toLocaleString('pt-BR'));
            this.setTxt('auditoria-pct-cobertura', cob.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
            this.setBar('bar-auditoria-cov', cob, 'bg-purple-500');

            // KPI Auditoria - Resultado
            this.setTxt('auditoria-total-ok', (totalAudit - totalNok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', totalNok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', res, res>=95?'bg-emerald-500':'bg-rose-500');

            // Renderizar Gráficos Chart.js
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = 'Diário');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dProdR, dProdM, 'Validação', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dAssR, dAssM, 'Assertividade', '#059669', true);

            console.timeEnd("⏱️ Tempo Total");

        } catch (err) {
            console.error("❌ Erro RPC:", err);
            // Feedback visual de erro nos cards
            const idsErro = ['meta-prod-real', 'meta-assert-real', 'auditoria-total-auditados'];
            idsErro.forEach(id => {
                const el = document.getElementById(id);
                if(el) el.innerHTML = '<span class="text-rose-500 text-sm">Erro</span>';
            });
        } finally {
            // Libera a trava SEMPRE
            this.isLocked = false;
        }
    },

    getQtdAssistentesConfigurada: function() { 
        const m = localStorage.getItem('gupy_config_qtd_assistentes'); 
        return m ? parseInt(m) : 17; 
    },

    renderizarGrafico: function(id, lbl, dReal, dMeta, label, cor, isPct) {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        
        // Destrói gráfico anterior se existir para evitar sobreposição
        if(id.includes('Producao')) { 
            if(this.chartProd) this.chartProd.destroy(); 
        } else { 
            if(this.chartAssert) this.chartAssert.destroy(); 
        }
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: lbl,
                datasets: [
                    { 
                        label: label, 
                        data: dReal, 
                        borderColor: cor, 
                        backgroundColor: cor+'10', 
                        fill: true, 
                        tension: 0.3, 
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    { 
                        label: 'Meta', 
                        data: dMeta, 
                        borderColor: '#cbd5e1', 
                        borderDash: [4,4], 
                        tension: 0.3, 
                        fill: false, 
                        pointRadius: 0 
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
                        callbacks: {
                            label: c => c.dataset.label + ': ' + 
                                       (c.raw !== null ? c.raw.toLocaleString('pt-BR') : '-') + 
                                       (isPct ? '%' : '')
                        }
                    } 
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        ticks: { 
                            font: { size: 10 },
                            color: '#94a3b8',
                            callback: v => isPct ? v+'%' : v 
                        } 
                    }, 
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            font: { size: 10 },
                            color: '#94a3b8',
                            maxTicksLimit: 10 
                        } 
                    } 
                }
            }
        });
        
        if(id.includes('Producao')) this.chartProd = chart; 
        else this.chartAssert = chart;
    },

    resetarCards: function(showLoading) {
        // Lista de IDs de texto
        const ids = [
            'meta-assert-real','meta-assert-meta',
            'meta-prod-real','meta-prod-meta',
            'auditoria-total-validados','auditoria-total-auditados','auditoria-pct-cobertura',
            'auditoria-total-ok','auditoria-total-nok'
        ];

        // Insere spinner ou traço
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = showLoading ? '<i class="fas fa-circle-notch fa-spin text-sm text-slate-300"></i>' : '--';
        });
        
        // Reseta as barras de progresso
        const idsBarras = ['bar-meta-assert','bar-meta-prod','bar-auditoria-cov','bar-auditoria-res'];
        idsBarras.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) { 
                el.style.width = '0%'; 
                el.className = 'h-full rounded-full bg-slate-200 transition-all duration-700';
            }
        });
    },

    setTxt: function(id, v) { 
        const e = document.getElementById(id); 
        if(e) e.innerText = v; 
    },

    setBar: function(id, v, c) { 
        const e = document.getElementById(id); 
        if(e) { 
            e.style.width = Math.min(v, 100) + '%'; 
            e.className = `h-full rounded-full transition-all duration-700 ${c}`; 
        } 
    }
};