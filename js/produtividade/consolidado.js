window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,
    chartInstance: null,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Engine V1 (Filtros Inteligentes)...");
        this.renderizarFiltros(); 
        this.carregarDados();
        this.initialized = true;
    },

    renderizarFiltros: function() {
        const selAno = document.getElementById('sel-consolidado-ano');
        const selPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!selAno || !selPeriodo) return;

        const anoAtual = new Date().getFullYear();
        selAno.innerHTML = `
            <option value="${anoAtual}" selected>${anoAtual}</option>
            <option value="${anoAtual - 1}">${anoAtual - 1}</option>
        `;

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
                <option value="1">Janeiro</option>
                <option value="2">Fevereiro</option>
                <option value="3">Março</option>
                <option value="4">Abril</option>
                <option value="5">Maio</option>
                <option value="6">Junho</option>
                <option value="7">Julho</option>
                <option value="8">Agosto</option>
                <option value="9">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
            </optgroup>
        `;

        selAno.onchange = () => this.carregarDados();
        selPeriodo.onchange = () => this.carregarDados();
    },

    getDatasIntervalo: function() {
        // [FIX] Verificação de segurança
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');
        
        // Se os elementos não existem, retorna intervalo padrão seguro (Ano Atual)
        if (!elAno || !elPeriodo) {
            const y = new Date().getFullYear();
            return { inicio: `${y}-01-01`, fim: `${y}-12-31` };
        }

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
        
        const { inicio, fim } = this.getDatasIntervalo();
        console.log(`📡 [CONSOLIDADO] Buscando de ${inicio} até ${fim}`);

        if (container) container.innerHTML = '<div class="flex h-64 items-center justify-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';

        try {
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: inicio, 
                    data_fim: fim 
                });

            if (error) throw error;
            this.processarDados(data);

        } catch (error) {
            console.error(error);
            if (container) container.innerHTML = `<div class="text-center text-rose-500 py-10">Erro: ${error.message}</div>`;
        }
    },

    processarDados: function(data) {
        const assistentes = data.filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));

        let totalProducao = 0;
        let totalDias = 0;
        
        const ranking = assistentes.map(u => {
            totalProducao += Number(u.total_qty);
            totalDias += Number(u.total_dias_uteis);
            
            return {
                nome: u.nome.split(' ')[0], 
                total: Number(u.total_qty),
                meta: Number(u.meta_producao) * Number(u.total_dias_uteis), 
                atingimento: (Number(u.meta_producao) * Number(u.total_dias_uteis)) > 0 
                    ? (Number(u.total_qty) / (Number(u.meta_producao) * Number(u.total_dias_uteis)) * 100) 
                    : 0
            };
        });

        ranking.sort((a,b) => b.total - a.total);

        const elTotal = document.getElementById('kpi-consolidado-total');
        const elMedia = document.getElementById('kpi-consolidado-media');
        
        if(elTotal) elTotal.innerText = totalProducao.toLocaleString('pt-BR');
        if(elMedia) elMedia.innerText = totalDias > 0 ? Math.round(totalProducao / totalDias).toLocaleString('pt-BR') : 0;

        this.renderizarGrafico(ranking);
    },

    renderizarGrafico: function(dados) {
        const container = document.getElementById('grafico-consolidado-container');
        // Recria o Canvas para evitar bugs de redimensionamento do Chart.js
        if(container) {
             container.innerHTML = '<canvas id="grafico-consolidado"></canvas>';
        }

        const ctx = document.getElementById('grafico-consolidado');
        if (!ctx) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const labels = dados.map(d => d.nome);
        const valores = dados.map(d => d.total);
        const metas = dados.map(d => d.meta);
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
                        borderRadius: 4,
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
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR');
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};