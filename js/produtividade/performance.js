// ARQUIVO: js/produtividade/performance.js
window.Produtividade = window.Produtividade || {};

Produtividade.Performance = {
    initialized: false,
    chartProd: null,
    chartQual: null,
    dadosCache: [],

    init: function() {
        console.log("📊 Performance: Dashboard Simplificado (Vol vs Qual)");
        this.initialized = true;
    },

    carregar: async function() {
        if(document.getElementById('tab-performance').classList.contains('hidden')) return;

        const datas = Produtividade.getDatasFiltro();
        const usuarioId = Produtividade.Geral.usuarioSelecionado;
        const nomeUsuario = document.getElementById('selected-name')?.textContent;

        this.atualizarHeaderUI(usuarioId, nomeUsuario);

        try {
            // 1. Busca Dados Gerais (Para Tabela e KPIs)
            const { data, error } = await Sistema.supabase.rpc('get_painel_produtividade', {
                data_inicio: datas.inicio, data_fim: datas.fim
            });

            if (error) throw error;

            // Filtra e prepara
            this.dadosCache = data.map(u => ({
                id: u.usuario_id,
                nome: u.nome,
                funcao: (u.funcao || '').toUpperCase(),
                vol: Number(u.total_qty),
                notas: Number(u.soma_auditorias),
                aud: Number(u.qtd_auditorias),
                qual: Number(u.qtd_auditorias) > 0 ? (Number(u.soma_auditorias) / Number(u.qtd_auditorias)) : 0
            })).filter(u => u.vol > 0 || u.aud > 0); // Remove vazios

            // 2. Define o Foco (Geral ou Individual)
            const dadosFoco = usuarioId 
                ? this.dadosCache.filter(u => u.id == usuarioId)
                : this.dadosCache.filter(u => !['AUDITORA', 'GESTORA'].includes(u.funcao));

            // 3. Renderiza Tabela e KPIs
            this.renderizarTabela(this.dadosCache, usuarioId);

            // 4. Renderiza Gráficos (Busca dados diários para tendências)
            await this.buscarDadosGraficos(datas, usuarioId, dadosFoco);

        } catch (error) { console.error("Erro Perf:", error); }
    },

    atualizarHeaderUI: function(uid, nome) {
        const chip = document.getElementById('perf-filter-chip');
        const txt = document.getElementById('perf-filter-name');
        
        if(uid) {
            chip.classList.remove('hidden');
            chip.classList.add('flex');
            txt.innerText = nome;
            
            document.getElementById('title-chart-qual').innerText = "Evolução da Qualidade";
            document.getElementById('subtitle-chart-qual').innerText = "Histórico diário de assertividade";
        } else {
            chip.classList.add('hidden');
            chip.classList.remove('flex');

            document.getElementById('title-chart-qual').innerText = "Top 5 - Menor Assertividade";
            document.getElementById('subtitle-chart-qual').innerText = "Quem precisa de monitoria/atenção";
        }
    },

    buscarDadosGraficos: async function(datas, usuarioId, dadosFoco) {
        // --- GRÁFICO 1: TENDÊNCIA DE VOLUME (DIÁRIO) ---
        // Busca Produção Diária
        let queryProd = Sistema.supabase.from('producao')
            .select('data_referencia, quantidade, usuario_id')
            .gte('data_referencia', datas.inicio)
            .lte('data_referencia', datas.fim);
        
        if (usuarioId) queryProd = queryProd.eq('usuario_id', usuarioId);
        
        const { data: prodData } = await queryProd;

        // Agrupa por dia
        const diasVol = {};
        if (prodData) {
            prodData.forEach(p => {
                const dia = p.data_referencia;
                diasVol[dia] = (diasVol[dia] || 0) + p.quantidade;
            });
        }
        
        this.renderizarGraficoVolume(diasVol);

        // --- GRÁFICO 2: QUALIDADE (RANKING ou EVOLUÇÃO) ---
        if (usuarioId) {
            // Modo Individual: Evolução Diária de Qualidade
            await this.renderizarEvolucaoQualidade(datas, usuarioId);
        } else {
            // Modo Geral: Ranking de Ofensores
            this.renderizarRankingQualidade(dadosFoco);
        }
    },

    renderizarGraficoVolume: function(diasMap) {
        const labels = Object.keys(diasMap).sort();
        const data = labels.map(d => diasMap[d]);
        const labelsFmt = labels.map(d => d.split('-').reverse().slice(0,2).join('/'));
        
        const total = data.reduce((a,b) => a+b, 0);
        document.getElementById('kpi-total-vol').innerText = total.toLocaleString('pt-BR');

        const ctx = document.getElementById('chartProdTrend');
        if(!ctx) return;
        if(this.chartProd) this.chartProd.destroy();

        this.chartProd = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labelsFmt,
                datasets: [{
                    label: 'Volume Diário',
                    data: data,
                    backgroundColor: '#60a5fa', // Blue
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { borderDash: [5, 5] } }
                }
            }
        });
    },

    renderizarRankingQualidade: function(dados) {
        // Filtra quem tem auditoria e ordena pelos PIORES
        const ranking = dados
            .filter(d => d.aud > 0)
            .sort((a,b) => a.qual - b.qual) // Menor para maior
            .slice(0, 5);

        // Média Geral KPI
        const somaTotal = dados.reduce((a,b) => a + b.notas, 0);
        const qtdTotal = dados.reduce((a,b) => a + b.aud, 0);
        const mediaGeral = qtdTotal > 0 ? (somaTotal/qtdTotal) : 0;
        document.getElementById('kpi-total-qual').innerText = mediaGeral.toFixed(2) + '%';

        const ctx = document.getElementById('chartQualRanking');
        if(!ctx) return;
        if(this.chartQual) this.chartQual.destroy();

        const labels = ranking.map(d => d.nome.split(' ')[0]);
        const values = ranking.map(d => d.qual);
        const colors = values.map(v => v >= 98 ? '#10b981' : (v >= 95 ? '#f59e0b' : '#f43f5e'));

        this.chartQual = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Assertividade (%)',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 4,
                    barThickness: 20
                }]
            },
            options: {
                indexAxis: 'y', 
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { min: 80, max: 100, grid: { display: false } },
                    y: { grid: { display: false } }
                }
            }
        });
    },

    renderizarEvolucaoQualidade: async function(datas, uid) {
        const { data } = await Sistema.supabase
            .from('assertividade')
            .select('data_referencia, porcentagem_assertividade')
            .eq('usuario_id', uid)
            .gte('data_referencia', datas.inicio)
            .lte('data_referencia', datas.fim)
            .order('data_referencia');

        const dias = {};
        if (data) {
            data.forEach(d => {
                if(!d.porcentagem_assertividade) return;
                const val = parseFloat(d.porcentagem_assertividade.replace('%','').replace(',','.'));
                dias[d.data_referencia] = val; 
            });
        }

        const values = Object.values(dias);
        const avg = values.length > 0 ? values.reduce((a,b)=>a+b,0)/values.length : 0;
        document.getElementById('kpi-total-qual').innerText = avg.toFixed(2) + '%';

        const ctx = document.getElementById('chartQualRanking');
        if(this.chartQual) this.chartQual.destroy();

        this.chartQual = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(dias).map(d => d.split('-').reverse().slice(0,2).join('/')),
                datasets: [{
                    label: 'Assertividade',
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 80, max: 105 } }
            }
        });
    },

    renderizarTabela: function(dados, filtroId) {
        const tbody = document.getElementById('perf-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        const lista = dados.sort((a,b) => b.vol - a.vol);

        lista.forEach(u => {
            const isSelected = u.id == filtroId;
            const bgClass = isSelected ? 'bg-indigo-50 font-bold' : 'hover:bg-slate-50 cursor-pointer';
            const statusColor = u.qual >= 98 ? 'bg-emerald-100 text-emerald-700' : (u.qual >= 95 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700');
            const statusText = u.qual >= 98 ? 'Excelente' : (u.qual >= 95 ? 'Atenção' : 'Crítico');

            tbody.innerHTML += `
                <tr onclick="Produtividade.Geral.filtrarUsuario('${u.id}', '${u.nome}')" class="${bgClass} transition border-b border-slate-100 group">
                    <td class="px-6 py-3 text-slate-700 group-hover:text-indigo-600 transition">${u.nome}</td>
                    <td class="px-6 py-3 text-center font-mono text-slate-500">${u.vol.toLocaleString()}</td>
                    <td class="px-6 py-3 text-center font-bold ${u.qual >= 98 ? 'text-emerald-600' : 'text-rose-500'}">${u.qual.toFixed(2)}%</td>
                    <td class="px-6 py-3 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor}">${statusText}</span>
                    </td>
                </tr>
            `;
        });
    }
};