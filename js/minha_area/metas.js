/* ARQUIVO: js/minha_area/metas.js
   DESCRIÇÃO: Engine de Metas e OKRs (Minha Área)
   ATUALIZAÇÃO: v4.4 - INDEX MATCHING (Alinhamento de Query com Índice do Banco)
   MOTIVO: Correção Definitiva do Timeout 57014 (Elimina ordenação pesada por ID)
*/

MinhaArea.Metas = {
    chartProd: null,
    chartAssert: null,
    isLocked: false,

    // --- MANIPULAÇÃO DE DADOS ---
    // Agora aceita 'orderBy' para alinhar com o índice SQL
    fetchParalelo: async function(tabela, colunas, filtrosFn, orderBy = 'id') {
        // 1. Count Inicial
        let qCount = Sistema.supabase.from(tabela).select('*', { count: 'exact', head: true });
        qCount = filtrosFn(qCount);
        const { count, error } = await qCount;
        
        if (error) { 
            console.error(`❌ Erro count ${tabela}:`, error); 
            return []; 
        }
        if (!count || count === 0) return [];

        const pageSize = 1000;
        const totalPages = Math.ceil(count / pageSize);
        let allData = [];

        // Estratégia Híbrida
        const isHeavyTable = (tabela === 'assertividade');
        const BATCH_SIZE = isHeavyTable ? 1 : 5; // Serial para pesado, Paralelo para leve
        const modo = isHeavyTable ? 'SERIAL (Indexado)' : 'TURBO';

        console.log(`🛡️ [v4.4] ${tabela}: Baixando ${count} registros. Modo: ${modo}. Ordenação: ${orderBy}...`);

        const fetchPageSafe = async (pageIndex) => {
            const maxRetries = 5; 
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    let q = Sistema.supabase.from(tabela).select(colunas);

                    // OTIMIZAÇÃO CRÍTICA SQL:
                    // Se ordenarmos por data (que já filtramos), o banco não precisa reordenar tudo.
                    if (orderBy === 'data_referencia') {
                         q = q.order('data_referencia', { ascending: true })
                              .order('id', { ascending: true }); // Tie-breaker
                    } else {
                         q = q.order(orderBy, { ascending: true });
                    }

                    q = q.range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);
                    q = filtrosFn(q);
                    
                    const { data, error } = await q;
                    if (error) throw error;
                    return data || [];
                } catch (err) {
                    const baseDelay = isHeavyTable ? 2000 : 1000;
                    const delay = baseDelay * attempt;
                    console.warn(`⚠️ [RETRY] ${tabela} Pág ${pageIndex}: Tentativa ${attempt}/${maxRetries} falhou. Aguardando ${delay}ms...`);
                    if (attempt === maxRetries) throw err;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        };

        for (let i = 0; i < totalPages; i += BATCH_SIZE) {
            const batchPromises = [];
            for (let j = i; j < i + BATCH_SIZE && j < totalPages; j++) {
                batchPromises.push(fetchPageSafe(j));
            }

            try {
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(data => { if (data) allData = allData.concat(data); });
                
                const progresso = Math.min(((i + BATCH_SIZE) / totalPages) * 100, 100).toFixed(0);
                if (i % (BATCH_SIZE * 5) === 0 || progresso == '100') {
                    console.log(`⏳ [${modo}] ${tabela}: ${progresso}% carregado (${allData.length} recs)...`);
                }
            } catch (err) {
                console.error(`❌ [FALHA] Lote ${i} da tabela ${tabela}.`, err);
            }
        }
        
        console.log(`✅ [${modo}] ${tabela}: Concluído. ${allData.length}/${count}.`);
        return allData;
    },

    carregar: async function() {
        if (this.isLocked) { console.warn("⛔ Aguarde..."); return; }
        this.isLocked = true;

        console.log("🚀 Metas: Iniciando Modo Espelho (v4.4 - Index Matching)...");
        try { console.timeEnd("⏱️ Tempo Total"); } catch(e) {}

        const uid = MinhaArea.getUsuarioAlvo(); 
        const isGeral = (uid === null);
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        // Ajuste de Datas
        const dtInicio = new Date(inicio + 'T12:00:00');
        const dtFim = new Date(fim + 'T12:00:00');
        const anoInicio = dtInicio.getFullYear();
        const anoFim = dtFim.getFullYear();

        this.resetarCards();

        try {
            console.time("⏱️ Tempo Total");

            // Filtros
            const applyFiltersProd = (q) => {
                let qq = q.gte('data_referencia', inicio).lte('data_referencia', fim);
                if (uid) qq = qq.eq('usuario_id', uid);
                return qq;
            };
            const applyFiltersAssert = (q) => {
                let qq = q.gte('data_referencia', inicio).lte('data_referencia', fim);
                if (uid) qq = qq.eq('usuario_id', uid);
                return qq;
            };
            const applyFiltersUser = (q) => q;

            // Busca de Metas (Config)
            let qMetas = Sistema.supabase.from('metas')
                .select('usuario_id, mes, ano, meta_producao, meta_assertividade') 
                .gte('ano', anoInicio).lte('ano', anoFim);
            if (uid) qMetas = qMetas.eq('usuario_id', uid);

            // --- EXECUÇÃO OTIMIZADA ---
            // 1. Usuários (Leve -> Ordena por ID)
            const dadosUsuarios = await this.fetchParalelo('usuarios', 'id, ativo, nome, perfil, funcao', applyFiltersUser, 'id');
            const resMetas = await qMetas;
            const dadosMetasRaw = resMetas.data || [];

            // 2. Produção (Médio -> Ordena por DATA para usar índice)
            const dadosProducaoRaw = await this.fetchParalelo('producao', '*', applyFiltersProd, 'data_referencia');

            // 3. Assertividade (Pesado -> Ordena por DATA para usar índice)
            // Essa mudança faz o banco usar o "Index Scan" em vez de "Sort"
            const dadosAssertividadeRaw = await this.fetchParalelo('assertividade', 'id, data_referencia, porcentagem_assertividade, status, qtd_nok, usuario_id, auditora_nome', applyFiltersAssert, 'data_referencia');
            
            console.timeEnd("⏱️ Tempo Total");

            // --- PROCESSAMENTO ---
            const idsBloqueados = new Set();
            const mapUser = {};
            const termosGestao = ['AUDITORA', 'GESTORA', 'ADMIN', 'COORD', 'SUPERVIS', 'LIDER'];
            const nomesBloqueados = ['VANESSA', 'KEILA', 'BRENDA', 'PATRICIA', 'PATRÍCIA', 'GUPY'];

            dadosUsuarios.forEach(u => {
                mapUser[u.id] = {
                    perfil: (u.perfil || 'ASSISTENTE').toUpperCase().trim(),
                    funcao: (u.funcao || '').toUpperCase().trim(),
                    nome: (u.nome || '').toUpperCase().trim(),
                    ativo: u.ativo
                };
                const nomeUpper = mapUser[u.id].nome;
                const isGestao = termosGestao.some(t => (u.funcao||'').toUpperCase().includes(t) || (u.perfil||'').toUpperCase().includes(t));
                if (isGestao || nomesBloqueados.some(n => nomeUpper.includes(n))) idsBloqueados.add(u.id);
            });

            const usuariosQueProduziram = new Set(dadosProducaoRaw.map(p => p.usuario_id));

            // Mapa Metas
            const mapMetas = {};
            dadosMetasRaw.forEach(m => {
                const a = parseInt(m.ano), ms = parseInt(m.mes), uId = m.usuario_id;
                if (!mapMetas[a]) mapMetas[a] = {};
                if (!mapMetas[a][ms]) mapMetas[a][ms] = { prodTotalDiario: 0, somaIndividual: 0, qtdAssistentesDB: 0, prodValues: [], assertValues: [], assertFinal: 98.0 };
                
                const valProd = m.meta_producao ? parseInt(m.meta_producao) : 0;
                const valAssert = (m.meta_assertividade !== null) ? parseFloat(m.meta_assertividade) : 98.0;

                if (isGeral) {
                    const uData = mapUser[uId];
                    if (!idsBloqueados.has(uId) && uData) {
                        if (uData.ativo || usuariosQueProduziram.has(uId)) {
                            if (valProd > 0) {
                                mapMetas[a][ms].somaIndividual += valProd;
                                mapMetas[a][ms].qtdAssistentesDB++; 
                                mapMetas[a][ms].prodValues.push(valProd);
                            }
                        }
                    }
                    mapMetas[a][ms].assertValues.push(valAssert);
                } else {
                    mapMetas[a][ms].prodTotalDiario = valProd;
                    mapMetas[a][ms].assertFinal = valAssert;
                }
            });

            if (isGeral) {
                const targetAssistentes = this.getQtdAssistentesConfigurada(); 
                for (const a in mapMetas) {
                    for (const ms in mapMetas[a]) {
                        const d = mapMetas[a][ms];
                        let capacidade = d.somaIndividual;
                        const gap = targetAssistentes - d.qtdAssistentesDB;
                        if (gap > 0) {
                            let valProj = 100;
                            if (d.prodValues.length > 0) valProj = this.calcularModaOuMedia(d.prodValues).valor;
                            capacidade += (gap * valProj);
                        } else if (d.qtdAssistentesDB === 0) capacidade = 100 * targetAssistentes;
                        
                        d.prodTotalDiario = capacidade;
                        if (d.assertValues.length > 0) d.assertFinal = this.calcularMetaInteligente(d.assertValues).valor;
                    }
                }
            }

            // Mapas de Dados
            const mapProd = new Map();
            if (isGeral) {
                dadosProducaoRaw.forEach(p => {
                    const d = p.data_referencia;
                    if (!mapProd.has(d)) mapProd.set(d, { quantidade: 0, fator_soma: 0, count: 0 });
                    const r = mapProd.get(d);
                    r.quantidade += Number(p.quantidade || 0);
                    r.fator_soma += Number(p.fator || 1);
                    r.count++;
                });
                for (let [k, v] of mapProd) v.fator = v.count > 0 ? (v.fator_soma/v.count) : 1;
            } else {
                dadosProducaoRaw.forEach(p => mapProd.set(p.data_referencia, p));
            }

            const mapAssert = new Map();
            dadosAssertividadeRaw.forEach(a => {
                if (!a.data_referencia) return;
                if (isGeral && (idsBloqueados.has(a.usuario_id) || !mapUser[a.usuario_id])) return;
                
                const st = (a.status||'').toUpperCase();
                if (!['REV','EMPR','DUPL','IA'].includes(st) && a.porcentagem_assertividade !== null) {
                    if(!mapAssert.has(a.data_referencia)) mapAssert.set(a.data_referencia, []);
                    let v = parseFloat(String(a.porcentagem_assertividade).replace('%','').replace(',','.'));
                    if(!isNaN(v)) mapAssert.get(a.data_referencia).push(v);
                }
            });

            // Geração Gráficos
            const diffDays = (dtFim - dtInicio) / (86400000);
            const modoMensal = diffDays > 35;
            const labels = [], dProdR = [], dProdM = [], dAssR = [], dAssM = [];
            const aggM = new Map();
            const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                const isFDS = (d.getDay() === 0 || d.getDay() === 6);
                if (!modoMensal && isFDS) continue;
                
                const dStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear(), mes = d.getMonth()+1, dia = d.getDate();
                const meta = mapMetas[ano]?.[mes] || { prodTotalDiario: (isGeral ? 100 * this.getQtdAssistentesConfigurada() : 100), assertFinal: 98.0 };
                
                const p = mapProd.get(dStr);
                const qtd = p ? Number(p.quantidade||0) : 0;
                const fat = p ? Number(p.fator) : (isFDS?0:1);
                const mDia = Math.round(meta.prodTotalDiario * (isNaN(fat)?1:fat));
                const assList = mapAssert.get(dStr) || [];

                if (modoMensal) {
                    const k = `${ano}-${mes}`;
                    if(!aggM.has(k)) aggM.set(k, { lbl: meses[mes-1], pR: 0, pM: 0, aS: 0, aQ: 0, aM: meta.assertFinal });
                    const s = aggM.get(k);
                    s.pR += qtd; s.pM += mDia;
                    if(assList.length>0) assList.forEach(v=>{ s.aS+=v; s.aQ++; });
                } else {
                    labels.push(`${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`);
                    dProdR.push(qtd); dProdM.push(mDia);
                    dAssR.push(assList.length>0 ? (assList.reduce((a,b)=>a+b,0)/assList.length) : null);
                    dAssM.push(Number(meta.assertFinal));
                }
            }

            if (modoMensal) {
                for (const [k, v] of aggM) {
                    labels.push(v.lbl); dProdR.push(v.pR); dProdM.push(v.pM);
                    dAssR.push(v.aQ>0 ? (v.aS/v.aQ) : null); dAssM.push(Number(v.aM));
                }
            }

            this.atualizarCardsKPI(mapProd, dadosAssertividadeRaw, mapMetas, dtInicio, dtFim, isGeral, mapUser, usuariosQueProduziram, idsBloqueados);
            document.querySelectorAll('.periodo-label').forEach(el => el.innerText = modoMensal ? 'Mensal' : 'Diário');
            this.renderizarGrafico('graficoEvolucaoProducao', labels, dProdR, dProdM, 'Validação', '#2563eb', false);
            this.renderizarGrafico('graficoEvolucaoAssertividade', labels, dAssR, dAssM, 'Assertividade', '#059669', true);

        } catch (err) { console.error("❌ Erro Metas:", err); } 
        finally { this.isLocked = false; }
    },

    // Funções auxiliares mantidas
    getQtdAssistentesConfigurada: function() { const m=localStorage.getItem('gupy_config_qtd_assistentes'); return m?parseInt(m):17; },
    calcularModaOuMedia: function(arr) {
        if(!arr||arr.length===0) return {valor:100};
        const freq={}; let max=0, moda=arr[0], soma=0;
        arr.forEach(v=>{ soma+=v; freq[v]=(freq[v]||0)+1; if(freq[v]>max){max=freq[v]; moda=v;} });
        return ((max/arr.length)>=0.3) ? {valor:moda} : {valor:Math.round(soma/arr.length)};
    },
    calcularMetaInteligente: function(arr) {
        if(!arr||arr.length===0) return {valor:98.0};
        const freq={}; let max=0, moda=arr[0], soma=0;
        arr.forEach(v=>{ soma+=v; freq[v]=(freq[v]||0)+1; if(freq[v]>max){max=freq[v]; moda=v;} });
        return ((max/arr.length)>=0.7) ? {valor:moda} : {valor:Number((soma/arr.length).toFixed(2))};
    },
    
    atualizarCardsKPI: function(mapProd, asserts, mapMetas, dtIni, dtFim, isGeral, mapUser, userProd, blockIds) {
        let tVal=0, tMeta=0, sAss=0, qAss=0, cAud=0, cErr=0, dias=0;
        
        let temp = new Date(dtIni);
        for(let d=new Date(temp); d<=dtFim; d.setDate(d.getDate()+1)) {
            const dStr = d.toISOString().split('T')[0];
            const meta = mapMetas[d.getFullYear()]?.[d.getMonth()+1] || {prodTotalDiario:100, assertFinal:98.0};
            const p = mapProd.get(dStr);
            const fat = p ? Number(p.fator) : ((d.getDay()===0||d.getDay()===6)?0:1);
            if(p) tVal += Number(p.quantidade||0);
            tMeta += Math.round(meta.prodTotalDiario * (isNaN(fat)?1:fat));
            dias++;
        }

        asserts.forEach(a => {
            const uid = a.usuario_id;
            let eligible = true;
            if (isGeral && (blockIds.has(uid) || !mapUser[uid])) eligible = false;
            
            if (eligible && !['REV','EMPR','DUPL','IA'].includes((a.status||'').toUpperCase()) && a.porcentagem_assertividade!==null) {
                let v = parseFloat(String(a.porcentagem_assertividade).replace('%','').replace(',','.'));
                if(!isNaN(v)) { sAss+=v; qAss++; }
            }
            if(a.auditora_nome && a.auditora_nome.trim() !== '') {
                cAud++; 
                if(Number(a.qtd_nok)>0) cErr++;
            }
        });

        const medAss = qAss>0?(sAss/qAss):0;
        const cov = tVal>0?((cAud/tVal)*100):0;
        const res = cAud>0?(((cAud-cErr)/cAud)*100):100;

        this.setTxt('meta-prod-real', tVal.toLocaleString('pt-BR'));
        this.setTxt('meta-prod-meta', tMeta.toLocaleString('pt-BR'));
        this.setBar('bar-meta-prod', tMeta>0?(tVal/tMeta)*100:0, 'bg-blue-600');

        this.setTxt('meta-assert-real', medAss.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%');
        this.setBar('bar-meta-assert', medAss, medAss>=98?'bg-emerald-500':'bg-rose-500');

        this.setTxt('auditoria-total-auditados', cAud.toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-validados', tVal.toLocaleString('pt-BR'));
        this.setTxt('auditoria-pct-cobertura', cov.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
        this.setBar('bar-auditoria-cov', cov, 'bg-purple-500');

        this.setTxt('auditoria-total-ok', (cAud-cErr).toLocaleString('pt-BR'));
        this.setTxt('auditoria-total-nok', cErr.toLocaleString('pt-BR'));
        this.setBar('bar-auditoria-res', res, res>=95?'bg-emerald-500':'bg-rose-500');
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
                    { label: label, data: dReal, borderColor: cor, backgroundColor: cor+'10', fill: true, tension: 0.3 },
                    { label: 'Meta', data: dMeta, borderColor: '#cbd5e1', borderDash: [4,4], tension: 0.3, fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: {intersect: false, mode: 'index'},
                plugins: { legend: {display:false}, tooltip: {callbacks:{label: c=>c.dataset.label+': '+c.raw.toLocaleString('pt-BR')+(isPct?'%':'')}} },
                scales: { y: {beginAtZero: true, grid:{color:'#f1f5f9'}, ticks:{callback: v=>isPct?v+'%':v}}, x: {grid:{display:false}} }
            }
        });
        if(id.includes('Producao')) this.chartProd = chart; else this.chartAssert = chart;
    },
    resetarCards: function() { /* Lógica de reset visual */ },
    setTxt: function(id, v) { const e=document.getElementById(id); if(e) e.innerText=v; },
    setBar: function(id, v, c) { const e=document.getElementById(id); if(e) { e.style.width=Math.min(v,100)+'%'; e.className=`h-full rounded-full transition-all duration-700 ${c}`; } }
};