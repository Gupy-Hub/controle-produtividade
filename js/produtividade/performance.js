// ARQUIVO: js/produtividade/performance.js
window.Produtividade = window.Produtividade || {};

Produtividade.Performance = {
    initialized: false,
    chart: null,

    init: function() {
        console.log("🏎️ Performance: Módulo Iniciado (Estilo Minha Área)");
        this.initialized = true;
        // Não carrega automaticamente aqui, espera o Produtividade.atualizarTodasAbas()
    },

    carregar: async function() {
        // Se a aba não estiver visível, não carrega para economizar recurso
        if(document.getElementById('tab-performance').classList.contains('hidden')) return;

        console.log("🏎️ Performance: Carregando dados...");
        const datas = Produtividade.getDatasFiltro();
        
        // Verifica filtro de usuário
        const usuarioId = Produtividade.Geral.usuarioSelecionado;
        const nomeUsuario = document.getElementById('selected-name')?.textContent;

        this.atualizarHeader(usuarioId, nomeUsuario);

        try {
            // BUSCA DADOS BRUTOS DA ASSERTIVIDADE
            // Precisamos dos dados dia a dia para montar o gráfico
            let query = Sistema.supabase
                .from('assertividade')
                .select('data_referencia, usuario_id, porcentagem_assertividade')
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim);
            
            // Se tiver usuário filtrado, adiciona WHERE
            if (usuarioId) {
                query = query.eq('usuario_id', usuarioId);
            }

            const { data, error } = await query;

            if (error) throw error;

            this.processarDados(data, datas.inicio, datas.fim);

        } catch (error) {
            console.error("Erro Performance:", error);
            alert("Erro ao carregar performance: " + error.message);
        }
    },

    atualizarHeader: function(uid, nome) {
        const badge = document.getElementById('perf-badge-filtro');
        const span = document.getElementById('perf-nome-filtro');
        
        if (uid && nome) {
            badge.classList.remove('hidden');
            span.innerText = nome;
        } else {
            badge.classList.add('hidden');
        }
    },

    processarDados: function(registros, dataInicio, dataFim) {
        // Mapa para agrupar por data: { '2025-12-01': { soma: 3400, qtd: 37 }, ... }
        const mapaDias = {};

        // Inicializa o mapa com todas as datas do período (para o gráfico não ficar buraco)
        let curr = new Date(dataInicio + 'T12:00:00');
        const end = new Date(dataFim + 'T12:00:00');
        
        while (curr <= end) {
            const isoDate = curr.toISOString().split('T')[0];
            mapaDias[isoDate] = { soma: 0, qtd: 0 };
            curr.setDate(curr.getDate() + 1);
        }

        // Acumuladores Gerais
        let totalSoma = 0;
        let totalQtd = 0;

        // Processa os registros
        registros.forEach(reg => {
            if (!reg.porcentagem_assertividade) return;

            // Converter "100,00%" -> 100.00
            const valorNum = parseFloat(reg.porcentagem_assertividade.replace('%', '').replace(',', '.'));
            
            // Regra Fim de Semana (Igual ao Geral.js)
            // Se for Sábado/Domingo, joga para a Sexta anterior (ou data válida anterior)
            let dataRef = new Date(reg.data_referencia + 'T12:00:00');
            const diaSemana = dataRef.getDay(); // 0=Dom, 6=Sab
            
            if (diaSemana === 6) dataRef.setDate(dataRef.getDate() - 1); // Sábado -> Sexta
            if (diaSemana === 0) dataRef.setDate(dataRef.getDate() - 2); // Domingo -> Sexta
            
            const dataKey = dataRef.toISOString().split('T')[0];

            // Só computa se a data calculada estiver no range (mapaDias já tem as keys)
            if (mapaDias[dataKey]) {
                mapaDias[dataKey].soma += valorNum;
                mapaDias[dataKey].qtd += 1; // Cada linha é 1 auditoria

                // Para os totais gerais, conta tudo
                totalSoma += valorNum;
                totalQtd += 1;
            }
        });

        // Prepara Arrays para o Gráfico
        const labels = Object.keys(mapaDias).sort();
        const dadosVolume = [];
        const dadosMedia = [];

        labels.forEach(dia => {
            const d = mapaDias[dia];
            const mediaDia = d.qtd > 0 ? (d.soma / d.qtd) : null; // Null para não desenhar ponto zero
            
            dadosVolume.push(d.qtd);
            dadosMedia.push(mediaDia ? mediaDia.toFixed(2) : null);
        });

        // Renderiza
        this.renderizarKPIs(totalSoma, totalQtd);
        this.renderizarGrafico(labels, dadosVolume, dadosMedia);
    },

    renderizarKPIs: function(soma, qtd) {
        // 1. Média
        const media = qtd > 0 ? (soma / qtd) : 0;
        const elMedia = document.getElementById('perf-kpi-media');
        const elBar = document.getElementById('perf-bar-media');
        
        if(elMedia) elMedia.innerText = media.toFixed(2).replace('.', ',') + '%';
        if(elBar) elBar.style.width = Math.min(media, 100) + '%';

        // 2. Volume
        const elVol = document.getElementById('perf-kpi-volume');
        if(elVol) elVol.innerText = qtd.toLocaleString('pt-BR');

        // 3. Status
        const elStatus = document.getElementById('perf-badge-status');
        const elDesc = document.getElementById('perf-status-desc');
        const meta = 98.0;

        if (qtd === 0) {
            elStatus.className = "px-3 py-1 rounded-lg text-sm font-bold bg-slate-100 text-slate-500";
            elStatus.innerText = "Sem Dados";
            elDesc.innerText = "Aguardando auditorias...";
        } else if (media >= meta) {
            elStatus.className = "px-3 py-1 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-700 border border-emerald-200";
            elStatus.innerText = "Meta Atingida! 🏆";
            elDesc.innerText = `Parabéns! Acima de ${meta}%`;
        } else {
            const gap = (meta - media).toFixed(2);
            elStatus.className = "px-3 py-1 rounded-lg text-sm font-bold bg-rose-100 text-rose-700 border border-rose-200";
            elStatus.innerText = "Abaixo da Meta";
            elDesc.innerText = `Faltam ${gap}% para ${meta}%`;
        }
    },

    renderizarGrafico: function(labels, volume, media) {
        const ctx = document.getElementById('chartPerformance');
        if (!ctx) return;

        // Formatar datas para exibir "01/12"
        const labelsFormatados = labels.map(d => d.split('-').reverse().slice(0, 2).join('/'));

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labelsFormatados,
                datasets: [
                    {
                        label: 'Volume Auditado',
                        data: volume,
                        backgroundColor: '#bfdbfe', // blue-200
                        hoverBackgroundColor: '#60a5fa', // blue-400
                        borderRadius: 4,
                        order: 2,
                        yAxisID: 'yVolume'
                    },
                    {
                        label: 'Assertividade (%)',
                        data: media,
                        type: 'line',
                        borderColor: '#10b981', // emerald-500
                        backgroundColor: '#10b981',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#10b981',
                        pointBorderWidth: 2,
                        tension: 0.3, // Curva suave
                        order: 1,
                        yAxisID: 'yPercent',
                        spanGaps: true // Pula dias sem dados sem quebrar a linha
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false }, // Legenda customizada no HTML
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1e293b',
                        bodyColor: '#475569',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        titleFont: { size: 13, weight: 'bold' },
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    if (context.dataset.type === 'line') {
                                        return label + context.parsed.y.toFixed(2) + '%';
                                    }
                                    return label + context.parsed.y;
                                }
                                return null;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#94a3b8' }
                    },
                    yVolume: {
                        type: 'linear',
                        display: false, // Esconde eixo de volume para ficar mais limpo
                        position: 'right',
                        grid: { display: false }
                    },
                    yPercent: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: 80, // Foca o gráfico entre 80% e 100% para ver detalhes
                        max: 105,
                        grid: { color: '#f1f5f9', borderDash: [5, 5] },
                        ticks: { 
                            callback: function(value) { return value + '%' },
                            color: '#64748b',
                            font: { weight: 'bold' }
                        }
                    }
                }
            }
        });
    }
};