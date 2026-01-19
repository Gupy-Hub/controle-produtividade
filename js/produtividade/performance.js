// ARQUIVO: js/produtividade/performance.js
window.Produtividade = window.Produtividade || {};

Produtividade.Performance = {
    initialized: false,
    chartQuad: null,
    chartRadar: null,
    dadosCache: [],
    selecionados: [], // IDs dos usuários selecionados para comparação

    init: function() {
        console.log("🧠 Atlas Analytics: Engine V5 (Comparison & Breakdown)");
        this.initialized = true;
    },

    mudarVisao: function(modo) {
        const btnTime = document.getElementById('btn-view-time');
        const btnInd = document.getElementById('btn-view-ind');
        const viewTime = document.getElementById('view-time');
        const viewInd = document.getElementById('view-ind');

        if (modo === 'time') {
            btnTime.className = "px-4 py-1.5 text-xs font-bold rounded shadow-sm bg-white text-indigo-600 transition flex items-center gap-2";
            btnInd.className = "px-4 py-1.5 text-xs font-bold rounded text-slate-500 hover:bg-white hover:shadow-sm transition flex items-center gap-2";
            viewTime.classList.remove('hidden');
            viewInd.classList.add('hidden');
        } else {
            btnInd.className = "px-4 py-1.5 text-xs font-bold rounded shadow-sm bg-white text-indigo-600 transition flex items-center gap-2";
            btnTime.className = "px-4 py-1.5 text-xs font-bold rounded text-slate-500 hover:bg-white hover:shadow-sm transition flex items-center gap-2";
            viewInd.classList.remove('hidden');
            viewTime.classList.add('hidden');
            this.renderizarComparativo(); // Atualiza gráficos ao trocar de aba
        }
    },

    carregar: async function() {
        if(document.getElementById('tab-performance').classList.contains('hidden')) return;
        
        const datas = Produtividade.getDatasFiltro();
        this.selecionados = []; // Reseta seleção ao recarregar

        try {
            const { data, error } = await Sistema.supabase.rpc('get_painel_produtividade', {
                data_inicio: datas.inicio, data_fim: datas.fim
            });
            if (error) throw error;

            // Filtra e enriquece os dados
            this.dadosCache = data
                .filter(u => !['AUDITORA', 'GESTORA'].includes((u.funcao || '').toUpperCase()))
                .filter(u => Number(u.total_qty) > 0 || Number(u.qtd_auditorias) > 0) // Remove fantasmas
                .map(u => {
                    const vol = Number(u.total_qty);
                    const dias = Number(u.total_dias_uteis) || 1;
                    const notas = Number(u.soma_auditorias);
                    const aud = Number(u.qtd_auditorias);
                    const qual = aud > 0 ? (notas / aud) : 0;
                    
                    return {
                        id: u.usuario_id,
                        nome: u.nome.split(' ')[0],
                        vol: vol,
                        qual: qual,
                        speed: Math.round(vol / dias),
                        dias: dias,
                        fifo: Number(u.total_fifo),
                        gt: Number(u.total_gt),
                        gp: Number(u.total_gp),
                        // FIFO Ratio: Quanto do trabalho é FIFO? (Complexidade)
                        fifoPct: vol > 0 ? (Number(u.total_fifo) / vol) * 100 : 0
                    };
                });

            this.renderizarVisaoTime();
            this.renderizarListaSelecao();

        } catch (error) { console.error(error); }
    },

    // --- VISÃO 1: TIME (QUADRANTE) ---

    renderizarVisaoTime: function() {
        const dados = this.dadosCache;
        if(dados.length === 0) return;

        // 1. KPIs de Time
        const totalVol = dados.reduce((acc, c) => acc + c.vol, 0);
        const totalDias = dados.reduce((acc, c) => acc + c.dias, 0);
        const avgSpeed = totalDias > 0 ? Math.round(totalVol / totalDias) : 0;
        
        const avgQual = dados.reduce((acc, c) => acc + c.qual, 0) / dados.length;

        document.getElementById('kpi-team-speed').innerText = avgSpeed;
        document.getElementById('kpi-team-qual').innerText = avgQual.toFixed(2) + '%';

        // 2. Atlas Insight (Análise Automática)
        const elInsight = document.getElementById('atlas-insight');
        if (avgQual < 98) {
            elInsight.innerHTML = `Atenção: A qualidade média do time (${avgQual.toFixed(1)}%) está abaixo da meta. Verifique os assistentes no quadrante inferior direito (Alto Volume, Baixa Qualidade) para ações corretivas.`;
        } else {
            elInsight.innerHTML = `Ótimo trabalho! O time mantém alta qualidade (${avgQual.toFixed(1)}%). O foco agora deve ser elevar a velocidade dos assistentes no quadrante superior esquerdo (Alta Qualidade, Baixo Volume).`;
        }

        // 3. Gráfico de Quadrantes
        const ctx = document.getElementById('chartQuadrant');
        if(!ctx) return;
        
        if (this.chartQuad) this.chartQuad.destroy();

        // Calcular médias para desenhar as linhas centrais
        const mediaVol = totalVol / dados.length;

        this.chartQuad = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: dados.map(u => ({
                    label: u.nome,
                    data: [{ x: u.vol, y: u.qual, r: 6 }], // r fixo para limpeza visual
                    backgroundColor: this.getCorQuadrante(u.vol, u.qual, mediaVol, 98),
                    borderColor: '#fff',
                    borderWidth: 1
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.x.toLocaleString()} docs | ${ctx.raw.y.toFixed(2)}% Assert.`
                        }
                    },
                    annotation: { // Linhas de corte (Média Vol e Meta 98%)
                        annotations: {
                            line1: { type: 'line', yMin: 98, yMax: 98, borderColor: 'rgba(16, 185, 129, 0.5)', borderWidth: 1, borderDash: [5,5], label: { content: 'Meta Qualidade', enabled: true, position: 'end' } },
                            line2: { type: 'line', xMin: mediaVol, xMax: mediaVol, borderColor: 'rgba(99, 102, 241, 0.5)', borderWidth: 1, borderDash: [5,5] }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Volume Total' }, grid: { display: false } },
                    y: { title: { display: true, text: 'Assertividade (%)' }, min: 85, max: 101 }
                }
            }
        });
    },

    getCorQuadrante: function(vol, qual, metaVol, metaQual) {
        if (qual >= metaQual && vol >= metaVol) return '#10b981'; // Emerald (Alta Perf)
        if (qual >= metaQual && vol < metaVol) return '#3b82f6'; // Blue (Qualidade boa, precisa vol)
        if (qual < metaQual && vol >= metaVol) return '#f59e0b'; // Amber (Corre muito, erra muito)
        return '#f43f5e'; // Rose (Crítico)
    },

    // --- VISÃO 2: COMPARATIVO ---

    renderizarListaSelecao: function() {
        const container = document.getElementById('perf-selection-list');
        container.innerHTML = '';

        this.dadosCache.sort((a,b) => b.vol - a.vol).forEach(u => {
            container.innerHTML += `
                <div onclick="Produtividade.Performance.toggleSelecao(${u.id})" 
                     id="sel-card-${u.id}"
                     class="cursor-pointer rounded-lg border border-slate-100 p-2 hover:bg-slate-50 transition flex justify-between items-center group">
                    <div class="flex items-center gap-2">
                        <div id="chk-${u.id}" class="w-4 h-4 rounded border border-slate-300 flex items-center justify-center text-white text-[10px] transition"></div>
                        <span class="text-xs font-bold text-slate-700">${u.nome}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 group-hover:text-indigo-500">Comparar</span>
                </div>
            `;
        });
    },

    toggleSelecao: function(id) {
        const index = this.selecionados.indexOf(id);
        const card = document.getElementById(`sel-card-${id}`);
        const chk = document.getElementById(`chk-${id}`);

        if (index > -1) {
            // Remove
            this.selecionados.splice(index, 1);
            card.classList.remove('bg-indigo-50', 'border-indigo-200');
            chk.classList.remove('bg-indigo-600', 'border-indigo-600');
            chk.innerHTML = '';
        } else {
            // Adiciona (Máximo 3)
            if (this.selecionados.length >= 3) {
                alert("Selecione no máximo 3 assistentes para comparar.");
                return;
            }
            this.selecionados.push(id);
            card.classList.add('bg-indigo-50', 'border-indigo-200');
            chk.classList.add('bg-indigo-600', 'border-indigo-600');
            chk.innerHTML = '<i class="fas fa-check"></i>';
        }
        this.renderizarComparativo();
    },

    renderizarComparativo: function() {
        // Se não tem seleção, mostra o Top 3 por padrão
        let users = [];
        if (this.selecionados.length === 0) {
            users = this.dadosCache.slice(0, 3);
        } else {
            users = this.dadosCache.filter(u => this.selecionados.includes(u.id));
        }

        this.renderizarRadar(users);
        this.renderizarTabelaDetalhe(users);
    },

    renderizarRadar: function(users) {
        const ctx = document.getElementById('chartRadar');
        if(!ctx) return;
        if(this.chartRadar) this.chartRadar.destroy();

        // Normalização de dados para o Radar (Escala 0-100)
        // Precisamos encontrar os máximos do grupo para criar a escala relativa
        const maxVol = Math.max(...this.dadosCache.map(u => u.vol)) || 1;
        const maxSpeed = Math.max(...this.dadosCache.map(u => u.speed)) || 1;
        
        const datasets = users.map((u, i) => {
            const colors = ['rgba(99, 102, 241, 0.5)', 'rgba(16, 185, 129, 0.5)', 'rgba(244, 63, 94, 0.5)'];
            const borders = ['#6366f1', '#10b981', '#f43f5e'];
            
            // Dados normalizados
            const nVol = (u.vol / maxVol) * 100;
            const nQual = u.qual; // Já é %
            const nSpeed = (u.speed / maxSpeed) * 100;
            const nFifo = u.fifoPct; // % de complexidade

            return {
                label: u.nome,
                data: [nVol, nQual, nSpeed, nFifo],
                backgroundColor: colors[i % 3],
                borderColor: borders[i % 3],
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointRadius: 4
            };
        });

        this.chartRadar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Volume', 'Qualidade', 'Velocidade', '% FIFO (Complexidade)'],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: '#f1f5f9' },
                        grid: { color: '#e2e8f0' },
                        pointLabels: { font: { size: 11, weight: 'bold' }, color: '#64748b' },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true } }
                }
            }
        });
    },

    renderizarTabelaDetalhe: function(users) {
        const tbody = document.getElementById('perf-compare-table');
        if(!tbody) return;
        tbody.innerHTML = '';

        users.forEach(u => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-4 py-3 text-center font-mono text-slate-600">${u.vol.toLocaleString()}</td>
                    <td class="px-4 py-3 text-center font-bold ${u.qual >= 98 ? 'text-emerald-600' : 'text-rose-500'}">${u.qual.toFixed(2)}%</td>
                    <td class="px-4 py-3 text-center text-slate-500 border-l border-slate-100">${u.fifo}</td>
                    <td class="px-4 py-3 text-center text-slate-500">${u.gt}</td>
                    <td class="px-4 py-3 text-center text-slate-500">${u.gp}</td>
                </tr>
            `;
        });
    }
};