// ARQUIVO: js/produtividade/performance.js
window.Produtividade = window.Produtividade || {};

Produtividade.Performance = {
    initialized: false,
    chart: null,

    init: function() {
        console.log("🏎️ Performance UX: Engine V3 (Score & Insights)");
        this.initialized = true;
    },

    carregar: async function() {
        if(document.getElementById('tab-performance').classList.contains('hidden')) return;

        console.log("🏎️ Performance: Analisando dados...");
        const datas = Produtividade.getDatasFiltro();
        const usuarioId = Produtividade.Geral.usuarioSelecionado;
        const nomeUsuario = document.getElementById('selected-name')?.textContent;

        this.atualizarHeaderUI(usuarioId, nomeUsuario);

        try {
            // BUSCA AVANÇADA: Traz assertividade E Metas para calculo preciso
            const { data, error } = await Sistema.supabase.rpc('get_painel_produtividade', {
                data_inicio: datas.inicio,
                data_fim: datas.fim
            });

            if (error) throw error;

            // Filtra assistentes operacionais (ignora gestoras no ranking, a menos que selecionadas)
            const dadosProcessados = data.filter(u => 
                !['AUDITORA', 'GESTORA'].includes((u.funcao || '').toUpperCase()) || u.usuario_id == usuarioId
            );

            this.analisarKPIs(dadosProcessados, usuarioId);

        } catch (error) {
            console.error("Erro Performance:", error);
        }
    },

    atualizarHeaderUI: function(uid, nome) {
        const chip = document.getElementById('perf-filter-chip');
        const txt = document.getElementById('perf-filter-name');
        if(uid) {
            chip.classList.remove('hidden');
            chip.classList.add('flex');
            txt.innerText = nome;
        } else {
            chip.classList.add('hidden');
            chip.classList.remove('flex');
        }
    },

    analisarKPIs: function(dados, filtroId) {
        // Se houver filtro, foca os KPIs apenas nele. Se não, média da equipe.
        const foco = filtroId ? dados.filter(d => d.usuario_id == filtroId) : dados;

        // 1. CÁLCULOS GERAIS
        let totalVol = 0, totalMeta = 0, somaNotas = 0, qtdAud = 0;
        
        // Mapa para Ranking e Gráfico
        const ranking = [];
        const diasGrafico = {}; 

        foco.forEach(d => {
            const vol = Number(d.total_qty);
            const meta = Number(d.meta_producao) * Number(d.total_dias_uteis);
            const notas = Number(d.soma_auditorias);
            const auditadas = Number(d.qtd_auditorias);

            totalVol += vol;
            totalMeta += meta;
            somaNotas += notas;
            qtdAud += auditadas;

            // Prepara dados para o Ranking (Score 0-10)
            const mediaUser = auditadas > 0 ? (notas / auditadas) : 0;
            const pctMetaVol = meta > 0 ? Math.min(vol/meta, 1.2) : 0; // Teto de 120% no volume pra não distorcer
            
            // FÓRMULA DO SCORE: 40% Volume + 60% Qualidade (Qualidade pesa mais)
            // Qualidade normalizada: 98% = nota 10. Abaixo disso cai rápido.
            let scoreQual = 0;
            if(mediaUser >= 98) scoreQual = 10;
            else if(mediaUser >= 90) scoreQual = 7 + ((mediaUser-90)/8)*3; // Entre 90-98 escala de 7 a 10
            else scoreQual = (mediaUser / 90) * 7; // Abaixo de 90 pune forte

            const scoreVol = pctMetaVol * 10;
            const finalScore = (scoreVol * 0.4) + (scoreQual * 0.6);

            ranking.push({
                id: d.usuario_id,
                nome: d.nome,
                vol: vol,
                qual: mediaUser,
                score: finalScore,
                dias: d.total_dias_uteis
            });
        });

        // 2. PLOTAR KPIs ESTRATÉGICOS
        const mediaGeral = qtdAud > 0 ? (somaNotas / qtdAud) : 0;
        const pctVolGeral = totalMeta > 0 ? (totalVol / totalMeta) * 100 : 0;

        this.setHTML('perf-kpi-vol', totalVol.toLocaleString('pt-BR'));
        this.setHTML('perf-kpi-vol-pct', `${pctVolGeral.toFixed(0)}% da Meta`);
        document.getElementById('bar-vol-kpi').style.width = Math.min(pctVolGeral, 100) + '%';

        this.setHTML('perf-kpi-qual', mediaGeral.toFixed(2) + '%');
        
        const elStatus = document.getElementById('perf-qual-status');
        if(mediaGeral >= 98) {
            elStatus.className = "mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700";
            elStatus.innerText = "Excelência Operacional 🌟";
        } else if (mediaGeral >= 95) {
            elStatus.className = "mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700";
            elStatus.innerText = "Dentro da Tolerância";
        } else {
            elStatus.className = "mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700";
            elStatus.innerText = "Abaixo do Padrão ⚠️";
        }

        // 3. ENCONTRAR MVP E OFENSOR (Baseado no Ranking Completo, não no filtrado)
        // Precisamos olhar para todos para dizer quem é o melhor/pior
        ranking.sort((a,b) => b.score - a.score); // Ordena pelo Score

        // MVP (Primeiro do Ranking com volume relevante)
        const mvp = ranking[0]; 
        if(mvp) {
            this.setHTML('perf-star-name', mvp.nome.split(' ')[0]);
            this.setHTML('perf-star-score', `${mvp.score.toFixed(1)}/10`);
        } else {
            this.setHTML('perf-star-name', '-');
            this.setHTML('perf-star-score', '-');
        }

        // Ofensor (Pior Qualidade entre quem tem volume > 0)
        const rankingQualidade = [...ranking].filter(r => r.vol > 0).sort((a,b) => a.qual - b.qual);
        const ofensor = rankingQualidade[0];
        if(ofensor) {
            this.setHTML('perf-alert-name', ofensor.nome.split(' ')[0]);
            this.setHTML('perf-alert-val', ofensor.qual.toFixed(2) + '%');
        }

        // 4. RENDERIZAR LISTA DE RANKING (Lateral)
        this.renderizarListaLateral(ranking, filtroId);

        // 5. GRÁFICO (Precisa buscar dados diários brutos para montar a linha do tempo)
        this.buscarDadosGrafico(datas, filtroId);
    },

    setHTML: function(id, val) { const el = document.getElementById(id); if(el) el.innerHTML = val; },

    renderizarListaLateral: function(ranking, selecionadoId) {
        const container = document.getElementById('perf-ranking-list');
        if(!container) return;
        container.innerHTML = '';

        ranking.forEach((u, index) => {
            const isSelected = u.id == selecionadoId;
            const bgClass = isSelected ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-white border-slate-100 hover:border-slate-300';
            
            // Barras de progresso visuais
            const widthVol = Math.min((u.score * 10), 100); 
            const colorVol = u.qual >= 98 ? 'bg-emerald-400' : (u.qual >= 95 ? 'bg-amber-400' : 'bg-rose-400');

            container.innerHTML += `
                <div onclick="Produtividade.Geral.filtrarUsuario('${u.id}', '${u.nome}')" 
                     class="cursor-pointer rounded-lg border p-2 transition group ${bgClass}">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-bold text-slate-400 w-4">#${index+1}</span>
                            <span class="text-xs font-bold text-slate-700 truncate w-24 group-hover:text-blue-600">${u.nome.split(' ')[0]}</span>
                        </div>
                        <span class="text-[10px] font-bold ${u.qual >= 98 ? 'text-emerald-600' : 'text-rose-500'}">${u.qual.toFixed(1)}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full ${colorVol}" style="width: ${widthVol}%"></div>
                    </div>
                    <div class="flex justify-between mt-1">
                        <span class="text-[9px] text-slate-400">Vol: ${u.vol.toLocaleString('pt-BR')}</span>
                        <span class="text-[9px] font-bold text-slate-500">Score: ${u.score.toFixed(1)}</span>
                    </div>
                </div>
            `;
        });
    },

    buscarDadosGrafico: async function(datas, usuarioId) {
        // Busca assertividade diária para o gráfico
        let query = Sistema.supabase
            .from('assertividade')
            .select('data_referencia, porcentagem_assertividade, usuario_id')
            .gte('data_referencia', datas.inicio)
            .lte('data_referencia', datas.fim);
        
        if (usuarioId) query = query.eq('usuario_id', usuarioId);

        const { data: assertData } = await query;

        // Busca produção diária para o gráfico
        let queryProd = Sistema.supabase
            .from('producao')
            .select('data_referencia, quantidade, usuario_id')
            .gte('data_referencia', datas.inicio)
            .lte('data_referencia', datas.fim);
            
        if (usuarioId) queryProd = queryProd.eq('usuario_id', usuarioId);

        const { data: prodData } = await queryProd;

        this.renderizarGraficoHibrido(assertData || [], prodData || [], datas.inicio, datas.fim);
    },

    renderizarGraficoHibrido: function(assertData, prodData, start, end) {
        const ctx = document.getElementById('chartPerformance');
        if (!ctx) return;

        // Agrupar por dia
        const dias = {};
        let curr = new Date(start + 'T12:00:00');
        const last = new Date(end + 'T12:00:00');

        while(curr <= last) {
            dias[curr.toISOString().split('T')[0]] = { vol: 0, somaNotas: 0, qtdNotas: 0 };
            curr.setDate(curr.getDate() + 1);
        }

        // Popula Volume
        prodData.forEach(p => {
            const k = p.data_referencia;
            if(dias[k]) dias[k].vol += p.quantidade;
        });

        // Popula Qualidade (Com regra de Sexta-feira)
        assertData.forEach(a => {
            if(!a.porcentagem_assertividade) return;
            const val = parseFloat(a.porcentagem_assertividade.replace('%','').replace(',','.'));
            
            let dRef = new Date(a.data_referencia + 'T12:00:00');
            if(dRef.getDay() === 6) dRef.setDate(dRef.getDate() - 1);
            if(dRef.getDay() === 0) dRef.setDate(dRef.getDate() - 2);
            
            const k = dRef.toISOString().split('T')[0];
            if(dias[k]) {
                dias[k].somaNotas += val;
                dias[k].qtdNotas++;
            }
        });

        const labels = Object.keys(dias).sort();
        const datasetVol = labels.map(d => dias[d].vol);
        const datasetQual = labels.map(d => dias[d].qtdNotas > 0 ? (dias[d].somaNotas/dias[d].qtdNotas).toFixed(1) : null);
        const labelsFmt = labels.map(d => d.split('-').reverse().slice(0,2).join('/'));

        if(this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labelsFmt,
                datasets: [
                    {
                        label: 'Volume',
                        data: datasetVol,
                        backgroundColor: '#818cf8', // Indigo
                        borderRadius: 4,
                        order: 2,
                        yAxisID: 'yVol'
                    },
                    {
                        label: 'Assertividade',
                        data: datasetQual,
                        type: 'line',
                        borderColor: '#10b981', // Emerald
                        backgroundColor: '#10b981',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#10b981',
                        pointRadius: 4,
                        tension: 0.3,
                        order: 1,
                        yAxisID: 'yQual',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    yVol: { display: false, position: 'right' },
                    yQual: { 
                        display: true, position: 'left', min: 80, max: 105,
                        grid: { borderDash: [4, 4], color: '#f1f5f9' },
                        ticks: { callback: v => v + '%', color: '#64748b', font: { size: 10, weight: 'bold' } }
                    }
                }
            }
        });
    }
};