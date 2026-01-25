/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v5.0 - SERVER SIDE CALCULATION (RPC)
   MOTIVO: Performance Instantânea (De 9s para <300ms)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo RPC (v5.0 - Instantâneo)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}
        console.time("⏱️ Tempo Total");

        this.resetarCards(true); // true = exibe loading

        const uid = MinhaArea.getUsuarioAlvo(); 
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        try {
            // 1. CHAMADA ÚNICA AO SERVIDOR (RPC)
            // O banco faz o trabalho pesado e retorna apenas 30 linhas.
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            console.log(`✅ RPC Retornou ${dadosDiarios.length} dias.`);

            // 2. BUSCAR METAS CONFIGURADAS (Leve)
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const ano = dtInicio.getFullYear();
            
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, meta_producao, meta_assertividade') 
                .eq('ano', ano);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);
            
            const { data: configMetas } = await qMetas;
            
            // Mapa de Metas para acesso rápido
            const mapMetas = {};
            (configMetas || []).forEach(m => {
                mapMetas[m.mes] = { 
                    prod: m.meta_producao || 100, 
                    assert: m.meta_assertividade || 98.0 
                };
            });

            // 3. PROCESSAMENTO DOS DADOS PARA GRÁFICOS
            const labels = [];
            const dProdR = [], dProdM = [];
            const dAssR = [], dAssM = [];

            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0;

            // Configuração global se não houver específica
            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            dadosDiarios.forEach(dia => {
                const dataObj = new Date(dia.data_ref + 'T12:00:00');
                const diaMes = dataObj.getDate();
                const mes = dataObj.getMonth() + 1;
                const isFDS = (dataObj.getDay() === 0 || dataObj.getDay() === 6);
                
                const metaDoMes = mapMetas[mes] || { prod: metaPadraoProd, assert: 98.0 };
                // Meta diária: Se for FDS, meta é 0, senão é a meta configurada
                const metaDia = isFDS ? 0 : metaDoMes.prod;

                // Popula Arrays do Gráfico
                labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                
                // Produção
                dProdR.push(dia.total_producao);
                dProdM.push(metaDia);
                
                // Assertividade
                const valAssert = dia.media_assertividade > 0 ? parseFloat(dia.media_assertividade) : null;
                dAssR.push(valAssert);
                dAssM.push(metaDoMes.assert);

                // Acumuladores KPI
                totalVal += dia.total_producao;
                totalMeta += metaDia;
                totalAudit += dia.total_auditados;
                totalNok += dia.total_nok;
                
                if (valAssert !== null) {
                    somaMediasAssert += valAssert;
                    diasComAssert++;
                }
            });

            // 4. ATUALIZAR TELA
            const mediaFinalAssert = diasComAssert > 0 ? (somaMediasAssert / diasComAssert) : 0;
            const cob = totalVal > 0 ? ((totalAudit / totalVal) * 100) : 0;
            const res = totalAudit > 0 ? (((totalAudit - totalNok) / totalAudit) * 100) : 100;

            // KPI Produção
            this.setTxt('meta-prod-real', totalVal.toLocaleString('pt-BR'));
            this.setTxt('meta-prod-meta', totalMeta.toLocaleString('pt-BR'));
            this.setBar('bar-meta-prod', totalMeta > 0 ? (totalVal/totalMeta)*100 : 0, 'bg-blue-600');

            // KPI Assertividade
            this.setTxt('meta-assert-real', mediaFinalAssert.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%');
            this.setTxt('meta-assert-meta', 'Meta: 98,00%'); // Simplificado
            this.setBar('bar-meta-assert', mediaFinalAssert, mediaFinalAssert>=98?'bg-emerald-500':'bg-rose-500');

            // KPI Auditoria
            this.setTxt('auditoria-total-auditados', totalAudit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', totalVal.toLocaleString('pt-BR'));
            this.setTxt('auditoria-pct-cobertura', cob.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
            this.setBar('bar-auditoria-cov', cob, 'bg-purple-500');

            this.setTxt('auditoria-total-ok', (totalAudit - totalNok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', totalNok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', res, res>=95?'bg-emerald-500':'bg-rose-500');

            // Renderizar Gráficos
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = 'Diário');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dProdR, dProdM, 'Validação', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dAssR, dAssM, 'Assertividade', '#059669', true);

            console.timeEnd("⏱️ Tempo Total");

        } catch (err) {
            console.error("❌ Erro RPC:", err);
            // Fallback visual de erro
            document.getElementById('meta-prod-real').innerText = "Erro";
        } finally {
            this.isLocked = false;
        }
    },

    getQtdAssistentesConfigurada: function() { 
        const m=localStorage.getItem('gupy_config_qtd_assistentes'); 
        return m?parseInt(m):17; 
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
                    { label: label, data: dReal, borderColor: cor, backgroundColor: cor+'10', fill: true, tension: 0.3, pointRadius: 3 },
                    { label: 'Meta', data: dMeta, borderColor: '#cbd5e1', borderDash: [4,4], tension: 0.3, fill: false, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: {intersect: false, mode: 'index'},
                plugins: { legend: {display:false}, tooltip: {callbacks:{label: c=>c.dataset.label+': '+c.raw?.toLocaleString('pt-BR')+(isPct?'%':'')}} },
                scales: { 
                    y: {beginAtZero: true, grid:{color:'#f1f5f9'}, ticks:{callback: v=>isPct?v+'%':v}}, 
                    x: {grid:{display:false}, ticks: {maxTicksLimit: 10}} 
                }
            }
        });
        
        if(id.includes('Producao')) this.chartProd = chart; else this.chartAssert = chart;
    },

    resetarCards: function(showLoading) {
        const ids = ['meta-assert-real','meta-prod-real','auditoria-total-validados','auditoria-total-auditados','auditoria-total-ok','auditoria-total-nok'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = showLoading ? '<i class="fas fa-spinner fa-spin text-sm text-slate-300"></i>' : '--';
        });
        
        // Zera Barras
        ['bar-meta-assert','bar-meta-prod','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) { el.style.width = '0%'; }
        });
    },

    setTxt: function(id, v) { const e=document.getElementById(id); if(e) e.innerText=v; },
    setBar: function(id, v, c) { const e=document.getElementById(id); if(e) { e.style.width=Math.min(v,100)+'%'; e.className=`h-full rounded-full transition-all duration-700 ${c}`; } }
};