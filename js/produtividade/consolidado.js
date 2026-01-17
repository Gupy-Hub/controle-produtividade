window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,
    chartInstance: null,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Engine V2 (KPIs Detalhados)...");
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
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');
        
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

    // Função Auxiliar para contar Dias Úteis (Seg-Sex)
    countDiasUteis: function(inicioStr, fimStr) {
        let count = 0;
        let cur = new Date(inicioStr + 'T12:00:00'); 
        const end = new Date(fimStr + 'T12:00:00');
        
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++; // 0=Dom, 6=Sab
            cur.setDate(cur.getDate() + 1);
        }
        return count > 0 ? count : 1;
    },

    carregar: function() {
        if(!this.initialized) this.init();
        else this.carregarDados();
    },

    carregarDados: async function() {
        const container = document.getElementById('grafico-consolidado-container'); 
        
        const { inicio, fim } = this.getDatasIntervalo();
        const diasUteisPeriodo = this.countDiasUteis(inicio, fim);

        console.log(`📡 [CONSOLIDADO] Buscando de ${inicio} até ${fim}. Dias úteis: ${diasUteisPeriodo}`);

        if (container) container.innerHTML = '<div class="flex h-64 items-center justify-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';

        try {
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: inicio, 
                    data_fim: fim 
                });

            if (error) throw error;
            this.processarDados(data, diasUteisPeriodo);

        } catch (error) {
            console.error(error);
            if (container) container.innerHTML = `<div class="text-center text-rose-500 py-10">Erro: ${error.message}</div>`;
        }
    },

    processarDados: function(data, diasUteisPeriodo) {
        // Filtrar Auditoria/Gestão se necessário
        const assistentes = data.filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));

        // --- Cálculos de KPIs ---
        const totalAssistentes = assistentes.length;
        
        // Somas Totais
        let totalValidados = 0;
        let totalFifo = 0;
        let totalGradualTotal = 0;
        let totalGradualParcial = 0;
        let totalPerfilFc = 0;
        
        const ranking = assistentes.map(u => {
            const prod = Number(u.total_qty || 0);
            
            // Tenta obter os detalhes por tipo. Se a RPC não retornar, assume 0.
            const fifo = Number(u.total_fifo || u.fifo || 0);
            const gradTotal = Number(u.total_gradual_total || u.gradual_total || 0);
            const gradParcial = Number(u.total_gradual_parcial || u.gradual_parcial || 0);
            const perfilFc = Number(u.total_perfil_fc || u.perfil_fc || 0);

            totalValidados += prod;
            totalFifo += fifo;
            totalGradualTotal += gradTotal;
            totalGradualParcial += gradParcial;
            totalPerfilFc += perfilFc;
            
            return {
                nome: u.nome.split(' ')[0], 
                total: prod,
                meta: Number(u.meta_producao) * diasUteisPeriodo, // Meta ajustada aos dias úteis do período
                atingimento: (Number(u.meta_producao) * diasUteisPeriodo) > 0 
                    ? (prod / (Number(u.meta_producao) * diasUteisPeriodo) * 100) 
                    : 0
            };
        });

        // Ordenar ranking para o gráfico
        ranking.sort((a,b) => b.total - a.total);

        // --- Cálculos Médias ---
        // 8. Total validação diária (Dias uteis) = Soma Total / dias uteis
        const validacaoDiariaTime = diasUteisPeriodo > 0 ? (totalValidados / diasUteisPeriodo) : 0;

        // 9. Média validação diária (Todas assistentes) = Soma Total / Total de Assistentes
        // * Interpretação: Média total que cada assistente fez no PERÍODO
        const mediaPeriodoPorAssistente = totalAssistentes > 0 ? (totalValidados / totalAssistentes) : 0;

        // 10. Média validação diária (Por Assistentes) = Soma Total / Total de dias Uteis / Total de Assistentes
        const mediaDiariaPorAssistente = (totalAssistentes > 0 && diasUteisPeriodo > 0) 
            ? (totalValidados / diasUteisPeriodo / totalAssistentes) 
            : 0;

        // --- Renderização no DOM ---
        this.setVal('cons-total-assistentes', totalAssistentes);
        this.setVal('cons-dias-uteis', diasUteisPeriodo);
        this.setVal('cons-total-validados', totalValidados.toLocaleString('pt-BR'));
        
        this.setVal('cons-media-dia-time', Math.round(validacaoDiariaTime).toLocaleString('pt-BR'));
        this.setVal('cons-media-periodo-ind', Math.round(mediaPeriodoPorAssistente).toLocaleString('pt-BR'));
        this.setVal('cons-media-dia-ind', mediaDiariaPorAssistente.toFixed(1).replace('.', ','));

        this.setVal('cons-total-fifo', totalFifo.toLocaleString('pt-BR'));
        this.setVal('cons-total-grad-parcial', totalGradualParcial.toLocaleString('pt-BR'));
        this.setVal('cons-total-grad-total', totalGradualTotal.toLocaleString('pt-BR'));
        this.setVal('cons-total-perfil-fc', totalPerfilFc.toLocaleString('pt-BR'));

        this.renderizarGrafico(ranking);
    },

    setVal: function(id, val) {
        const el = document.getElementById(id);
        if(el) el.innerText = val;
    },

    renderizarGrafico: function(dados) {
        const container = document.getElementById('grafico-consolidado-container');
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