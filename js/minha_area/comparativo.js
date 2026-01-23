// js/minha_area/comparativo.js

// ====================================================================
// MAPEAMENTO DE NOMES AMIGÁVEIS (UX)
// ====================================================================
// Traduz os códigos técnicos do banco para termos fáceis para as assistentes.
const FRIENDLY_NAMES_MAP = {
    'DOC_NDF_100%': 'Empresas 100%',
    'DOC_NDF_CATEGORIA PROFISSIONAL': 'Categoria DIP',
    'DOC_NDF_DEPENDENTE': 'Categoria Dependentes',
    'DOC_NDF_ESTADO CIVIL': 'Categoria Certidão',
    'DOC_NDF_ESTRANGEIRO': 'Categoria Estrangeiro',
    'DOC_NDF_LAUDO': 'Categoria Laudo',
    'DOC_NDF_OUTROS': 'Empresa deveria Validar'
    // Se aparecer um novo código não listado aqui, o sistema usará o código original.
};

MinhaArea.Comparativo = {
    myChart: null,
    dadosProcessados: null,
    visaoAtual: 'doc', // 'doc', 'empresa', 'ndf'
    mostrarTodos: false,
    filtroBusca: '',

    init: function() {
        // Inicializações se necessário
    },

    // --- CORREÇÃO DO ERRO ---
    // O main.js chama .carregar(), então criamos esta função para redirecionar
    carregar: async function() {
        console.log("[Comparativo] Iniciando carga...");
        await this.atualizar();
    },

    atualizar: async function() {
        // O carregamento e processamento dos dados é feito pelo pai (MinhaArea.js)
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
            // Sistema.Notificacao é opcional, dependendo se existe no sistema.js
            if(window.Sistema && Sistema.Notificacao) {
                Sistema.Notificacao.mostrar("Erro ao processar dados do comparativo.", "erro");
            }
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
                 // Agrupamento para o gráfico (usando o nome técnico original para agrupar corretamente)
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
        
        const elTotal = document.getElementById('total-nok-detalhe');
        const elGupy = document.getElementById('total-nok-gupy');
        const elNdf = document.getElementById('total-ndf-detalhe');
        const elEmpresa = document.getElementById('total-ndf-auditados');

        if(elTotal) elTotal.textContent = stats.totalGeralNokNdf;
        if(elGupy) elGupy.textContent = stats.totalNokGupy;
        if(elNdf) elNdf.textContent = stats.totalNdfGeral;
        if(elEmpresa) elEmpresa.textContent = stats.totalNdfAuditados;

        // Atualiza Gráfico e Feed com base nos filtros atuais
        this.aplicarFiltrosVisuais();
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        // Atualiza estado dos botões
        ['btn-view-doc', 'btn-view-empresa', 'btn-view-ndf'].forEach(id => {
            const btn = document.getElementById(id);
            if(btn) {
                btn.classList.remove('bg-white', 'text-rose-600', 'shadow-sm');
                btn.classList.add('text-slate-500', 'hover:bg-white');
            }
        });

        const activeBtn = document.getElementById(`btn-view-${novaVisao}`);
        if(activeBtn) {
            activeBtn.classList.remove('text-slate-500', 'hover:bg-white');
            activeBtn.classList.add('bg-white', 'text-rose-600', 'shadow-sm');
        }

        // Re-renderiza o gráfico com a nova visão
        this.aplicarFiltrosVisuais();
    },

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.textContent = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        this.aplicarFiltrosVisuais();
    },

    filtrarPorBusca: function(termo) {
        this.filtroBusca = termo.toLowerCase().trim();
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        if(btnLimpar) {
            if (this.filtroBusca.length > 0) {
                btnLimpar.classList.remove('hidden');
            } else {
                btnLimpar.classList.add('hidden');
            }
        }
        this.aplicarFiltrosVisuais();
    },

    limparFiltro: function() {
        this.filtroBusca = '';
        const input = document.querySelector('#feed-erros-container input'); // fallback se não achar ID especifico fora
        // Na estrutura HTML atual o input tem onkeyup, vamos tentar limpá-lo se tivermos acesso direto ou via seletor do pai
        // Como o input está no HTML principal, o ideal é o usuário limpar ou usarmos um ID no input. 
        // O código anterior assumia um seletor. Vamos manter simples:
        const inputs = document.getElementsByTagName('input');
        for(let inp of inputs) {
            if(inp.placeholder.includes('Buscar')) inp.value = '';
        }

        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
        
        this.aplicarFiltrosVisuais();
    },

    aplicarFiltrosVisuais: function() {
        if (!this.dadosProcessados) return;

        // 1. Filtra e Renderiza o Gráfico
        let dadosGrafico = [...this.dadosProcessados.topOfensores];

        // Filtro por Visão (Doc, Empresa, NDF)
        if (this.visaoAtual === 'empresa') {
            dadosGrafico = dadosGrafico.filter(item => item.ofensor.toUpperCase().includes('EMPRESA'));
        } else if (this.visaoAtual === 'ndf') {
            dadosGrafico = dadosGrafico.filter(item => item.ofensor.toUpperCase().includes('NDF'));
        } 
        
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
                // Aplica o mapa de nomes amigáveis também na busca do feed
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
        const cvs = document.getElementById('graficoTopOfensores');
        if(!cvs) return;
        
        const ctx = cvs.getContext('2d');

        if (this.myChart) {
            this.myChart.destroy();
        }

        if (data.length === 0) {
            // Opcional: mostrar mensagem de "Sem dados" no canvas
            return;
        }

        // APLICAÇÃO DO MAPEAMENTO DE NOMES AMIGÁVEIS (UX)
        const labels = data.map(item => {
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
                    backgroundColor: data.map(item => item.ofensor.toUpperCase().includes('NDF') ? '#f59e0b' : '#e11d48'),
                    borderRadius: 6,
                    barThickness: 'flex',
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Barras horizontais
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { display: false, drawBorder: false },
                        ticks: { font: { family: "'Nunito', sans-serif", size: 10 }, color: '#94a3b8' }
                    },
                    y: {
                        grid: { display: false, drawBorder: false },
                        ticks: {
                            font: { family: "'Nunito', sans-serif", size: 11, weight: '600' },
                            color: '#475569',
                            callback: function(value) {
                                const label = this.getLabelForValue(value);
                                return label.length > 25 ? label.substr(0, 25) + '...' : label;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        titleFont: { family: "'Nunito', sans-serif", size: 12 },
                        bodyFont: { family: "'Nunito', sans-serif", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: function(context) { return context[0].label; }
                        }
                    }
                }
            }
        });
    },

    renderizarFeedErros: function(data) {
        const container = document.getElementById('feed-erros-container');
        if(!container) return;
        
        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fas fa-check-circle text-4xl mb-2 text-emerald-200"></i><br>
                    Nenhum registro de atenção encontrado.
                </div>`;
            return;
        }

        data.forEach(item => {
            const isNDF = item.status === 'NDF';
            const themeColor = isNDF ? 'amber' : 'rose';
            const icon = isNDF ? 'fa-file-contract' : 'fa-times-circle';
            
            // Aplica nome amigável também no feed
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
        // Implementar visual de estado vazio se necessário
        const cvs = document.getElementById('graficoTopOfensores');
        const feed = document.getElementById('feed-erros-container');
        if(feed) feed.innerHTML = '<div class="text-center py-10 text-slate-300">Aguardando dados...</div>';
    }
};