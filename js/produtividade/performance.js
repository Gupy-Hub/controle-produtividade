import { Sistema } from '../sistema.js';
import { Filtros } from './filtros.js';

export const Performance = {
    charts: {}, // Armazena instâncias dos gráficos para destruição correta

    init: async () => {
        console.log('Performance: Init');
        await Performance.render();
    },

    render: async () => {
        const container = document.getElementById('performance-content');
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col space-y-6 animate-fade-in">
                <!-- Header de Status -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4" id="kpi-container">
                    <!-- KPIs serão injetados aqui via JS -->
                    <div class="skeleton h-24 w-full rounded-lg bg-gray-200 animate-pulse"></div>
                    <div class="skeleton h-24 w-full rounded-lg bg-gray-200 animate-pulse"></div>
                    <div class="skeleton h-24 w-full rounded-lg bg-gray-200 animate-pulse"></div>
                    <div class="skeleton h-24 w-full rounded-lg bg-gray-200 animate-pulse"></div>
                </div>

                <!-- Gráfico Principal: Matriz de Dispersão -->
                <div class="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">
                        <i class="fas fa-crosshairs mr-2 text-blue-600"></i>Matriz de Eficiência (Volume x Qualidade)
                    </h3>
                    <p class="text-xs text-gray-500 mb-4">Identifique outliers: Alta produção com baixa qualidade (risco) ou Alta qualidade com baixa produção (precisa de agilidade).</p>
                    <div class="relative h-80 w-full">
                        <canvas id="scatterChart"></canvas>
                    </div>
                </div>

                <!-- Comparativos Top/Bottom -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Ranking de Produção -->
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                        <h3 class="text-md font-semibold text-gray-700 mb-4 border-b pb-2">
                            <i class="fas fa-trophy mr-2 text-yellow-500"></i>Ranking de Volume
                        </h3>
                        <div class="relative h-64 w-full">
                            <canvas id="volumeRankingChart"></canvas>
                        </div>
                    </div>

                    <!-- Ranking de Assertividade -->
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                        <h3 class="text-md font-semibold text-gray-700 mb-4 border-b pb-2">
                            <i class="fas fa-check-circle mr-2 text-green-500"></i>Ranking de Qualidade (%)
                        </h3>
                        <div class="relative h-64 w-full">
                            <canvas id="qualityRankingChart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Análise de Documentos -->
                <div class="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">
                        <i class="fas fa-file-contract mr-2 text-purple-600"></i>Análise de Erros por Tipo de Documento
                    </h3>
                    <div class="relative h-72 w-full">
                        <canvas id="docsChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        await Performance.carregarDados();
    },

    carregarDados: async () => {
        try {
            Sistema.loading(true);
            
            // 1. Obter Filtros Atuais
            const filtros = Filtros.getFiltros();
            const { dataInicio, dataFim, usuarioId } = filtros;

            // 2. Construir Query
            let query = Sistema.supabase
                .from('producao_diaria')
                .select(`
                    id,
                    usuario_id,
                    data_referencia,
                    qtd_produzida,
                    qtd_auditoria,
                    qtd_erros,
                    tempo_logado,
                    tipo_documento,
                    usuarios:usuario_id ( nome )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);

            if (usuarioId) {
                query = query.eq('usuario_id', usuarioId);
            }

            const { data, error } = await query;

            if (error) throw error;

            if (!data || data.length === 0) {
                Performance.renderEmptyState();
                return;
            }

            // 3. Processar Dados (Agregações)
            const analytics = Performance.processarDados(data);
            
            // 4. Renderizar Componentes
            Performance.renderKPIs(analytics.geral);
            Performance.renderScatterPlot(analytics.usuarios);
            Performance.renderRankings(analytics.usuarios);
            Performance.renderDocumentAnalysis(analytics.documentos);

        } catch (error) {
            console.error('Erro ao carregar performance:', error);
            Sistema.notificar('Erro ao carregar dados de performance.', 'error');
        } finally {
            Sistema.loading(false);
        }
    },

    processarDados: (data) => {
        const statsUsuarios = {};
        const statsDocs = {};
        let totalProducao = 0;
        let totalErros = 0;
        let totalAuditoria = 0; // Se houver campo de auditoria, senão usamos lógica de amostragem

        data.forEach(row => {
            const uid = row.usuario_id;
            const nome = row.usuarios?.nome || 'Desconhecido';
            const docType = row.tipo_documento || 'Geral';
            
            // Garantir números
            const qtd = parseInt(row.qtd_produzida || 0);
            const erros = parseInt(row.qtd_erros || 0);

            // Agregação por Usuário
            if (!statsUsuarios[uid]) {
                statsUsuarios[uid] = { 
                    nome, 
                    producao: 0, 
                    erros: 0, 
                    registros: 0 
                };
            }
            statsUsuarios[uid].producao += qtd;
            statsUsuarios[uid].erros += erros;
            statsUsuarios[uid].registros++;

            // Agregação por Documento
            if (!statsDocs[docType]) {
                statsDocs[docType] = { producao: 0, erros: 0 };
            }
            statsDocs[docType].producao += qtd;
            statsDocs[docType].erros += erros;

            // Totais Gerais
            totalProducao += qtd;
            totalErros += erros;
        });

        // Calcular médias e porcentagens finais
        const listaUsuarios = Object.values(statsUsuarios).map(u => ({
            ...u,
            assertividade: u.producao > 0 ? ((u.producao - u.erros) / u.producao * 100).toFixed(2) : 100
        }));

        const listaDocs = Object.keys(statsDocs).map(key => ({
            tipo: key,
            producao: statsDocs[key].producao,
            erros: statsDocs[key].erros,
            taxaErro: statsDocs[key].producao > 0 ? (statsDocs[key].erros / statsDocs[key].producao * 100).toFixed(2) : 0
        }));

        const assertividadeMedia = totalProducao > 0 
            ? ((totalProducao - totalErros) / totalProducao * 100).toFixed(2) 
            : 100;

        return {
            geral: {
                totalProducao,
                totalErros,
                assertividadeMedia,
                usuariosAtivos: listaUsuarios.length
            },
            usuarios: listaUsuarios,
            documentos: listaDocs
        };
    },

    renderEmptyState: () => {
        document.getElementById('performance-content').innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-gray-500">
                <i class="fas fa-chart-line text-4xl mb-4"></i>
                <p>Nenhum dado encontrado para o período selecionado.</p>
            </div>
        `;
    },

    renderKPIs: (geral) => {
        const kpiContainer = document.getElementById('kpi-container');
        kpiContainer.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                <p class="text-sm text-gray-500 uppercase">Total Produzido</p>
                <p class="text-2xl font-bold text-gray-800">${geral.totalProducao.toLocaleString('pt-BR')}</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                <p class="text-sm text-gray-500 uppercase">Assertividade Média</p>
                <p class="text-2xl font-bold text-gray-800">${geral.assertividadeMedia}%</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                <p class="text-sm text-gray-500 uppercase">Total de Erros</p>
                <p class="text-2xl font-bold text-gray-800">${geral.totalErros}</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                <p class="text-sm text-gray-500 uppercase">Colaboradores</p>
                <p class="text-2xl font-bold text-gray-800">${geral.usuariosAtivos}</p>
            </div>
        `;
    },

    // --- Chart.js Helpers ---

    destroyChart: (canvasId) => {
        if (Performance.charts[canvasId]) {
            Performance.charts[canvasId].destroy();
        }
    },

    renderScatterPlot: (usuarios) => {
        const canvasId = 'scatterChart';
        Performance.destroyChart(canvasId);

        const ctx = document.getElementById(canvasId).getContext('2d');
        
        // Dados para o Scatter: x=Volume, y=Assertividade
        const dataPoints = usuarios.map(u => ({
            x: u.producao,
            y: parseFloat(u.assertividade),
            r: 8, // raio do ponto
            user: u.nome // meta dado customizado
        }));

        Performance.charts[canvasId] = new Chart(ctx, {
            type: 'bubble', // Usando bubble para controlar o tamanho do ponto
            data: {
                datasets: [{
                    label: 'Colaboradores',
                    data: dataPoints,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const pt = context.raw;
                                return `${pt.user}: Vol ${pt.x} | Qual ${pt.y}%`;
                            }
                        }
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Volume Produzido' },
                        beginAtZero: true
                    },
                    y: {
                        title: { display: true, text: 'Assertividade (%)' },
                        min: 80, // Focando a escala onde importa (80-100 geralmente)
                        max: 100
                    }
                }
            }
        });
    },

    renderRankings: (usuarios) => {
        // Ordenações
        const sortedByVol = [...usuarios].sort((a, b) => b.producao - a.producao);
        const sortedByQual = [...usuarios].sort((a, b) => parseFloat(b.assertividade) - parseFloat(a.assertividade));

        // Pegar Top 5 e Bottom 5 para Volume (ou todos se for pouco)
        const topVol = sortedByVol.slice(0, 5);
        const topQual = sortedByQual.slice(0, 5);

        // --- Gráfico de Volume ---
        Performance.destroyChart('volumeRankingChart');
        const ctxVol = document.getElementById('volumeRankingChart').getContext('2d');
        Performance.charts['volumeRankingChart'] = new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: topVol.map(u => u.nome.split(' ')[0]), // Primeiro nome apenas
                datasets: [{
                    label: 'Produção Total',
                    data: topVol.map(u => u.producao),
                    backgroundColor: 'rgba(245, 158, 11, 0.7)', // Amarelo
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // --- Gráfico de Qualidade ---
        Performance.destroyChart('qualityRankingChart');
        const ctxQual = document.getElementById('qualityRankingChart').getContext('2d');
        Performance.charts['qualityRankingChart'] = new Chart(ctxQual, {
            type: 'bar',
            data: {
                labels: topQual.map(u => u.nome.split(' ')[0]),
                datasets: [{
                    label: 'Assertividade (%)',
                    data: topQual.map(u => u.assertividade),
                    backgroundColor: 'rgba(16, 185, 129, 0.7)', // Verde
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { min: 90, max: 100 } }, // Zoom na qualidade
                plugins: { legend: { display: false } }
            }
        });
    },

    renderDocumentAnalysis: (documentos) => {
        const canvasId = 'docsChart';
        Performance.destroyChart(canvasId);

        // Ordenar documentos com mais erros absolutos
        const sortedDocs = [...documentos].sort((a, b) => b.erros - a.erros).slice(0, 8); // Top 8 ofensores

        const ctx = document.getElementById(canvasId).getContext('2d');
        Performance.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedDocs.map(d => d.tipo),
                datasets: [
                    {
                        label: 'Qtd de Erros',
                        data: sortedDocs.map(d => d.erros),
                        type: 'bar',
                        backgroundColor: 'rgba(239, 68, 68, 0.6)', // Vermelho
                        order: 2
                    },
                    {
                        label: 'Taxa de Erro (%)',
                        data: sortedDocs.map(d => d.taxaErro),
                        type: 'line',
                        borderColor: 'rgba(75, 85, 99, 1)', // Cinza escuro
                        borderWidth: 2,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Erros Absolutos' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Taxa de Erro (%)' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }
};