/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v6.0 - TIMELINE CONTÍNUA (Correção de Dias Faltantes)
   SOLUÇÃO: Gera labels dia-a-dia independentemente de haver dados no banco.
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo Timeline Contínua (v6.0)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}
        console.time("⏱️ Tempo Total");

        this.resetarCards(true);

        const uid = MinhaArea.getUsuarioAlvo(); 
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        try {
            // 1. CHAMADA RPC (Dados Reais)
            const { data: dadosDiarios, error } = await Sistema.supabase
                .rpc('get_kpis_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            console.log(`✅ Dados Recebidos: ${dadosDiarios.length} registros.`);

            // Cria um Mapa para acesso rápido: "2023-10-01" -> { dados }
            const mapaDados = {};
            dadosDiarios.forEach(d => {
                const key = d.data_ref || d.data; // Compatibilidade
                if(key) mapaDados[key] = d;
            });

            // 2. BUSCAR METAS CONFIGURADAS
            const dtInicio = new Date(inicio + 'T12:00:00');
            const ano = dtInicio.getFullYear();
            
            let qMetas = Sistema.supabase.from('metas')
                .select('mes, meta_producao, meta_assertividade') 
                .eq('ano', ano);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);
            
            const { data: configMetas } = await qMetas;
            
            const mapMetasConfig = {};
            (configMetas || []).forEach(m => {
                mapMetasConfig[m.mes] = { 
                    prod: m.meta_producao || 100, 
                    assert: m.meta_assertividade || 98.0 
                };
            });

            // 3. PROCESSAMENTO CRONOLÓGICO (O Segredo da Correção)
            const labels = [];
            const dProdR = [], dProdM = [];
            const dAssR = [], dAssM = [];

            let totalVal = 0, totalMeta = 0;
            let totalAudit = 0, totalNok = 0;
            let somaMediasAssert = 0, diasComAssert = 0;

            const metaPadraoProd = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            // Loop dia a dia: De Inicio a Fim
            let currentDt = new Date(inicio + 'T12:00:00');
            const endDt = new Date(fim + 'T12:00:00');

            while (currentDt <= endDt) {
                // Formata data atual do loop para YYYY-MM-DD
                const isoDate = currentDt.toISOString().split('T')[0];
                const diaMes = currentDt.getDate();
                const mes = currentDt.getMonth() + 1;
                const isFDS = (currentDt.getDay() === 0 || currentDt.getDay() === 6);

                // Recupera Meta do Mês
                const metaDoMes = mapMetasConfig[mes] || { prod: metaPadraoProd, assert: 98.0 };
                const metaDia = isFDS ? 0 : metaDoMes.prod;

                // Tenta pegar dados reais do mapa, se não existir, usa 0/null
                const dadosDia = mapaDados[isoDate] || { total_producao: 0, total_auditados: 0, total_nok: 0, media_assertividade: 0 };

                // --- POPULA GRAFICO ---
                // Label: 01/01
                labels.push(`${String(diaMes).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                
                // Produção
                dProdR.push(dadosDia.total_producao);
                dProdM.push(metaDia);

                // Assertividade (Null se não tiver auditoria, para não quebrar a linha média)
                const valAssert = dadosDia.media_assertividade > 0 ? parseFloat(dadosDia.media_assertividade) : null;
                dAssR.push(valAssert);
                dAssM.push(metaDoMes.assert);

                // --- ACUMULA TOTAIS ---
                totalVal += dadosDia.total_producao;
                totalMeta += metaDia;
                totalAudit += dadosDia.total_auditados;
                totalNok += dadosDia.total_nok;

                if (valAssert !== null) {
                    somaMediasAssert += valAssert;
                    diasComAssert++;
                }

                // Avança 1 dia
                currentDt.setDate(currentDt.getDate() + 1);
            }

            // 4. CÁLCULO KPIS FINAIS
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

            // Renderiza
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
                            autoSkip: false, // Força mostrar todos se couber
                            maxRotation: 45, 
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