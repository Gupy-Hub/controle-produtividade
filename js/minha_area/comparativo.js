/* ARQUIVO: js/minha_area/comparativo.js
   DESCRIÇÃO: Engine de Assertividade com Nomes Amigáveis (UX)
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
        console.log("🚀 UX Dashboard: Iniciando...");
        const uid = MinhaArea.getUsuarioAlvo();
        
        // Se não tiver usuário alvo e não for admin, para.
        if (!uid && typeof MinhaArea.isAdmin === 'function' && !MinhaArea.isAdmin()) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        const elErrosValidados = document.getElementById('total-nok-detalhe');
        const elErrosGupy = document.getElementById('total-nok-gupy'); 
        const elNdfTotal = document.getElementById('total-ndf-detalhe'); 
        const elNdfAuditados = document.getElementById('total-ndf-auditados'); 
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        if(btnLimpar) btnLimpar.classList.add('hidden');
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Processando métricas...</div>';

        try {
            // 1. BUSCA DE DADOS (Mantendo a lógica original que funciona)
            const dados = await this.buscarTudoPaginado(uid, inicio, fim);
            this.dadosBrutosCache = dados;

            // --- REGRAS DE NEGÓCIO ---

            // REGRA BASE: Tem nome de auditora
            const temAuditora = (d) => d.auditora_nome && d.auditora_nome.trim() !== '';
            // REGRA DOCUMENTO: Começa com DOC_NDF_
            const isDocNdf = (d) => (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');

            // 1. Total Geral (Antigo "Erros Validados")
            const listaValidados = dados.filter(d => temAuditora(d));
            
            // 2. Erros Doc. Gupy (Antigo "Erros Gupy") - Não é NDF
            const listaGupy = listaValidados.filter(d => !isDocNdf(d));

            // 3. Erros NDF (Antigo "Total NDF")
            const listaNdf = listaValidados.filter(d => isDocNdf(d));

            // 4. Erros Empresa (Antigo "NDF Auditados")
            // A regra original considerava DOC_NDF_OUTROS como o item desse card
            const listaNdfOutros = listaValidados.filter(d => (d.tipo_documento || '').toUpperCase() === 'DOC_NDF_OUTROS');

            // --- ATUALIZAÇÃO DOS CONTADORES (CARDS) ---
            if(elErrosValidados) elErrosValidados.innerText = listaValidados.length;
            if(elErrosGupy) elErrosGupy.innerText = listaGupy.length; 
            if(elNdfTotal) elNdfTotal.innerText = listaNdf.length;
            if(elNdfAuditados) elNdfAuditados.innerText = listaNdfOutros.length;

            // --- RENDERIZAÇÃO DO FEED E GRÁFICO ---
            if (listaValidados.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            // Inicializa com a visão padrão
            this.mudarVisao(this.visaoAtual); 

        } catch (err) {
            console.error("Erro Comparativo:", err);
            if(containerFeed) containerFeed.innerHTML = `<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard: ${err.message}</div>`;
        }
    },

    // Retorna o nome amigável se existir, senão o técnico
    getFriendlyName: function(technicalName) {
        if (!technicalName) return 'Sem Nome';
        return FRIENDLY_NAMES_MAP[technicalName] || technicalName;
    },

    // Auxiliar para identificar visualmente
    isNDF: function(d) {
        return (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');
    },

    getDocType: function(d) {
        if (this.isNDF(d)) {
            return d.tipo_documento || "DOC_NDF_GENERICO";
        }
        return d.doc_name || d.nome_documento || 'Documento Gupy';
    },

    filtrarPorBusca: function(texto) {
        if (!texto || texto.trim() === '') {
            this.limparFiltro(true);
            return;
        }
        const termo = texto.toLowerCase();
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        
        const filtrados = base.filter(d => {
            const nome = (d.doc_name || '').toLowerCase();
            const tipoTecnico = (this.getDocType(d) || '');
            const tipoAmigavel = this.getFriendlyName(tipoTecnico).toLowerCase(); // Busca pelo nome amigável
            const obs = (d.observacao || d.obs || d.apontamentos || '').toLowerCase();
            const emp = (d.empresa || d.empresa_nome || '').toLowerCase();
            
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

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.innerText = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        // Recarrega o gráfico com a visão atual
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
        
        // Base: Apenas auditados
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        let filtrados = base;
        
        if (novaVisao === 'ndf') {
            filtrados = base.filter(d => this.isNDF(d));
        } else if (novaVisao === 'doc') {
            filtrados = base;
        }
        // Visão 'empresa' mantém a base toda, mas agrupa por empresa no gráfico
        
        this.atualizarGrafico(filtrados);
        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
    },

    filtrarPorSelecao: function(valorAmigavel) {
        // O valor que vem do clique no gráfico já é o "Amigável".
        // Precisamos filtrar encontrando itens que correspondam a esse nome.
        
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        let filtrados = [];
        
        if (this.visaoAtual === 'empresa') {
            filtrados = base.filter(d => {
                const emp = d.empresa || d.empresa_nome || 'Desconhecida';
                return emp === valorAmigavel || emp.includes(valorAmigavel.replace('...', ''));
            });
        } else {
            // Para NDF e DOC, comparamos o tipo traduzido
            filtrados = base.filter(d => {
                const tipoTecnico = this.visaoAtual === 'ndf' ? (d.tipo_documento || '') : this.getDocType(d);
                const nomeAmigavelItem = this.getFriendlyName(tipoTecnico);
                
                // Compara com o valor clicado (que pode ter reticências)
                return nomeAmigavelItem === valorAmigavel || nomeAmigavelItem.includes(valorAmigavel.replace('...', ''));
            });
        }
        
        this.aplicarFiltroVisual(filtrados, valorAmigavel);
    },

    atualizarGrafico: function(dadosParaGrafico) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();

        const agrupamento = {};
        
        dadosParaGrafico.forEach(item => {
            let chave = 'Outros';
            
            if (this.visaoAtual === 'empresa') {
                chave = item.empresa || item.empresa_nome || 'Desconhecida';
            } else if (this.visaoAtual === 'ndf') {
                // Pega código técnico e traduz
                const codigoTecnico = item.tipo_documento || item.doc_name || 'Sem Nome';
                chave = this.getFriendlyName(codigoTecnico);
            } else {
                // Visão Geral (Doc)
                const codigoTecnico = this.getDocType(item);
                chave = this.getFriendlyName(codigoTecnico);
            }
            
            // Trunca nome longo
            if(chave.length > 28) chave = chave.substring(0, 26) + '...';
            
            if (!agrupamento[chave]) agrupamento[chave] = 0;
            agrupamento[chave]++;
        });

        let dadosGrafico = Object.entries(agrupamento).sort((a, b) => b[1] - a[1]);
        if (!this.mostrarTodos) dadosGrafico = dadosGrafico.slice(0, 5);

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
        
        // Limpa input de busca se existir
        const inputBusca = document.querySelector('#ma-tab-comparativo input');
        if(inputBusca) inputBusca.value = '';

        if (renderizar) this.mudarVisao(this.visaoAtual); // Reseta para a visão atual completa
    },

    renderizarFeed: function(lista, container) {
        if(!container) return;
        if (lista.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum registro encontrado.</div>';
            return;
        }
        
        lista.sort((a, b) => new Date(b.data_referencia || 0) - new Date(a.data_referencia || 0));
        
        let html = '';
        lista.forEach(doc => {
            const data = doc.data_referencia ? new Date(doc.data_referencia).toLocaleDateString('pt-BR') : '-';
            const nomeDocumentoOriginal = doc.doc_name || 'Sem Nome';
            const tipoTecnico = this.getDocType(doc);
            
            // Aqui aplicamos o nome amigável para exibição
            const subtitulo = this.getFriendlyName(tipoTecnico);
            
            const empresa = doc.empresa || doc.empresa_nome || '';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            
            let badgeClass = 'bg-slate-100 text-slate-600';
            let badgeText = 'AUDIT';
            
            if (isNdf) {
                badgeClass = 'bg-amber-100 text-amber-700';
                badgeText = 'NDF';
            } else {
                const qtd = Number(doc.qtd_nok || 0);
                const status = (doc.status || '').toUpperCase();
                if (qtd > 0 || status.includes('NOK')) {
                    badgeClass = 'bg-rose-50 text-rose-600';
                    badgeText = 'NOK';
                } else {
                    badgeClass = 'bg-emerald-50 text-emerald-600';
                    badgeText = 'OK';
                }
            }

            const borderClass = isNdf ? 'border-l-amber-500' : (badgeText === 'NOK' ? 'border-l-rose-500' : 'border-l-emerald-500');
            const assistenteInfo = (!MinhaArea.getUsuarioAlvo()) ? `<span class="block text-[9px] text-blue-500 font-bold mt-1">👤 ${doc.assistente_nome || 'Equipe'}</span>` : '';

            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">${data} • ${subtitulo} ${empresa ? '• ' + empresa : ''}</span>
                        <h4 class="font-bold text-slate-700 text-sm leading-tight group-hover:text-rose-600 transition">${nomeDocumentoOriginal}</h4>
                        ${assistenteInfo}
                    </div>
                    <div class="${badgeClass} text-[10px] font-bold px-2 py-1 rounded border border-white shadow-sm">${badgeText}</div>
                </div>
                <div class="bg-slate-50 p-3 rounded text-xs text-slate-600 italic border border-slate-100"><i class="fas fa-quote-left text-slate-300 mr-1"></i> ${obs}</div>
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
        
        let barColor = '#f43f5e'; // Rose (Padrão/Geral)
        if (this.visaoAtual === 'empresa') barColor = '#3b82f6'; // Blue
        if (this.visaoAtual === 'ndf') barColor = '#d97706'; // Amber

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
                        ticks: { stepSize: 1, font: { size: 10 } } 
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
        
        while(continuar) {
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .range(page*1000, (page+1)*1000-1);

            if (uid) query = query.eq('usuario_id', uid);

            const { data, error } = await query;
            if(error) throw error;
            
            todos = todos.concat(data);
            if(data.length < 1000) continuar = false;
            else page++;
        }
        return todos;
    }
};