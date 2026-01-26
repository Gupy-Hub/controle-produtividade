/* ARQUIVO: js/minha_area/comparativo.js
   DESCRIÇÃO: Engine de Comparativo/Ofensores (Server Side - RPC v6.0)
   MOTIVO: Performance Instantânea + Alinhamento de Lógica com Aba Metas
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
    listaErrosCache: [], // Guarda os erros retornados pela RPC
    visaoAtual: 'doc', 
    mostrarTodos: false,
    isLocked: false,

    carregar: async function() {
        if (this.isLocked) return;
        this.isLocked = true;

        console.time("PerformanceComparativo");
        console.log("🚀 Comparativo: Iniciando Modo RPC (v6.0)...");
        
        const uid = MinhaArea.getUsuarioAlvo();
        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        // Elementos de UI
        const containerFeed = document.getElementById('feed-erros-container');
        const elTotalAuditados = document.getElementById('card-total-auditados');
        const elTotalAcertos = document.getElementById('card-total-acertos');
        const elTotalErros = document.getElementById('card-total-erros');
        const elErrosGupy = document.getElementById('card-erros-gupy'); 
        const elErrosNdf = document.getElementById('card-erros-ndf'); 
        const elEmpresaValidar = document.getElementById('card-empresa-validar'); 

        // Reset Visual
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2 text-blue-500"></i><br>Analisando ofensores...</div>';
        [elTotalAuditados, elTotalAcertos, elTotalErros].forEach(el => { if(el) el.innerText = '...'; });

        try {
            // 1. CHAMADA RPC (Instantânea)
            // Traz o Total de Auditados (numero) e a Lista de Erros (array json)
            const { data, error } = await Sistema.supabase
                .rpc('get_comparativo_minha_area', { 
                    p_inicio: inicio, 
                    p_fim: fim, 
                    p_usuario_id: uid 
                });

            if (error) throw error;

            // O RPC retorna um array com 1 linha. Pegamos o primeiro.
            const resultado = data && data.length > 0 ? data[0] : { total_auditados: 0, lista_erros: [] };
            
            const totalAuditados = resultado.total_auditados || 0;
            const listaErros = resultado.lista_erros || []; // Apenas linhas com qtd_nok > 0
            
            this.listaErrosCache = listaErros; // Cache para filtros locais

            console.log(`📦 RPC: ${totalAuditados} auditados, ${listaErros.length} erros.`);

            // --- CÁLCULOS KPI (Feitos aqui pois são simples somas) ---
            let countErrosGupy = 0;
            let countErrosNdf = 0;
            let countNdfEmpresa = 0;

            listaErros.forEach(d => {
                const tipoDocUpper = (d.tipo_documento || '').toUpperCase();
                const isNdf = tipoDocUpper.startsWith('DOC_NDF_');

                if (isNdf) {
                    countErrosNdf++;
                    if (tipoDocUpper === 'DOC_NDF_OUTROS') countNdfEmpresa++;
                } else {
                    countErrosGupy++;
                }
            });

            const totalErros = listaErros.length;
            const totalAcertos = totalAuditados - totalErros;

            // --- ATUALIZAÇÃO DO DOM ---
            if(elTotalAuditados) elTotalAuditados.innerText = totalAuditados.toLocaleString('pt-BR');
            if(elTotalAcertos) elTotalAcertos.innerText = totalAcertos.toLocaleString('pt-BR');
            if(elTotalErros) elTotalErros.innerText = totalErros.toLocaleString('pt-BR');
            
            if(elErrosGupy) elErrosGupy.innerText = countErrosGupy.toLocaleString('pt-BR'); 
            if(elErrosNdf) elErrosNdf.innerText = countErrosNdf.toLocaleString('pt-BR'); 
            if(elEmpresaValidar) elEmpresaValidar.innerText = countNdfEmpresa.toLocaleString('pt-BR');

            // --- RENDERIZAÇÃO (Gráfico e Feed) ---
            if (listaErros.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
            } else {
                this.mudarVisao(this.visaoAtual); // Renderiza gráfico/feed com base na visão atual
            }
            
            console.timeEnd("PerformanceComparativo");

        } catch (err) {
            console.error("Erro Comparativo:", err);
            if(containerFeed) containerFeed.innerHTML = `<div class="text-rose-500 text-center py-8">Erro ao carregar: ${err.message}</div>`;
        } finally {
            this.isLocked = false;
        }
    },

    // --- FUNÇÕES DE FILTRO E VISUALIZAÇÃO (Mantidas mas otimizadas) ---

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
        return d.doc_name || d.tipo_documento || 'Documento Gupy';
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        // Atualiza botões
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
        
        // Filtra a lista de erros que já está na memória
        const base = this.listaErrosCache;
        let filtrados;
        
        if (novaVisao === 'ndf') {
            filtrados = base.filter(d => this.isNDF(d));
        } else {
            // Em visão DOC ou EMPRESA, mostramos tudo (ou filtramos NDF se quiser, mas geralmente mostra tudo)
            filtrados = base;
        }
        
        this.atualizarGrafico(filtrados);
        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
    },

    filtrarPorBusca: function(texto) {
        if (!texto || texto.trim() === '') {
            this.limparFiltro(true);
            return;
        }
        const termo = texto.toLowerCase();
        const base = this.listaErrosCache; 
        
        const filtrados = base.filter(d => {
            const nome = (d.doc_name || '').toLowerCase();
            const tipoTecnico = (this.getDocType(d) || '');
            const tipoAmigavel = this.getFriendlyName(tipoTecnico).toLowerCase();
            const obs = (d.observacao || '').toLowerCase();
            const emp = (d.empresa_nome || '').toLowerCase();
            
            return nome.includes(termo) || 
                   tipoTecnico.toLowerCase().includes(termo) || 
                   tipoAmigavel.includes(termo) || 
                   obs.includes(termo) || 
                   emp.includes(termo);
        });

        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar Busca`; }
    },

    atualizarGrafico: function(dadosParaGrafico) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();

        const agrupamento = {};
        
        // Agrupa os erros em memória
        dadosParaGrafico.forEach(item => {
            let chave = 'Outros';
            
            if (this.visaoAtual === 'empresa') {
                chave = item.empresa_nome || 'Desconhecida';
            } else if (this.visaoAtual === 'ndf') {
                const codigoTecnico = item.tipo_documento || item.doc_name || 'Sem Nome';
                chave = this.getFriendlyName(codigoTecnico);
            } else {
                const codigoTecnico = this.getDocType(item);
                chave = this.getFriendlyName(codigoTecnico);
            }
            
            if(chave.length > 28) chave = chave.substring(0, 26) + '...';
            agrupamento[chave] = (agrupamento[chave] || 0) + 1;
        });

        let dadosGrafico = Object.entries(agrupamento).sort((a, b) => b[1] - a[1]);
        
        if (!this.mostrarTodos) dadosGrafico = dadosGrafico.slice(0, 5);
        else dadosGrafico = dadosGrafico.slice(0, 50);

        this.renderizarGraficoOfensores(dadosGrafico);
    },

    renderizarGraficoOfensores: function(dados) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        
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
                plugins: { legend: { display: false } },
                scales: { 
                    x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }, 
                    y: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } } 
                }
            }
        });
    },

    renderizarFeed: function(lista, container) {
        if(!container) return;
        const LIMITE_RENDER = 100;
        
        if (lista.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum erro encontrado neste filtro.</div>';
            return;
        }
        
        let html = '';
        if (lista.length > LIMITE_RENDER) {
            html += `<div class="bg-blue-50 text-blue-600 text-[10px] font-bold p-2 rounded mb-2 text-center border border-blue-100">Exibindo os ${LIMITE_RENDER} erros mais recentes.</div>`;
        }

        lista.slice(0, LIMITE_RENDER).forEach(doc => {
            const data = doc.data_referencia ? new Date(doc.data_referencia).toLocaleDateString('pt-BR') : '-';
            const nomeDoc = doc.doc_name || 'Sem Nome';
            const subtitulo = this.getFriendlyName(this.getDocType(doc));
            const empresa = doc.empresa_nome || ''; 
            const obs = doc.observacao || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            
            const badgeClass = isNdf ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-600';
            const badgeText = isNdf ? 'NDF' : 'NOK';
            const borderClass = isNdf ? 'border-l-amber-500' : 'border-l-rose-500';

            const assistente = (!MinhaArea.getUsuarioAlvo()) ? `<span class="block text-[9px] text-blue-500 font-bold mt-1">👤 ${doc.assistente_nome || 'Equipe'}</span>` : '';

            html += `
            <div class="bg-white p-3 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 mb-2">
                <div class="flex justify-between items-start mb-1">
                    <div class="overflow-hidden pr-2">
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block truncate">${data} • ${subtitulo}</span>
                        <h4 class="font-bold text-slate-700 text-xs leading-tight truncate" title="${nomeDoc}">${nomeDoc}</h4>
                        <div class="text-[9px] text-slate-500 truncate" title="${empresa}">${empresa}</div>
                        ${assistente}
                    </div>
                    <div class="${badgeClass} text-[9px] font-bold px-1.5 py-0.5 rounded border border-white shadow-sm whitespace-nowrap">${badgeText}</div>
                </div>
                <div class="bg-slate-50 p-2 rounded text-[10px] text-slate-600 italic border border-slate-100 line-clamp-2" title="${obs}"><i class="fas fa-quote-left text-slate-300 mr-1"></i> ${obs}</div>
            </div>`;
        });
        container.innerHTML = html;
    },

    filtrarPorSelecao: function(valorAmigavel) {
        // Implementação simplificada: Filtra o feed pelo item clicado no gráfico
        const input = document.querySelector('#ma-tab-comparativo input');
        if(input) {
            input.value = valorAmigavel;
            this.filtrarPorBusca(valorAmigavel);
        }
    },
    
    limparFiltro: function(renderizar) {
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
        const input = document.querySelector('#ma-tab-comparativo input');
        if(input) input.value = '';
        if(renderizar) this.mudarVisao(this.visaoAtual);
    },
    
    renderizarVazio: function(c) { c.innerHTML = '<div class="text-center p-8 text-slate-500">Parabéns! Zero erros.</div>'; },
    renderizarGraficoVazio: function() { if(this.chartOfensores) this.chartOfensores.destroy(); }
};