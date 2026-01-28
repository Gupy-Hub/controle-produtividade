/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas V5 (Debug Visual - Alert On Error)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        console.log("🚀 INICIANDO CARREGAMENTO DE METAS V5...");

        try {
            const datas = MinhaArea.getDatasFiltro();
            if (!datas) throw new Error("Datas do filtro não encontradas.");
            const { inicio, fim } = datas;

            const diffDias = (new Date(fim) - new Date(inicio)) / (1000 * 60 * 60 * 24);
            const modoMensal = diffDias > 35; 

            this.resetarCards(true);
            
            // --- 1. GARANTIA DE USUÁRIO ---
            let uid = MinhaArea.getUsuarioAlvo(); 
            if (!uid) {
                const sessao = Sistema.lerSessao();
                if (sessao) uid = sessao.id;
            }

            if (!uid) throw new Error("ID do Usuário não identificado (Login ou Filtro).");
            console.log(`👤 Usuário Alvo: ${uid}`);
            
            const anoInicio = new Date(inicio).getFullYear();
            const anoFim = new Date(fim).getFullYear();
            const anosEnvolvidos = [anoInicio];
            if (anoFim !== anoInicio) anosEnvolvidos.push(anoFim);

            // --- 2. BUSCA DE DADOS ---
            // Adicionamos logs para identificar qual query pode estar falhando
            console.log("⏳ Buscando dados no Supabase...");

            const promessas = [
                Sistema.supabase.rpc('get_kpis_minha_area', { p_inicio: inicio, p_fim: fim, p_usuario_id: uid }),
                Sistema.supabase.from('metas').select('*').in('ano', anosEnvolvidos),
                Sistema.supabase.from('usuarios').select('id, perfil, funcao').eq('ativo', true),
                Sistema.supabase.from('producao')
                    .select('data_referencia, usuario_id, fator, justificativa')
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim)
                    .eq('usuario_id', uid) 
            ];

            const [kpisRes, metasRes, usersRes, abonosRes] = await Promise.all(promessas);

            if (kpisRes.error) throw new Error("Falha RPC KPIs: " + kpisRes.error.message);
            if (metasRes.error) throw new Error("Falha Tabela Metas: " + metasRes.error.message);
            if (usersRes.error) throw new Error("Falha Tabela Usuários: " + usersRes.error.message);
            if (abonosRes.error) throw new Error("Falha Tabela Produção (Abonos): " + abonosRes.error.message);

            console.log("✅ Dados recebidos com sucesso.");

            // --- 3. PROCESSAMENTO DOS DADOS ---
            const mapaFatores = {};
            (abonosRes.data || []).forEach(r => {
                if(r.data_referencia) {
                    const dataKey = r.data_referencia.substring(0, 10); // Mais seguro que split
                    mapaFatores[dataKey] = (r.fator !== null && r.fator !== undefined) ? Number(r.fator) : 1;
                }
            });

            // Filtro de Operacionais
            const mapMetaMensal = {}; 
            const termosGestao = ['GESTOR', 'AUDITOR', 'ADMIN', 'COORD', 'LIDER', 'LÍDER', 'SUPERVIS', 'GERENTE'];
            const idsOperacionais = new Set();
            (usersRes.data || []).forEach(u => {
                const p = (u.perfil || '').toUpperCase();
                const f = (u.funcao || '').toUpperCase();
                if (!termosGestao.some(t => p.includes(t) || f.includes(t))) idsOperacionais.add(u.id);
            });

            const idsValidos = new Set([parseInt(uid)]); // Foca no usuário atual

            // Mapa de Metas
            (metasRes.data || []).forEach(m => {
                if (idsValidos.has(m.usuario_id)) {
                    const key = `${m.ano}-${m.mes}`;
                    if (!mapMetaMensal[key]) mapMetaMensal[key] = { prod: 0, assert_soma: 0, count: 0 };
                    mapMetaMensal[key].prod += (m.meta_producao || 0);
                    mapMetaMensal[key].assert_soma += (m.meta_assertividade || 98.0);
                    mapMetaMensal[key].count++;
                }
            });
            Object.keys(mapMetaMensal).forEach(k => {
                const item = mapMetaMensal[k];
                item.assert = item.count > 0 ? (item.assert_soma / item.count) : 98.0;
            });

            const mapaDados = {};
            (kpisRes.data || []).forEach(d => { mapaDados[d.data_ref || d.data] = d; });

            // --- 4. CÁLCULO CRONOLÓGICO ---
            const chartData = { labels: [], prodReal: [], prodMeta: [], assReal: [], assMeta: [] };
            let acc = { val: 0, meta: 0, audit: 0, nok: 0 };

            let curr = new Date(inicio + 'T12:00:00');
            const end = new Date(fim + 'T12:00:00');
            if (modoMensal) curr.setDate(1);

            while (curr <= end) {
                const mes = curr.getMonth() + 1;
                const ano = curr.getFullYear();
                const keyMeta = `${ano}-${mes}`;
                const metaMesCfg = mapMetaMensal[keyMeta] || { prod: 0, assert: 98.0 };
                
                let pReal = 0, pMeta = 0, aAudit = 0, aNok = 0;

                if (modoMensal) {
                    const label = curr.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.','');
                    const lastDay = new Date(ano, mes, 0).getDate();
                    for(let d=1; d<=lastDay; d++) {
                        const diaStr = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                        const diaObj = new Date(diaStr + 'T12:00:00');
                        if (diaObj < new Date(inicio + 'T00:00:00') || diaObj > new Date(fim + 'T23:59:59')) continue;
                        
                        const isFDS = (diaObj.getDay()===0 || diaObj.getDay()===6);
                        const reg = mapaDados[diaStr] || { total_producao: 0, total_auditados: 0, total_nok: 0 };
                        const fatorDia = mapaFatores[diaStr] !== undefined ? mapaFatores[diaStr] : 1;

                        pReal += reg.total_producao;
                        if(!isFDS) pMeta += (metaMesCfg.prod * fatorDia);
                        aAudit += reg.total_auditados;
                        aNok += reg.total_nok;
                    }
                    if (curr >= new Date(inicio + 'T00:00:00') || new Date(ano, mes, 0) <= end) {
                        chartData.labels.push(label);
                        chartData.prodReal.push(pReal);
                        chartData.prodMeta.push(pMeta);
                        chartData.assReal.push(aAudit>0 ? ((aAudit-aNok)/aAudit*100) : null);
                        chartData.assMeta.push(metaMesCfg.assert);
                    }
                    curr.setMonth(curr.getMonth() + 1);

                } else {
                    const iso = curr.toISOString().split('T')[0];
                    const isFDS = (curr.getDay()===0 || curr.getDay()===6);
                    const reg = mapaDados[iso] || { total_producao: 0, total_auditados: 0, total_nok: 0, media_assertividade: 0 };
                    const fatorDia = mapaFatores[iso] !== undefined ? mapaFatores[iso] : 1;

                    pMeta = isFDS ? 0 : (metaMesCfg.prod * fatorDia);
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

            // ATUALIZAÇÃO VISUAL
            console.log("🎨 Renderizando Gráficos e Cards...");
            
            // Regra de Abono Visual: Se meta é 0, atingimento é 100% (ou N/A)
            let pctProd = 0;
            if (acc.meta > 0) pctProd = (acc.val/acc.meta)*100;
            else if (acc.val > 0) pctProd = 100; // Produziu sem meta
            else pctProd = 100; // Meta 0 e Prod 0 (Abonado Total) -> Consideramos 100% Ok

            const pctAssert = acc.audit > 0 ? ((acc.audit - acc.nok)/acc.audit*100) : 0;
            const pctCob = acc.val > 0 ? (acc.audit/acc.val)*100 : 0;
            const pctAprov = acc.audit > 0 ? ((acc.audit-acc.nok)/acc.audit*100) : 100;

            this.updateCard('prod', acc.val, acc.meta, pctProd, 'Atingimento');
            this.updateCard('assert', pctAssert, 98, pctAssert, 'Índice Real', true);
            
            this.setTxt('auditoria-total-auditados', acc.audit.toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-validados', acc.val.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-cov', pctCob, 'bg-purple-500');
            this.atualizarPorcentagemCard('bar-auditoria-cov', pctCob, 'Cobertura');

            this.setTxt('auditoria-total-ok', (acc.audit - acc.nok).toLocaleString('pt-BR'));
            this.setTxt('auditoria-total-nok', acc.nok.toLocaleString('pt-BR'));
            this.setBar('bar-auditoria-res', pctAprov, 'bg-emerald-500');
            this.atualizarPorcentagemCard('bar-auditoria-res', pctAprov, 'Aprovação');

            const periodoTxt = this.getLabelPeriodo(inicio, fim);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = periodoTxt);
            this.renderizarGrafico('graficoEvolucaoProducao', chartData.labels, chartData.prodReal, chartData.prodMeta, 'Produção', '#3b82f6', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', chartData.labels, chartData.assReal, chartData.assMeta, 'Qualidade', '#10b981', true);

            console.log("🏁 Carregamento concluído!");

        } catch (err) {
            console.error("❌ ERRO FATAL EM METAS:", err);
            alert("⚠️ ERRO AO CARREGAR METAS:\n\n" + err.message); // ALERTA VISUAL
            this.resetarCards(false); 
        } finally {
            this.isLocked = false;
        }
    },

    updateCard: function(type, real, meta, pct, subLabel, isPct = false) {
        const elReal = document.getElementById(`meta-${type}-real`);
        if(!elReal) return; // Evita crash se elemento não existir
        
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
        if(!ctx) {
            console.warn(`Canvas não encontrado: ${id}`);
            return;
        }
        
        // Verifica se Chart.js está carregado
        if (typeof Chart === 'undefined') {
            throw new Error("Biblioteca Chart.js não foi carregada.");
        }

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