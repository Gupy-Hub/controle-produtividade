/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas (Visual Premium + Gradient Charts)
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
        const modoMensal = diffDias > 35; // Agrupa por mês se período longo

        console.log(`🚀 Metas: Visual Premium Carregando... (Modo Mensal: ${modoMensal})`);

        this.resetarCards(true);
        const uid = MinhaArea.getUsuarioAlvo(); 
        
        try {
            // 1. DADOS & METAS
            const [kpisRes, configRes] = await Promise.all([
                Sistema.supabase.rpc('get_kpis_minha_area', { p_inicio: inicio, p_fim: fim, p_usuario_id: uid }),
                Sistema.supabase.from('metas').select('*').eq('ano', new Date(inicio).getFullYear())
            ]);

            if (kpisRes.error) throw kpisRes.error;
            
            // Mapas de Dados
            const dadosDiarios = kpisRes.data || [];
            const mapaDados = {};
            dadosDiarios.forEach(d => { mapaDados[d.data_ref || d.data] = d; });

            const mapMetas = {};
            (configRes.data || []).forEach(m => {
                if (!uid || m.usuario_id == uid) { // Filtra se for user específico
                    mapMetas[m.mes] = { prod: m.meta_producao || 100, assert: m.meta_assertividade || 98.0 };
                }
            });

            // --- PROCESSAMENTO DE DADOS ---
            const chartData = { labels: [], prodReal: [], prodMeta: [], assReal: [], assMeta: [] };
            let acc = { val: 0, meta: 0, audit: 0, nok: 0 };
            const metaPadrao = uid ? 100 : (100 * this.getQtdAssistentesConfigurada());

            let curr = new Date(inicio + 'T12:00:00');
            const end = new Date(fim + 'T12:00:00');
            if (modoMensal) curr.setDate(1);

            while (curr <= end) {
                const mes = curr.getMonth() + 1;
                const ano = curr.getFullYear();
                const metaMesCfg = mapMetas[mes] || { prod: metaPadrao, assert: 98.0 };
                
                let pReal = 0, pMeta = 0, aAudit = 0, aNok = 0;

                if (modoMensal) {
                    // Agregação Mensal
                    const label = curr.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.','');
                    const lastDay = new Date(ano, mes, 0).getDate();
                    
                    for(let d=1; d<=lastDay; d++) {
                        const dia = new Date(ano, mes-1, d);
                        if (dia < new Date(inicio) || dia > new Date(fim)) continue;
                        
                        const iso = dia.toISOString().split('T')[0];
                        const isFDS = (dia.getDay()===0 || dia.getDay()===6);
                        const reg = mapaDados[iso] || { total_producao: 0, total_auditados: 0, total_nok: 0 };
                        
                        pReal += reg.total_producao;
                        if(!isFDS) pMeta += metaMesCfg.prod;
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
                    // Modo Diário
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

                acc.val += pReal; acc.meta += pMeta; acc.audit += aAudit; acc.nok += aNok;
            }

            // 4. ATUALIZAR CARDS (DOM)
            const pctProd = acc.meta > 0 ? (acc.val/acc.meta)*100 : 0;
            const pctAssert = acc.audit > 0 ? ((acc.audit - acc.nok)/acc.audit*100) : 0;
            const pctCob = acc.val > 0 ? (acc.audit/acc.val)*100 : 0;
            const pctAprov = acc.audit > 0 ? ((acc.audit-acc.nok)/acc.audit*100) : 100;

            this.updateCard('prod', acc.val, acc.meta, pctProd, 'Atingimento');
            this.updateCard('assert', pctAssert, 98, pctAssert, 'Índice Real', true); // isPercent = true
            
            // Cobertura
            this.setTxt('auditoria-total-auditados', acc.audit);
            this.setTxt('auditoria-total-validados', acc.val);
            this.setBar('bar-auditoria-cov', pctCob, 'bg-purple-500');
            this.setTxt('sub-auditoria-cov', this.fmtPct(pctCob));
            this.colorirTexto('sub-auditoria-cov', pctCob, 100, 50, 'text-purple-600');

            // Resultado
            this.setTxt('auditoria-total-ok', acc.audit - acc.nok);
            this.setTxt('auditoria-total-nok', acc.nok);
            this.setBar('bar-auditoria-res', pctAprov, 'bg-emerald-500');
            this.setTxt('sub-auditoria-res', this.fmtPct(pctAprov));
            this.colorirTexto('sub-auditoria-res', pctAprov, 95, 80, 'text-emerald-600');


            // 5. RENDERIZAR GRÁFICOS
            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            
            this.renderizarGrafico('graficoEvolucaoProducao', chartData.labels, chartData.prodReal, chartData.prodMeta, 'Produção', '#3b82f6', false); // Azul Premium
            this.renderizarGrafico('graficoEvolucaoAssertividade', chartData.labels, chartData.assReal, chartData.assMeta, 'Qualidade', '#10b981', true); // Emerald Premium

        } catch (err) {
            console.error("Erro Metas:", err);
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    // --- UTILS VISUAIS ---
    updateCard: function(type, real, meta, pct, subLabel, isPct = false) {
        const txtReal = isPct ? this.fmtPct(real) : real.toLocaleString('pt-BR');
        const txtMeta = isPct ? `${meta}%` : meta.toLocaleString('pt-BR');
        
        this.setTxt(`meta-${type}-real`, txtReal);
        this.setTxt(`meta-${type}-meta`, txtMeta);
        this.setTxt(`sub-meta-${type}`, this.fmtPct(pct));
        
        const corBarra = type === 'prod' ? 'bg-blue-500' : 'bg-emerald-500';
        const corTexto = type === 'prod' ? 'text-blue-600' : 'text-emerald-600';
        
        this.setBar(`bar-meta-${type}`, pct, corBarra);
        this.colorirTexto(`sub-meta-${type}`, pct, 100, 80, corTexto);
    },

    colorirTexto: function(id, val, metaHigh, metaMed, defaultColor) {
        const el = document.getElementById(id);
        if(!el) return;
        el.className = 'font-bold ';
        if (val >= metaHigh) el.classList.add('text-emerald-600');
        else if (val >= metaMed) el.classList.add('text-amber-500');
        else el.classList.add('text-rose-500');
    },

    // --- GRÁFICOS COM DEGRADÊ (PREMIUM LOOK) ---
    renderizarGrafico: function(id, lbl, dReal, dMeta, label, corHex, isPct) {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        
        // Limpeza Segura
        if(id.includes('Producao')) { if(this.chartProd) { this.chartProd.destroy(); this.chartProd = null; } } 
        else { if(this.chartAssert) { this.chartAssert.destroy(); this.chartAssert = null; } }

        // Criação do Degradê
        const canvasCtx = ctx.getContext('2d');
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, corHex + '40'); // 25% Opacidade no topo
        gradient.addColorStop(1, corHex + '00'); // 0% Opacidade embaixo

        const config = {
            type: 'line',
            data: {
                labels: lbl,
                datasets: [
                    { 
                        label: label, 
                        data: dReal, 
                        borderColor: corHex, 
                        backgroundColor: gradient, // Aplica Degradê
                        borderWidth: 2,
                        fill: true, 
                        tension: 0.35, // Curva suave
                        pointRadius: lbl.length > 20 ? 0 : 4, 
                        pointBackgroundColor: '#fff',
                        pointBorderColor: corHex,
                        pointBorderWidth: 2,
                        pointHoverRadius: 6
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
                plugins: { 
                    legend: { display: false }, 
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#f8fafc',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false, // Remove quadradinho de cor
                        callbacks: {
                            label: c => ` ${c.dataset.label}: ${c.raw?.toLocaleString('pt-BR') || '0'}${isPct ? '%' : ''}`
                        }
                    } 
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9', drawBorder: false }, 
                        ticks: { 
                            callback: v => isPct ? v+'%' : v,
                            color: '#94a3b8',
                            font: { size: 10, family: 'Inter' }
                        } 
                    }, 
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            color: '#94a3b8',
                            font: { size: 10, family: 'Inter' },
                            maxRotation: 0,
                            autoSkip: true,
                            autoSkipPadding: 20
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
        const ids = ['meta-prod-real','meta-assert-real','auditoria-total-auditados','auditoria-total-ok','auditoria-total-nok'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.innerHTML = showLoading ? '<i class="fas fa-spinner fa-spin text-slate-300 text-sm"></i>' : '--'; 
        });
        ['bar-meta-prod','bar-meta-assert','bar-auditoria-cov','bar-auditoria-res'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.style.width = '0%'; 
        });
        // Reseta textos secundários
        ['sub-meta-prod','sub-meta-assert','sub-auditoria-cov','sub-auditoria-res'].forEach(id => this.setTxt(id, '--%'));
    },

    getLabelPeriodo: function(i, f) {
        return `${i.split('-').reverse().slice(0,2).join('/')} a ${f.split('-').reverse().slice(0,2).join('/')}`;
    },

    getQtdAssistentesConfigurada: function() { 
        const m = localStorage.getItem('gupy_config_qtd_assistentes'); 
        return m ? parseInt(m) : 17; 
    },

    fmtPct: function(v) { return (v||0).toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%'; },
    setTxt: function(id, v) { const e = document.getElementById(id); if(e) e.innerText = v; },
    setBar: function(id, v, c) { const e = document.getElementById(id); if(e) { e.style.width = Math.min(v||0, 100) + '%'; e.className = `h-full rounded-full transition-all duration-1000 ${c}`; } },
    
    // Helpers de Filtro e Datas
    getDatasFiltro: function() { return MinhaArea.getDatasFiltro(); },
    getUsuarioAlvo: function() { return MinhaArea.getUsuarioAlvo(); }
};