// js/minha_area/comparativo.js

// ====================================================================
// MAPEAMENTO DE NOMES AMIGÁVEIS (UX)
// ====================================================================
// Traduz os códigos técnicos do banco para termos fáceis para as assistentes.
// Usado principalmente no gráfico de ofensores.
const FRIENDLY_NAMES_MAP = {
    'DOC_NDF_100%': 'Empresas 100%',
    'DOC_NDF_CATEGORIA PROFISSIONAL': 'Categoria DIP',
    'DOC_NDF_DEPENDENTE': 'Categoria Dependentes',
    'DOC_NDF_ESTADO CIVIL': 'Categoria Certidão',
    'DOC_NDF_ESTRANGEIRO': 'Categoria Estrangeiro',
    'DOC_NDF_LAUDO': 'Categoria Laudo',
    'DOC_NDF_OUTROS': 'Empresa deveria Validar'
    // Se aparecer um novo código não listado aqui, o sistema usará o código original como fallback.
};


MinhaArea.Comparativo = {
    myChart: null,
    dadosProcessados: null,
    visaoAtual: 'doc', // 'doc', 'empresa', 'ndf'
    mostrarTodos: false,
    filtroBusca: '',

    init: function() {
        // Inicializa listeners se necessário
    },

    atualizar: async function() {
        // O carregamento e processamento dos dados agora é feito pelo pai (MinhaArea.js)
        // e passado via 'window.DadosGlobais.dadosBrutos'
        if (!window.DadosGlobais || !window.DadosGlobais.dadosBrutos) {
            console.warn("[Comparativo] Sem dados brutos disponíveis.");
            this.renderizarEstadoVazio();
            return;
        }
        
        try {
            this.processarDadosComparativo(window.DadosGlobais.dadosBrutos);
            this.atualizarInterface();
        } catch (error) {
            console.error("[Comparativo] Erro ao processar dados:", error);
            Sistema.Notificacao.mostrar("Erro ao processar dados do comparativo.", "erro");
        }
    },

    processarDadosComparativo: function(dados) {
        // Reseta contadores
        const stats = {
            totalGeralNokNdf: 0, // Total Geral (NOK + NDF)
            totalNokGupy: 0,     // Erros Doc. Gupy (Apenas NOK)
            totalNdfGeral: 0,    // Erros NDF (Total de NDFs)
            totalNdfAuditados: 0 // Erros Empresa (NDFs que já passaram por auditoria humana)
        };

        const ofensoresMap = new Map();
        const feedErros = [];

        dados.forEach(row => {
            const status = row.audit_status;
            const obs = row.audit_obs || '';
            // Normaliza o ofensor: se for nulo, undefined ou string vazia, define como "Não Identificado"
            const ofensor = (row.audit_ofensor && row.audit_ofensor.trim() !== '') 
                ? row.audit_ofensor.trim() 
                : 'Não Identificado';
            
            const isNDF = status === 'NDF';
            const isNOK = status === 'NOK';

            // 1. Contagem dos Cards Superiores (Lógica de Negócio)
            if (isNOK || isNDF) {
                stats.totalGeralNokNdf++; // Soma tudo que não é OK
            }

            if (isNOK) {
                stats.totalNokGupy++; // Apenas NOKs são "Erros Gupy"
            }

            if (isNDF) {
                stats.totalNdfGeral++; // Total de NDFs
                // Se tem observação de auditoria, consideramos "Auditado/Empresa"
                if (obs.trim().length > 0) {
                    stats.totalNdfAuditados++;
                }
            }

            // 2. Dados para o Gráfico (Top Ofensores) e Feed
            if (isNOK || isNDF) {
                 // Agrupamento para o gráfico (usando o nome técnico original)
                if (ofensoresMap.has(ofensor)) {
                    ofensoresMap.set(ofensor, ofensoresMap.get(ofensor) + 1);
                } else {
                    ofensoresMap.set(ofensor, 1);
                }

                // Popula feed de erros
                feedErros.push({
                    data: row.data_referencia,
                    status: status,
                    ofensor: ofensor, // Nome técnico mantido no objeto de dados
                    obs: obs,
                    colaborador: row.colaborador_nome // Importante para a busca
                });
            }
        });

        // Converte mapa em array e ordena
        let topOfensores = Array.from(ofensoresMap, ([ofensor, quantidade]) => ({ ofensor, quantidade }))
            .sort((a, b) => b.quantidade - a.quantidade);

        // Ordena feed por data (mais recente primeiro)
        feedErros.sort((a, b) => new Date(b.data.split('/').reverse().join('-')) - new Date(a.data.split('/').reverse().join('-')));

        this.dadosProcessados = {
            stats,
            topOfensores,
            feedErros
        };
    },

    atualizarInterface: function() {
        if (!this.dadosProcessados) return;

        // Atualiza Cards
        const stats = this.dadosProcessados.stats;
        document.getElementById('total-nok-detalhe').textContent = stats.totalGeralNokNdf;
        document.getElementById('total-nok-gupy').textContent = stats.totalNokGupy;
        document.getElementById('total-ndf-detalhe').textContent = stats.totalNdfGeral;
        document.getElementById('total-ndf-auditados').textContent = stats.totalNdfAuditados;

        // Atualiza Gráfico e Feed com base nos filtros atuais
        this.aplicarFiltrosVisuais();
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        // Atualiza estado dos botões
        ['btn-view-doc', 'btn-view-empresa', 'btn-view-ndf'].forEach(id => {
            const btn = document.getElementById(id);
            btn.classList.remove('bg-white', 'text-rose-600', 'shadow-sm');
            btn.classList.add('text-slate-500', 'hover:bg-white');
        });

        const activeBtn = document.getElementById(`btn-view-${novaVisao}`);
        activeBtn.classList.remove('text-slate-500', 'hover:bg-white');
        activeBtn.classList.add('bg-white', 'text-rose-600', 'shadow-sm');

        // Re-renderiza o gráfico com a nova visão
        this.aplicarFiltrosVisuais();
    },

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        btn.textContent = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        this.aplicarFiltrosVisuais();
    },

    filtrarPorBusca: function(termo) {
        this.filtroBusca = termo.toLowerCase().trim();
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        if (this.filtroBusca.length > 0) {
            btnLimpar.classList.remove('hidden');
        } else {
            btnLimpar.classList.add('hidden');
        }
        this.aplicarFiltrosVisuais();
    },

    limparFiltro: function() {
        this.filtroBusca = '';
        document.querySelector('#feed-erros-container input').value = '';
        document.getElementById('btn-limpar-filtro').classList.add('hidden');
        this.aplicarFiltrosVisuais();
    },

    aplicarFiltrosVisuais: function() {
        if (!this.dadosProcessados) return;

        // 1. Filtra e Renderiza o Gráfico
        let dadosGrafico = [...this.dadosProcessados.topOfensores];

        // Filtro por Visão (Doc, Empresa, NDF)
        // NOTA: Esta lógica de filtro é um placeholder. Idealmente, os dados brutos
        // deveriam ter uma coluna indicando o "tipo" do ofensor para filtrar corretamente.
        // Por enquanto, vamos assumir uma filtragem simples baseada em strings comuns.
        if (this.visaoAtual === 'empresa') {
            dadosGrafico = dadosGrafico.filter(item => item.ofensor.toUpperCase().includes('EMPRESA'));
        } else if (this.visaoAtual === 'ndf') {
            dadosGrafico = dadosGrafico.filter(item => item.ofensor.toUpperCase().includes('NDF'));
        } 
        // 'doc' mostra tudo (default) ou implementa lógica específica se houver

        // Filtro de Quantidade (Top 5 vs Todos)
        if (!this.mostrarTodos) {
            dadosGrafico = dadosGrafico.slice(0, 5);
        }

        this.renderizarGraficoTopOfensores(dadosGrafico);

        // 2. Filtra e Renderiza o Feed
        let dadosFeed = [...this.dadosProcessados.feedErros];

        // Filtro de Busca (no feed)
        if (this.filtroBusca.length > 0) {
            dadosFeed = dadosFeed.filter(item => {
                // Aplica o mapa de nomes amigáveis também na busca do feed para consistência
                const nomeAmigavelOfensor = FRIENDLY_NAMES_MAP[item.ofensor] || item.ofensor;
                
                return (item.ofensor && item.ofensor.toLowerCase().includes(this.filtroBusca)) ||
                       (nomeAmigavelOfensor && nomeAmigavelOfensor.toLowerCase().includes(this.filtroBusca)) ||
                       (item.obs && item.obs.toLowerCase().includes(this.filtroBusca)) ||
                       (item.colaborador && item.colaborador.toLowerCase().includes(this.filtroBusca)) ||
                       (item.data && item.data.includes(this.filtroBusca));
            });
        }

        this.renderizarFeedErros(dadosFeed);
    },

    renderizarGraficoTopOfensores: function(data) {
        const ctx = document.getElementById('graficoTopOfensores').getContext('2d');

        if (this.myChart) {
            this.myChart.destroy();
        }

        if (data.length === 0) {
            // Tratar caso sem dados no gráfico se necessário
            return;
        }

        // =================================================================
        // APLICAÇÃO DO MAPEAMENTO DE NOMES AMIGÁVEIS
        // =================================================================
        // Aqui interceptamos o nome técnico (item.ofensor) e verificamos se
        // existe uma tradução no nosso mapa FRIENDLY_NAMES_MAP.
        const labels = data.map(item => {
            // Tenta pegar o nome amigável, se não existir, usa o técnico original (fallback seguro)
            return FRIENDLY_NAMES_MAP[item.ofensor] || item.ofensor;
        });
        
        const values = data.map(item => item.quantidade);

        this.myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade',
                    data: values,
                    backgroundColor: data.map(item => item.ofensor.toUpperCase().includes('NDF') ? '#f59e0b' : '#e11d48'), // Amber para NDF, Rose para outros
                    borderRadius: 6,
                    barThickness: 'flex',
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Gráfico de barras horizontais
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            display: false, // Remove grade vertical
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'Nunito', sans-serif",
                                size: 10
                            },
                             color: '#94a3b8'
                        }
                    },
                    y: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'Nunito', sans-serif",
                                size: 11,
                                weight: '600'
                            },
                            color: '#475569',
                            // Lógica para truncar labels muito longas se necessário
                            callback: function(value) {
                                const label = this.getLabelForValue(value);
                                if (label.length > 25) {
                                    return label.substr(0, 25) + '...';
                                }
                                return label;
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // Oculta legenda padrão
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        titleFont: { family: "'Nunito', sans-serif", size: 12 },
                        bodyFont: { family: "'Nunito', sans-serif", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false, // Remove caixinha de cor no tooltip
                        callbacks: {
                            // Garante que o tooltip mostre o nome completo (amigável ou não)
                            title: function(context) {
                                return context[0].label;
                            }
                        }
                    }
                },
                onClick: (e) => {
                    // Lógica futura para clicar na barra e filtrar o feed
                    // const points = this.myChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    // if (points.length) {
                    //     const firstPoint = points[0];
                    //     const label = this.myChart.data.labels[firstPoint.index];
                    //     this.filtrarPorBusca(label); // Exemplo
                    // }
                }
            }
        });
    },

    renderizarFeedErros: function(data) {
        const container = document.getElementById('feed-erros-container');
        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fas fa-check-circle text-4xl mb-2 text-emerald-200"></i><br>
                    Nenhum registro de atenção encontrado para os filtros atuais.
                </div>`;
            return;
        }

        data.forEach(item => {
            const isNDF = item.status === 'NDF';
            const themeColor = isNDF ? 'amber' : 'rose';
            const icon = isNDF ? 'fa-file-contract' : 'fa-times-circle';
            
            // Também aplicamos o nome amigável no feed para consistência visual
            const nomeOfensorAmigavel = FRIENDLY_NAMES_MAP[item.ofensor] || item.ofensor;

            const card = document.createElement('div');
            card.className = `bg-white p-3 rounded-lg border border-${themeColor}-100 shadow-sm flex gap-3 hover:shadow-md transition items-start`;
            card.innerHTML = `
                <div class="mt-1">
                    <div class="w-8 h-8 rounded-full bg-${themeColor}-50 flex items-center justify-center text-${themeColor}-500">
                        <i class="fas ${icon}"></i>
                    </div>
                </div>
                <div class="flex-1 overflow-hidden">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="text-sm font-bold text-slate-700 truncate" title="${nomeOfensorAmigavel}">${nomeOfensorAmigavel}</h4>
                        <span class="text-[10px] font-bold text-${themeColor}-600 bg-${themeColor}-50 px-1.5 rounded whitespace-nowrap">${item.status}</span>
                    </div>
                    <p class="text-xs text-slate-500 line-clamp-2 mb-2" title="${item.obs}">${item.obs || '<span class="italic text-slate-400">Sem observação.</span>'}</p>
                    <div class="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span class="truncate pr-2"><i class="far fa-user mr-1"></i>${item.colaborador || 'N/D'}</span>
                        <span class="whitespace-nowrap"><i class="far fa-calendar-alt mr-1"></i>${item.data}</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    },

    renderizarEstadoVazio: function() {
        // Implementar estado visual se não houver dados globais
    }
};