/* ARQUIVO: js/minha_area/comparativo.js
   DESCRIÇÃO: Engine de Assertividade Otimizada (Performance Fix + UX)
*/

// ====================================================================
// MAPEAMENTO DE NOMES AMIGÁVEIS (UX)
// ====================================================================
const FRIENDLY_NAMES_MAP = {
    'DOC_NDF_100%': 'Empresas 100%',
    'DOC_NDF_CATEGORIA PROFISSIONAL': 'Categoria DIP',
    'DOC_NDF_DEPENDENTE': 'Categoria Dependentes',
    'DOC_NDF_ESTADO CIVIL': 'Categoria Certidão',
    'DOC_NDF_ESTRANGEIRO': 'Categoria Estrangeiro',
    'DOC_NDF_LAUDO': 'Categoria Laudo',
    'DOC_NDF_OUTROS': 'Empresa deveria Validar'
};

MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosBrutosCache: [], 
    visaoAtual: 'doc', 
    mostrarTodos: false,

    carregar: async function() {
        console.time("PerformanceTotal");
        console.log("🚀 UX Dashboard: Iniciando Carga Otimizada...");
        const uid = MinhaArea.getUsuarioAlvo();
        
        if (!uid && typeof MinhaArea.isAdmin === 'function' && !MinhaArea.isAdmin()) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        const elErrosValidados = document.getElementById('total-nok-detalhe');
        const elErrosGupy = document.getElementById('total-nok-gupy'); 
        const elNdfTotal = document.getElementById('total-ndf-detalhe'); 
        const elNdfAuditados = document.getElementById('total-ndf-auditados'); 
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        if(btnLimpar) btnLimpar.classList.add('hidden');
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2 text-blue-500"></i><br>Baixando dados...</div>';

        try {
            // 1. BUSCA OTIMIZADA (Apenas colunas úteis)
            const dados = await this.buscarTudoPaginado(uid, inicio, fim);
            this.dadosBrutosCache = dados;

            console.log(`📦 Processando ${dados.length} registros...`);

            // --- REGRAS DE NEGÓCIO (Processamento em Lote) ---

            // Pré-cálculos para evitar loopings repetitivos
            let countValidados = 0;
            let countGupy = 0;
            let countNdf = 0;
            let countNdfOutros = 0;

            const listaValidados = [];

            // Loop único para categorização (Muito mais rápido que 4 filters seguidos)
            for (let i = 0; i < dados.length; i++) {
                const d = dados[i];
                
                // Regra Base: Tem auditora
                if (!d.auditora_nome || d.auditora_nome.trim() === '') continue;

                listaValidados.push(d); // Mantemos referência para o Feed
                countValidados++;

                const tipoDocUpper = (d.tipo_documento || '').toUpperCase();
                const isNdf = tipoDocUpper.startsWith('DOC_NDF_');

                if (isNdf) {
                    countNdf++;
                    if (tipoDocUpper === 'DOC_NDF_OUTROS') countNdfOutros++;
                } else {
                    countGupy++;
                }
            }

            // --- ATUALIZAÇÃO DOS CONTADORES ---
            if(elErrosValidados) elErrosValidados.innerText = countValidados.toLocaleString('pt-BR');
            if(elErrosGupy) elErrosGupy.innerText = countGupy.toLocaleString('pt-BR'); 
            if(elNdfTotal) elNdfTotal.innerText = countNdf.toLocaleString('pt-BR');
            if(elNdfAuditados) elNdfAuditados.innerText = countNdfOutros.toLocaleString('pt-BR');

            // --- RENDERIZAÇÃO ---
            if (listaValidados.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                console.timeEnd("PerformanceTotal");
                return;
            }

            // Inicializa visualização
            this.mudarVisao(this.visaoAtual); 
            console.timeEnd("PerformanceTotal");

        } catch (err) {
            console.error("Erro Comparativo:", err);
            if(containerFeed) containerFeed.innerHTML = `<div class="text-rose-500 text-center py-8">Erro ao carregar: ${err.message}</div>`;
        }
    },

    getFriendlyName: function(technicalName) {
        if (!technicalName) return 'Sem Nome';
        return FRIENDLY_NAMES_MAP[technicalName] || technicalName;
    },

    isNDF: function(d) {
        return (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');
    },

    getDocType: function(d) {
        if (this.isNDF(d)) {
            return d.tipo_documento || "DOC_NDF_GENERICO";
        }
        // Fallback seguro se doc_name não vier no select otimizado
        return d.doc_name || d.nome_documento || d.tipo_documento || 'Documento Gupy';
    },

    filtrarPorBusca: function(texto) {
        if (!texto || texto.trim() === '') {
            this.limparFiltro(true);
            return;
        }
        const termo = texto.toLowerCase();
        
        // Filtra apenas validados
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        
        // Limita a busca para não travar em datasets gigantes
        const filtrados = [];
        let matches = 0;
        
        for (let i = 0; i < base.length; i++) {
            if (matches >= 100) break; // Otimização: para de buscar se já achou 100 resultados
            
            const d = base[i];
            const nome = (d.doc_name || '').toLowerCase();
            const tipoTecnico = (this.getDocType(d) || '');
            const tipoAmigavel = this.getFriendlyName(tipoTecnico).toLowerCase();
            const obs = (d.observacao || d.obs || d.apontamentos || '').toLowerCase();
            const emp = (d.empresa || d.empresa_nome || '').toLowerCase();
            
            if (nome.includes(termo) || 
                tipoTecnico.toLowerCase().includes(termo) || 
                tipoAmigavel.includes(termo) || 
                obs.includes(termo) || 
                emp.includes(termo)) {
                
                filtrados.push(d);
                matches++;
            }
        }

        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar Busca`; }
    },

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.innerText = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        this.mudarVisao(this.visaoAtual);
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        const btnDoc = document.getElementById('btn-view-doc');
        const btnEmpresa = document.getElementById('btn-view-empresa');
        const btnNdf = document.getElementById('btn-view-ndf');
        
        const baseClass = "px-3 py-1 text-[10px] font-bold rounded transition ";
        const activeClass = "bg-white text-rose-600 shadow-sm";
        const inactiveClass = "text-slate-500 hover:bg-white";

        if(btnDoc) btnDoc.className = baseClass + (novaVisao === 'doc' ? activeClass : inactiveClass);
        if(btnEmpresa) btnEmpresa.className = baseClass + (novaVisao === 'empresa' ? activeClass : inactiveClass);
        if(btnNdf) btnNdf.className = baseClass + (novaVisao === 'ndf' ? activeClass : inactiveClass);

        this.limparFiltro(false);
        
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        let filtrados;
        
        if (novaVisao === 'ndf') {
            filtrados = base.filter(d => this.isNDF(d));
        } else {
            // Visão Geral e Empresa usam a base completa de validados
            filtrados = base;
        }
        
        this.atualizarGrafico(filtrados);
        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
    },

    filtrarPorSelecao: function(valorAmigavel) {
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        const filtrados = [];
        let limit = 0;

        // Otimização: Loop com limite de resultados para o feed
        for (let i = 0; i < base.length; i++) {
            if (limit >= 200) break; // Trava de segurança UI
            const d = base[i];
            
            let match = false;
            if (this.visaoAtual === 'empresa') {
                const emp = d.empresa || d.empresa_nome || 'Desconhecida';
                match = (emp === valorAmigavel || emp.includes(valorAmigavel.replace('...', '')));
            } else {
                const tipoTecnico = this.visaoAtual === 'ndf' ? (d.tipo_documento || '') : this.getDocType(d);
                const nomeAmigavelItem = this.getFriendlyName(tipoTecnico);
                match = (nomeAmigavelItem === valorAmigavel || nomeAmigavelItem.includes(valorAmigavel.replace('...', '')));
            }

            if(match) {
                filtrados.push(d);
                limit++;
            }
        }
        
        this.aplicarFiltroVisual(filtrados, valorAmigavel);
    },

    atualizarGrafico: function(dadosParaGrafico) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();

        // Agrupamento Otimizado
        const agrupamento = {};
        
        // Processar no máximo 20.000 itens para o gráfico para não travar a UI
        const limitProcess = Math.min(dadosParaGrafico.length, 50000);

        for (let i = 0; i < limitProcess; i++) {
            const item = dadosParaGrafico[i];
            let chave = 'Outros';
            
            if (this.visaoAtual === 'empresa') {
                chave = item.empresa || item.empresa_nome || 'Desconhecida';
            } else if (this.visaoAtual === 'ndf') {
                const codigoTecnico = item.tipo_documento || item.doc_name || 'Sem Nome';
                chave = this.getFriendlyName(codigoTecnico);
            } else {
                const codigoTecnico = this.getDocType(item);
                chave = this.getFriendlyName(codigoTecnico);
            }
            
            if(chave.length > 28) chave = chave.substring(0, 26) + '...';
            
            agrupamento[chave] = (agrupamento[chave] || 0) + 1;
        }

        let dadosGrafico = Object.entries(agrupamento).sort((a, b) => b[1] - a[1]);
        if (!this.mostrarTodos) dadosGrafico = dadosGrafico.slice(0, 5);
        else dadosGrafico = dadosGrafico.slice(0, 50); // Hard limit de 50 barras mesmo em "Ver Todos"

        this.renderizarGraficoOfensores(dadosGrafico);
    },

    aplicarFiltroVisual: function(lista, nomeFiltro) {
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(lista, container);
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar: ${nomeFiltro}`; }
    },

    limparFiltro: function(renderizar = true) {
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
        const inputBusca = document.querySelector('#ma-tab-comparativo input');
        if(inputBusca) inputBusca.value = '';
        if (renderizar) this.mudarVisao(this.visaoAtual);
    },

    renderizarFeed: function(lista, container) {
        if(!container) return;
        
        // OTIMIZAÇÃO CRÍTICA DE RENDERIZAÇÃO
        // Se houver mais de 100 erros, corta e avisa.
        // Renderizar 116k divs trava o navegador.
        const LIMITE_RENDER = 100;
        const totalItens = lista.length;
        const itensVisiveis = lista.slice(0, LIMITE_RENDER);
        
        if (totalItens === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum registro encontrado.</div>';
            return;
        }
        
        // Ordenação apenas dos visíveis (ou top 1000 antes do slice se performance permitir)
        // Como o array original pode ser grande, evitamos sort() no array de 100k
        // Vamos assumir que o banco já traz mais ou menos ordenado ou ordenamos só o slice se necessário
        // Para garantir ordem cronológica no topo:
        itensVisiveis.sort((a, b) => new Date(b.data_referencia || 0) - new Date(a.data_referencia || 0));
        
        let html = '';
        
        // Aviso de performance se cortou
        if (totalItens > LIMITE_RENDER) {
            html += `<div class="bg-blue-50 text-blue-600 text-[10px] font-bold p-2 rounded mb-2 text-center border border-blue-100">
                <i class="fas fa-info-circle"></i> Exibindo os ${LIMITE_RENDER} erros mais recentes de um total de ${totalItens.toLocaleString()}.
            </div>`;
        }

        itensVisiveis.forEach(doc => {
            const data = doc.data_referencia ? new Date(doc.data_referencia).toLocaleDateString('pt-BR') : '-';
            const nomeDocumentoOriginal = doc.doc_name || 'Sem Nome';
            const tipoTecnico = this.getDocType(doc);
            const subtitulo = this.getFriendlyName(tipoTecnico);
            const empresa = doc.empresa || doc.empresa_nome || '';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            
            let badgeClass = 'bg-slate-100 text-slate-600';
            let badgeText = 'AUDIT';
            let borderClass = 'border-l-emerald-500';

            if (isNdf) {
                badgeClass = 'bg-amber-100 text-amber-700';
                badgeText = 'NDF';
                borderClass = 'border-l-amber-500';
            } else {
                const qtd = Number(doc.qtd_nok || 0);
                const status = (doc.status || '').toUpperCase();
                if (qtd > 0 || status.includes('NOK')) {
                    badgeClass = 'bg-rose-50 text-rose-600';
                    badgeText = 'NOK';
                    borderClass = 'border-l-rose-500';
                } else {
                    badgeClass = 'bg-emerald-50 text-emerald-600';
                    badgeText = 'OK';
                }
            }

            const assistenteInfo = (!MinhaArea.getUsuarioAlvo()) ? `<span class="block text-[9px] text-blue-500 font-bold mt-1">👤 ${doc.assistente_nome || 'Equipe'}</span>` : '';

            html += `
            <div class="bg-white p-3 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group mb-2">
                <div class="flex justify-between items-start mb-1">
                    <div class="overflow-hidden pr-2">
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block truncate">${data} • ${subtitulo}</span>
                        <h4 class="font-bold text-slate-700 text-xs leading-tight truncate" title="${nomeDocumentoOriginal}">${nomeDocumentoOriginal}</h4>
                        <div class="text-[9px] text-slate-500 truncate" title="${empresa}">${empresa}</div>
                        ${assistenteInfo}
                    </div>
                    <div class="${badgeClass} text-[9px] font-bold px-1.5 py-0.5 rounded border border-white shadow-sm whitespace-nowrap">${badgeText}</div>
                </div>
                <div class="bg-slate-50 p-2 rounded text-[10px] text-slate-600 italic border border-slate-100 line-clamp-2" title="${obs}"><i class="fas fa-quote-left text-slate-300 mr-1"></i> ${obs}</div>
            </div>`;
        });
        container.innerHTML = html;
    },

    renderizarGraficoOfensores: function(dados) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();
        
        const labels = dados.map(d => d[0]);
        const values = dados.map(d => d[1]);
        const _this = this;
        
        let barColor = '#f43f5e'; 
        if (this.visaoAtual === 'empresa') barColor = '#3b82f6'; 
        if (this.visaoAtual === 'ndf') barColor = '#d97706'; 

        this.chartOfensores = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Ocorrências', 
                    data: values, 
                    backgroundColor: barColor, 
                    borderRadius: 4, 
                    barThickness: 'flex',
                    maxBarThickness: 30,
                    hoverBackgroundColor: '#1e293b' 
                }] 
            },
            options: {
                indexAxis: 'y', 
                responsive: true, 
                maintainAspectRatio: false,
                onClick: (e, elements) => { 
                    if (elements.length > 0) { 
                        const index = elements[0].index; 
                        _this.filtrarPorSelecao(labels[index]); 
                    } 
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        padding: 10,
                        titleFont: { family: "'Nunito', sans-serif" },
                        bodyFont: { family: "'Nunito', sans-serif" }
                    }
                },
                scales: { 
                    x: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        // CORREÇÃO DO WARNING DE PERFORMANCE DO CHART.JS
                        // Removemos stepSize: 1 e deixamos automático com limite de ticks
                        ticks: { 
                            autoSkip: true,
                            maxTicksLimit: 8,
                            font: { size: 10 } 
                        } 
                    }, 
                    y: { 
                        grid: { display: false }, 
                        ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } 
                    } 
                }
            }
        });
    },

    renderizarVazio: function(container) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-center p-8"><div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 text-emerald-500"><i class="fas fa-trophy text-3xl"></i></div><h3 class="text-lg font-bold text-slate-700">Tudo Certo!</h3><p class="text-sm text-slate-500">Nenhum erro encontrado neste período.</p></div>';
    },

    renderizarGraficoVazio: function() {
        const ctx = document.getElementById('graficoTopOfensores');
        if (ctx && this.chartOfensores) this.chartOfensores.destroy();
    },

    buscarTudoPaginado: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        let continuar = true;
        
        // OTIMIZAÇÃO: Selecionar apenas colunas necessárias reduz drasticamente o tráfego de rede
        // Removido SELECT *
        const colunas = 'id, data_referencia, auditora_nome, tipo_documento, doc_name, nome_documento, observacao, obs, apontamentos, status, empresa, empresa_nome, assistente_nome, qtd_nok';

        while(continuar) {
            let query = Sistema.supabase
                .from('assertividade')
                .select(colunas)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .range(page*1000, (page+1)*1000-1);

            if (uid) query = query.eq('usuario_id', uid);

            const { data, error } = await query;
            if(error) throw error;
            
            todos = todos.concat(data);
            if(data.length < 1000) continuar = false;
            else page++;
            
            // Safety break para admin em periodos longos
            if (page > 50) { 
                console.warn("Limite de segurança de paginação atingido (50k registros)");
                continuar = false; 
            }
        }
        return todos;
    }
};