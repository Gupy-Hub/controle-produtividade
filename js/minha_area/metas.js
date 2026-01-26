/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v5.2 - FULL AXIS (Eixo X Completo)
   MOTIVO: Forçar exibição de todos os dias no gráfico (1 a 31)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo RPC (v5.2 - Eixo Completo)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}
        console.time("⏱️ Tempo Total");

        this.resetarCards(true);

        const uid = MinhaArea.getUsuarioAlvo(); 
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        try {
            // 1. CHAMADA RPC (Instantânea)
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            console.log(`✅ Dados Recebidos: ${dadosDiarios.length} dias.`);

            // 2. BUSCAR METAS CONFIGURADAS
            const dtInicio = new Date(inicio + 'T12:00:00');
            const ano = dtInicio.getFullYear();
            
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, meta_producao, meta_assertividade') 
                .eq('ano', ano);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);
            
            const { data: configMetas } = await qMetas;
            
            const mapMetas = {};
            (configMetas || []).forEach(m => {
                mapMetas[m.mes] = { 
                    prod: m.meta_producao || 100, 
                    assert: m.meta_assertividade || 98.0 
                };
            });

            // 3. PROCESSAMENTO (Garante que TODOS os dias do filtro apareçam)
            const labels = [];
            const dProdR = [], dProdM = [];
            const dAssR = [], dAssM = [];

            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0;

            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            // Garante ordenação cronológica
            dadosDiarios.sort((a,b) => (a.data_ref || a.data || '').localeCompare(b.data_ref || b.data || ''));

            dadosDiarios.forEach(dia => {
                const dataString = dia.data_ref || dia.data; // Compatibilidade v3/v4
                if (!dataString) return; 

                const dataObj = new Date(dataString + 'T12:00:00');
                const diaMes = dataObj.getDate();
                const mes = dataObj.getMonth() + 1;
                const isFDS = (dataObj.getDay() === 0 || dataObj.getDay() === 6);
                
                const metaDoMes = mapMetas[mes] || { prod: metaPadraoProd, assert: 98.0 };
                const metaDia = isFDS ? 0 : metaDoMes.prod;

                // Label dia a dia (01/01, 02/01, etc.)
                labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                
                dProdR.push(dia.total_producao);
                dProdM.push(metaDia);
                
                const valAssert = dia.media_assertividade > 0 ? parseFloat(dia.media_assertividade) : null;
                dAssR.push(valAssert);
                dAssM.push(metaDoMes.assert);

                totalVal += dia.total_producao;
                totalMeta += metaDia;
                totalAudit += dia.total_auditados;
                totalNok += dia.total_nok;
                
                if (valAssert !== null) {
                    somaMediasAssert += valAssert;
                    diasComAssert++;
                }
            });

            // 4. CÁLCULO KPIS
            const mediaFinalAssert = diasComAssert > 0 ? (somaMediasAssert / diasComAssert) : 0;
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // 5. ATUALIZAR DOM
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

            // Renderizar Gráficos (CORREÇÃO DE EIXO X AQUI)
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = 'Diário');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dProdR, dProdM, 'Validação', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dAssR, dAssM, 'Assertividade', '#059669', true);

            console.timeEnd("⏱️ Tempo Total");

        } catch (err) {
            console.error("❌ Erro RPC:", err);
            this.resetarCards(false); 
        } finally {
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
        
        if(id.includes('Producao')) { if(this.chartProd) this.chartProd.destroy(); } 
        else { if(this.chartAssert) this.chartAssert.destroy(); }
        
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
                        pointRadius: 3 
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
                plugins: { legend: { display: false }, tooltip: {callbacks:{label: c => c.dataset.label + ': ' + (c.raw?.toLocaleString('pt-BR') || '-') + (isPct ? '%' : '')}} },
                scales: { 
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: v => isPct ? v+'%' : v } }, 
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            font: { size: 10 },
                            color: '#94a3b8',
                            autoSkip: false, // <--- IMPORTANTE: Não pular dias
                            maxRotation: 45, // <--- Permite inclinar para caber
                            minRotation: 0
                        } 
                    } 
                }
            }
        });
        
        if(id.includes('Producao')) this.chartProd = chart; 
        else this.chartAssert = chart;
    },

    resetarCards: function(showLoading) {
        const ids = ['meta-assert-real','meta-prod-real','auditoria-total-validados','auditoria-total-auditados','auditoria-total-ok','auditoria-total-nok'];
        ids.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = showLoading ? '<i class="fas fa-circle-notch fa-spin text-slate-300"></i>' : '--'; });
        ['bar-meta-assert','bar-meta-prod','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
    },

    setTxt: function(id, v) { const e = document.getElementById(id); if(e) e.innerText = v; },
    setBar: function(id, v, c) { const e = document.getElementById(id); if(e) { e.style.width = Math.min(v, 100) + '%'; e.className = `h-full rounded-full transition-all duration-700 ${c}`; } }
};