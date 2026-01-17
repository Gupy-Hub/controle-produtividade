// ARQUIVO: js/produtividade/consolidado.js
window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,
    chartInstance: null,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Engine V2 (ChartJS + Filtros Dinâmicos)...");
        
        // Verifica se os elementos existem antes de prosseguir
        const container = document.getElementById('sel-consolidado-ano');
        if (!container) {
            console.warn("⚠️ Elementos do Consolidado não encontrados no DOM. Verifique o HTML.");
            return;
        }

        this.renderizarFiltros(); 
        
        // Pequeno delay para garantir renderização do DOM
        setTimeout(() => this.carregarDados(), 100);
        this.initialized = true;
    },

    renderizarFiltros: function() {
        const selAno = document.getElementById('sel-consolidado-ano');
        const selPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!selAno || !selPeriodo) return;

        // Limpa e popula Anos
        const anoAtual = new Date().getFullYear();
        selAno.innerHTML = `
            <option value="${anoAtual}" selected>${anoAtual}</option>
            <option value="${anoAtual - 1}">${anoAtual - 1}</option>
        `;

        // Limpa e popula Períodos
        selPeriodo.innerHTML = `
            <option value="anual" class="font-bold">📅 Ano Completo</option>
            <optgroup label="Semestres">
                <option value="s1">1º Semestre (Jan-Jun)</option>
                <option value="s2">2º Semestre (Jul-Dez)</option>
            </optgroup>
            <optgroup label="Trimestres">
                <option value="t1">1º Trimestre (Jan-Mar)</option>
                <option value="t2">2º Trimestre (Abr-Jun)</option>
                <option value="t3">3º Trimestre (Jul-Set)</option>
                <option value="t4">4º Trimestre (Out-Dez)</option>
            </optgroup>
            <optgroup label="Meses">
                <option value="1">Janeiro</option><option value="2">Fevereiro</option><option value="3">Março</option>
                <option value="4">Abril</option><option value="5">Maio</option><option value="6">Junho</option>
                <option value="7">Julho</option><option value="8">Agosto</option><option value="9">Setembro</option>
                <option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
            </optgroup>
        `;

        selAno.onchange = () => this.carregarDados();
        selPeriodo.onchange = () => this.carregarDados();
    },

    getDatasIntervalo: function() {
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');

        // Fallback de segurança se os elementos sumirem
        if (!elAno || !elPeriodo) return { inicio: null, fim: null };

        const ano = elAno.value;
        const periodo = elPeriodo.value;

        let inicio = `${ano}-01-01`;
        let fim = `${ano}-12-31`;

        switch (periodo) {
            case 'anual': break;
            case 's1': inicio = `${ano}-01-01`; fim = `${ano}-06-30`; break;
            case 's2': inicio = `${ano}-07-01`; fim = `${ano}-12-31`; break;
            case 't1': inicio = `${ano}-01-01`; fim = `${ano}-03-31`; break;
            case 't2': inicio = `${ano}-04-01`; fim = `${ano}-06-30`; break;
            case 't3': inicio = `${ano}-07-01`; fim = `${ano}-09-30`; break;
            case 't4': inicio = `${ano}-10-01`; fim = `${ano}-12-31`; break;
            default:
                const mes = parseInt(periodo);
                if (mes >= 1 && mes <= 12) {
                    const lastDay = new Date(ano, mes, 0).getDate();
                    inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
                    fim = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
                }
                break;
        }

        return { inicio, fim };
    },

    carregarDados: async function() {
        const container = document.getElementById('grafico-consolidado-container');
        const kpiTotal = document.getElementById('kpi-consolidado-total');
        const kpiMedia = document.getElementById('kpi-consolidado-media');
        
        const { inicio, fim } = this.getDatasIntervalo();
        if (!inicio) return; // Aborta se erro no getDatas

        console.log(`📡 [CONSOLIDADO] Buscando de ${inicio} até ${fim}`);

        // Feedback de Carregamento (Sem destruir o container permanentemente)
        if (container) {
            // Se já tem canvas, destrói o chart antes de limpar
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
            container.innerHTML = '<div class="flex h-full items-center justify-center text-blue-500 gap-2"><i class="fas fa-circle-notch fa-spin text-2xl"></i> <span class="font-bold text-sm">Processando dados...</span></div>';
        }

        try {
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: inicio, 
                    data_fim: fim 
                });

            if (error) throw error;

            console.log(`✅ Dados recebidos: ${data.length} linhas`);
            this.processarDados(data);

        } catch (error) {
            console.error(error);
            if (container) container.innerHTML = `<div class="text-center text-rose-500 py-10 flex flex-col items-center"><i class="fas fa-exclamation-triangle text-3xl mb-2"></i><span>Erro: ${error.message}</span></div>`;
        }
    },

    processarDados: function(data) {
        // Filtra gestores fora da análise
        const assistentes = data.filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));

        let totalProducao = 0;
        let totalDias = 0;
        
        const ranking = assistentes.map(u => {
            const qty = Number(u.total_qty);
            const dias = Number(u.total_dias_uteis); // Usando dias fatorados
            
            totalProducao += qty;
            totalDias += dias;
            
            const metaTotal = Number(u.meta_producao) * dias;
            
            return {
                nome: u.nome.split(' ')[0], 
                total: qty,
                meta: metaTotal, 
                atingimento: metaTotal > 0 ? (qty / metaTotal * 100) : 0
            };
        });

        ranking.sort((a,b) => b.total - a.total);

        // Atualiza KPIs
        if(document.getElementById('kpi-consolidado-total')) 
            document.getElementById('kpi-consolidado-total').innerText = totalProducao.toLocaleString('pt-BR');
        
        if(document.getElementById('kpi-consolidado-media')) 
            document.getElementById('kpi-consolidado-media').innerText = totalDias > 0 ? Math.round(totalProducao / totalDias).toLocaleString('pt-BR') : 0;

        this.renderizarGrafico(ranking);
    },

    renderizarGrafico: function(dados) {
        const container = document.getElementById('grafico-consolidado-container');
        if (!container) return;

        // 1. Restaura o elemento Canvas (pois o loading removeu ele)
        container.innerHTML = '<canvas id="grafico-consolidado"></canvas>';
        const ctx = document.getElementById('grafico-consolidado');

        if (dados.length === 0) {
            container.innerHTML = '<div class="flex h-full items-center justify-center text-slate-400 italic">Nenhum dado encontrado neste período.</div>';
            return;
        }

        const labels = dados.map(d => d.nome);
        const valores = dados.map(d => d.total);
        const metas = dados.map(d => d.meta);
        // Cores Dinâmicas: Verde se bateu meta, Vermelho se não
        const cores = dados.map(d => d.atingimento >= 100 ? '#10b981' : '#f43f5e');

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Produção Real',
                        data: valores,
                        backgroundColor: cores,
                        borderRadius: 6,
                        barPercentage: 0.6,
                        order: 2
                    },
                    {
                        label: 'Meta Esperada',
                        data: metas,
                        type: 'line',
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        order: 1,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { usePointStyle: true } },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) { label += context.parsed.y.toLocaleString('pt-BR'); }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { font: { size: 10, weight: 'bold' } }
                    }
                }
            }
        });
    }
};