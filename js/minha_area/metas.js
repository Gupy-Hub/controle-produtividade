/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas (Cálculo Exato da Meta por Filtro + UI Refinada)
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
        
        // UX: Se o filtro for longo (>35 dias), agrupa os dados por mês
        const modoMensal = diffDias > 35; 

        console.log(`🚀 Metas: Carregando de ${inicio} até ${fim}. Modo Mensal: ${modoMensal}`);

        this.resetarCards(true);
        const uid = MinhaArea.getUsuarioAlvo(); 
        
        try {
            // 1. BUSCA DADOS & CONFIGURAÇÕES (RPC + SELECT)
            const [kpisRes, configRes] = await Promise.all([
                Sistema.supabase.rpc('get_kpis_minha_area', { p_inicio: inicio, p_fim: fim, p_usuario_id: uid }),
                Sistema.supabase.from('metas').select('*').eq('ano', new Date(inicio).getFullYear())
            ]);

            if (kpisRes.error) throw kpisRes.error;
            
            // Mapa para acesso rápido aos dados diários
            const mapaDados = {};
            (kpisRes.data || []).forEach(d => { mapaDados[d.data_ref || d.data] = d; });

            // Mapa de Metas Configuradas (Mês -> Config)
            const mapMetas = {};
            (configRes.data || []).forEach(m => {
                if (!uid || m.usuario_id == uid) {
                    mapMetas[m.mes] = { prod: m.meta_producao || 100, assert: m.meta_assertividade || 98.0 };
                }
            });

            // --- PROCESSAMENTO (Loop Diário ou Mensal) ---
            const chartData = { labels: [], prodReal: [], prodMeta: [], assReal: [], assMeta: [] };
            let acc = { val: 0, meta: 0, audit: 0, nok: 0 };
            
            // Meta Padrão (Fallback caso não tenha configuração no banco)
            const metaPadrao = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            let curr = new Date(inicio + 'T12:00:00');
            const end = new Date(fim + 'T12:00:00');
            if (modoMensal) curr.setDate(1); // Ajuste para iniciar do dia 1 no modo mensal

            while (curr <= end) {
                const mes = curr.getMonth() + 1;
                const ano = curr.getFullYear();
                const metaMesCfg = mapMetas[mes] || { prod: metaPadrao, assert: 98.0 };
                
                let pReal = 0, pMeta = 0, aAudit = 0, aNok = 0;

                if (modoMensal) {
                    // --- MODO MENSAL (Agregação) ---
                    const label = curr.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.','');
                    const lastDay = new Date(ano, mes, 0).getDate();
                    
                    for(let d=1; d<=lastDay; d++) {
                        const dia = new Date(ano, mes-1, d);
                        if (dia < new Date(inicio) || dia > new Date(fim)) continue;
                        
                        const iso = dia.toISOString().split('T')[0];
                        const isFDS = (dia.getDay()===0 || dia.getDay()===6);
                        const reg = mapaDados[iso] || { total_producao: 0, total_auditados: 0, total_nok: 0 };
                        
                        pReal += reg.total_producao;
                        if(!isFDS) pMeta += metaMesCfg.prod; // Soma meta apenas em dias úteis
                        aAudit += reg.total_auditados;
                        aNok += reg.total_nok;
                    }
                    
                    if (curr >= new Date(inicio) || new Date(ano, mes, 0) <= end) {
                        chartData.labels.push(label);
                        chartData.prodReal.push(pReal);
                        chartData.prodMeta.push(pMeta);
                        chartData.assReal.push(aAudit>0 ? ((aAudit-aNok)/aAudit*100) : null);
                        chartData.assMeta.push(metaMesCfg.assert);
                    }
                    curr.setMonth(curr.getMonth() + 1);

                } else {
                    // --- MODO DIÁRIO (Detalhado) ---
                    const iso = curr.toISOString().split('T')[0];
                    const isFDS = (curr.getDay()===0 || curr.getDay()===6);
                    const reg = mapaDados[iso] || { total_producao: 0, total_auditados: 0, total_nok: 0, media_assertividade: 0 };
                    
                    pMeta = isFDS ? 0 : metaMesCfg.prod;
                    pReal = reg.total_producao;
                    
                    chartData.labels.push(`${curr.getDate()}/${mes}`);
                    chartData.prodReal.push(pReal);
                    chartData.prodMeta.push(pMeta);
                    chartData.assReal.push(reg.media_assertividade > 0 ? reg.media_assertividade : null);
                    chartData.assMeta.push(metaMesCfg.assert);
                    
                    aAudit = reg.total_auditados;
                    aNok = reg.total_nok;
                    curr.setDate(curr.getDate() + 1);
                }

                // Acumuladores Totais
                acc.val += pReal; acc.meta += pMeta; acc.audit += aAudit; acc.nok += aNok;
            }

            // 4. ATUALIZAR CARDS (DOM)
            const pctProd = acc.meta > 0 ? (acc.val/acc.meta)*100 : 0;
            const pctAssert = acc.audit > 0 ? ((acc.audit - acc.nok)/acc.audit*100) : 0;
            const pctCob = acc.val > 0 ? (acc.audit/acc.val)*100 : 0;
            const pctAprov = acc.audit > 0 ? ((acc.audit-acc.nok)/acc.audit*100) : 100;

            // Card 1: Validação (Meta Dinâmica Calculada)
            this.updateCard('prod', acc.val, acc.meta, pctProd, 'Atingimento');
            
            // Card 2: Assertividade
            this.updateCard('assert', pctAssert, 98, pctAssert, 'Índice Real', true);
            
            // Card 3: Auditados (Cobertura)
            this.setTxt('auditoria-total-auditados', acc.audit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', acc.val.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-cov', pctCob, 'bg-purple-500');
            this.atualizarPorcentagemCard('bar-auditoria-cov', pctCob, 'Cobertura');

            // Card 4: Auditoria (Resultado)
            this.setTxt('auditoria-total-ok', (acc.audit - acc.nok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', acc.nok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', pctAprov, 'bg-emerald-500');
            this.atualizarPorcentagemCard('bar-auditoria-res', pctAprov, 'Aprovação');

            // 5. RENDERIZAR GRÁFICOS
            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            
            this.renderizarGrafico('graficoEvolucaoProducao', chartData.labels, chartData.prodReal, chartData.prodMeta, 'Produção', '#3b82f6', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', chartData.labels, chartData.assReal, chartData.assMeta, 'Qualidade', '#10b981', true);

        } catch (err) {
            console.error("Erro Metas:", err);
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    // --- FUNÇÕES AUXILIARES DE UI ---
    
    updateCard: function(type, real, meta, pct, subLabel, isPct = false) {
        const txtReal = isPct ? this.fmtPct(real) : real.toLocaleString('pt-BR');
        const txtMeta = isPct ? `${meta}%` : meta.toLocaleString('pt-BR');
        
        this.setTxt(`meta-${type}-real`, txtReal);
        this.setTxt(`meta-${type}-meta`, txtMeta);
        
        const corBarra = type === 'prod' ? 'bg-blue-500' : 'bg-emerald-500';
        
        this.setBar(`bar-meta-${type}`, pct, corBarra);
        this.atualizarPorcentagemCard(`bar-meta-${type}`, pct, subLabel);
    },

    atualizarPorcentagemCard: function(barId, pct, labelTxt) {
        const bar = document.getElementById(barId);
        if(!bar) return;
        const container = bar.parentElement.parentElement;
        if(!container) return;

        // Verifica se já existe o rodapé, se não, cria
        let label = container.querySelector('.pct-dynamic-label');
        if(!label) {
            label = document.createElement('div');
            label.className = 'flex justify-between items-center text-[10px] text-slate-500 font-bold pct-dynamic-label';
            label.innerHTML = `<span class="pct-lbl"></span><span class="pct-val"></span>`;
            container.appendChild(label);
        }

        label.querySelector('.pct-lbl').innerText = labelTxt;
        const valSpan = label.querySelector('.pct-val');
        valSpan.innerText = this.fmtPct(pct);
        
        // Cores semânticas
        if (pct >= 100 || (labelTxt === 'Aprovação' && pct >= 95) || (labelTxt === 'Índice Real' && pct >= 98)) {
            valSpan.className = 'pct-val text-emerald-600 font-black';
        } else if (pct >= 80) {
            valSpan.className = 'pct-val text-blue-600 font-bold';
        } else {
            valSpan.className = 'pct-val text-rose-600 font-bold';
        }
    },

    renderizarGrafico: function(id, lbl, dReal, dMeta, label, corHex, isPct) {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        
        if(id.includes('Producao')) { if(this.chartProd) { this.chartProd.destroy(); this.chartProd = null; } } 
        else { if(this.chartAssert) { this.chartAssert.destroy(); this.chartAssert = null; } }

        const canvasCtx = ctx.getContext('2d');
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, corHex + '40');
        gradient.addColorStop(1, corHex + '00');

        const config = {
            type: 'line',
            data: {
                labels: lbl,
                datasets: [
                    { 
                        label: label, 
                        data: dReal, 
                        borderColor: corHex, 
                        backgroundColor: gradient,
                        borderWidth: 2,
                        fill: true, 
                        tension: 0.35, 
                        pointRadius: lbl.length > 20 ? 0 : 4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: corHex,
                        pointBorderWidth: 2
                    },
                    { 
                        label: 'Meta', 
                        data: dMeta, 
                        borderColor: '#94a3b8', 
                        borderDash: [6,6], 
                        tension: 0, 
                        fill: false, 
                        pointRadius: 0,
                        borderWidth: 1.5
                    }
                ]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false, 
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', callbacks: { label: c => ` ${c.dataset.label}: ${c.raw?.toLocaleString('pt-BR') || '0'}${isPct ? '%' : ''}` } } },
                scales: { 
                    y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { callback: v => isPct ? v+'%' : v, color: '#94a3b8', font: { size: 10 } } }, 
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0, autoSkip: true } } 
                }
            }
        };

        const novoChart = new Chart(ctx, config);
        if(id.includes('Producao')) this.chartProd = novoChart; 
        else this.chartAssert = novoChart;
    },

    resetarCards: function(showLoading) {
        const ids = ['meta-prod-real','meta-assert-real','auditoria-total-auditados','auditoria-total-ok','auditoria-total-nok'];
        ids.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = showLoading ? '<i class="fas fa-spinner fa-spin text-slate-300"></i>' : '--'; });
        ['bar-meta-prod','bar-meta-assert','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = '0%'; });
        document.querySelectorAll('.pct-dynamic-label').forEach(el => el.remove());
    },

    getLabelPeriodo: function(i, f) { return `${i.split('-').reverse().slice(0,2).join('/')} a ${f.split('-').reverse().slice(0,2).join('/')}`; },
    getQtdAssistentesConfigurada: function() { const m = localStorage.getItem('gupy_config_qtd_assistentes'); return m ? parseInt(m) : 17; },
    fmtPct: function(v) { return (v||0).toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%'; },
    setTxt: function(id, v) { const e = document.getElementById(id); if(e) e.innerText = v; },
    setBar: function(id, v, c) { const e = document.getElementById(id); if(e) { e.style.width = Math.min(v||0, 100) + '%'; e.className = `h-full rounded-full transition-all duration-1000 ${c}`; } },
    getDatasFiltro: function() { return MinhaArea.getDatasFiltro(); },
    getUsuarioAlvo: function() { return MinhaArea.getUsuarioAlvo(); }
};