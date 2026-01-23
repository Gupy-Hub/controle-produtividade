/* ARQUIVO: js/minha_area/comparativo.js
   DESCRIÇÃO: Engine de Assertividade (Correção: Coluna tipo_documento)
*/

MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosBrutosCache: [], // Cache de todos os dados
    visaoAtual: 'doc', 
    mostrarTodos: false,

    // REGRAS DE NEGÓCIO: Códigos Oficiais NDF
    codigosNdfOficiais: [
        'DOC_NDF_100%',
        'DOC_NDF_CATEGORIA PROFISSIONAL',
        'DOC_NDF_DEPENDENTE',
        'DOC_NDF_ESTADO CIVIL',
        'DOC_NDF_ESTRANGEIRO',
        'DOC_NDF_LAUDO',
        'DOC_NDF_OUTROS'
    ],

    // Fallback para visualização
    listaNdfConhecidos: [
        'Comprovante de escolaridade', 'Dados Bancários', 'Contrato de Aprendizagem', 
        'Laudo Caracterizador de Deficiência', 'Certificados Complementares', 
        'Registro Órgão de Classe', 'Regularização do Conselho Profissional', 
        'Certificado de Curso Técnico', 'Foto para Crachá', 'Informações para agendamento do ASO', 
        'Declaração de Imposto de Renda', 'Passaporte', 'Visto Brasileiro para estrangeiros', 
        'Contato de Emergência', 'CNH do Cônjuge', 'Visto', 'Formulário Allya', 
        'Cartão de Vacinação', 'Dados Bancários - Santander', 'Escolaridade', 
        'Cartão de Transporte', 'Curso ou certificação', 'Vale Transporte - Roteiro',
        'ASO - Atestado de Saúde Ocupacional', 'Laudo MTE', 'Imposto de Renda', 
        'Multiplos vínculos', 'Registro de Identificação Civil - RIC', 
        'Diploma, Declaração ou Histórico Escolar', 'Tamanho de Uniforme', 
        'Reservista (Acima de 45 anos)', 'Comprovante de Ensino Médio', 
        'Certidão de Prontuário da CNH', 'Tipo de Conta Bancária', 
        'Certidão Negativa do Conselho Regional', 'Carteira de vacinação atualizada',
        'Declaração de Residência', 'Informações Complementares', 'Carta Proposta',
        'CPF Mãe', 'Registro Administrativo de Nascimento de Indígena'
    ],

    carregar: async function() {
        console.log("🚀 UX Dashboard: Iniciando...");
        const uid = MinhaArea.getUsuarioAlvo();
        
        if (!uid && !MinhaArea.isAdmin()) return;

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
            // Busca TUDO do período
            const dados = await this.buscarTudoPaginado(uid, inicio, fim);
            this.dadosBrutosCache = dados;

            // --- REGRAS DE NEGÓCIO ESTRITAS (Baseado na Análise Jan/2026) ---

            // REGRA BASE: Tem nome de auditora
            const temAuditora = (d) => d.auditora_nome && d.auditora_nome.trim() !== '';

            // REGRA DOCUMENTO: Começa com DOC_NDF_ (Usando a coluna CORRETA: tipo_documento)
            const isDocNdf = (d) => (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');

            // 1. Total de Erros Validados
            // Lógica: Todos que tem Nome da Auditora
            const listaValidados = dados.filter(d => temAuditora(d));
            
            // 2. Total de erros Gupy
            // Lógica: Tem Auditora MAS NÃO TEM Doc_NDF_
            const listaGupy = listaValidados.filter(d => !isDocNdf(d));

            // 3. Total de Erros NDF
            // Lógica: Tem Auditora E TEM Doc_NDF_
            const listaNdf = listaValidados.filter(d => isDocNdf(d));

            // 4. Erros NDF Auditados (Card Específico)
            // Lógica: Tem Auditora E apenas os que tem DOC_NDF_OUTROS (Usando tipo_documento)
            const listaNdfOutros = listaValidados.filter(d => (d.tipo_documento || '').toUpperCase() === 'DOC_NDF_OUTROS');

            // --- ATUALIZAÇÃO DOS CARDS ---
            if(elErrosValidados) elErrosValidados.innerText = listaValidados.length;
            if(elErrosGupy) elErrosGupy.innerText = listaGupy.length; 
            if(elNdfTotal) elNdfTotal.innerText = listaNdf.length;
            if(elNdfAuditados) elNdfAuditados.innerText = listaNdfOutros.length;

            // --- FEED E GRÁFICO ---
            // O Feed mostra por padrão a lista de Validados (Universo Base)
            if (listaValidados.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            this.atualizarGrafico(listaValidados);
            this.renderizarFeed(listaValidados, containerFeed);

        } catch (err) {
            console.error("Erro Comparativo:", err);
            if(containerFeed) containerFeed.innerHTML = `<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard: ${err.message}</div>`;
        }
    },

    // Auxiliar para identificar visualmente no Feed/Gráfico
    isNDF: function(d) {
        return (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');
    },

    getDocType: function(d) {
        if (this.isNDF(d)) {
            // Se for NDF, retorna o nome técnico da coluna tipo_documento
            return d.tipo_documento || "DOC_NDF_GENERICO";
        }
        // Se for Gupy, retorna o nome amigável do documento
        return d.doc_name || d.nome_documento || 'Documento Gupy';
    },

    filtrarPorBusca: function(texto) {
        if (!texto || texto.trim() === '') {
            this.limparFiltro(true);
            return;
        }
        const termo = texto.toLowerCase();
        // Filtra sobre o universo auditado para manter consistência
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        
        const filtrados = base.filter(d => {
            const nome = (d.doc_name || '').toLowerCase();
            const tipo = (this.getDocType(d) || '').toLowerCase();
            const obs = (d.observacao || d.obs || d.apontamentos || '').toLowerCase();
            const emp = (d.empresa || d.empresa_nome || '').toLowerCase();
            const docOficial = (d.tipo_documento || '').toLowerCase();
            
            return nome.includes(termo) || tipo.includes(termo) || obs.includes(termo) || emp.includes(termo) || docOficial.includes(termo);
        });

        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar Busca`; }
    },

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.innerText = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        this.atualizarGrafico(this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== ''));
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
        
        // Reaplica o filtro base (Auditados) e a visão
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        let filtrados = base;
        
        if (novaVisao === 'ndf') {
            filtrados = base.filter(d => this.isNDF(d));
        } else if (novaVisao === 'doc') {
            // Em 'doc', mostramos tudo (Gupy + NDF)
            filtrados = base;
        }
        
        this.atualizarGrafico(filtrados);
        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
    },

    filtrarPorSelecao: function(valor) {
        const container = document.getElementById('feed-erros-container');
        // Sempre trabalha sobre a base auditada
        const base = this.dadosBrutosCache.filter(d => d.auditora_nome && d.auditora_nome.trim() !== '');
        let filtrados = [];
        
        if (this.visaoAtual === 'empresa') {
            filtrados = base.filter(d => {
                const emp = d.empresa || d.empresa_nome || 'Desconhecida';
                return emp.includes(valor.replace('...', ''));
            });
        } else if (this.visaoAtual === 'ndf') {
            filtrados = base.filter(d => {
                if (!this.isNDF(d)) return false;
                const identificador = d.tipo_documento || d.doc_name || 'Sem Nome';
                return identificador.includes(valor.replace('...', ''));
            });
        } else {
            filtrados = base.filter(d => {
                const tipo = this.getDocType(d);
                return tipo.includes(valor.replace('...', ''));
            });
        }
        
        this.aplicarFiltroVisual(filtrados, valor);
    },

    atualizarGrafico: function(dadosParaGrafico) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();

        const agrupamento = {};
        
        dadosParaGrafico.forEach(item => {
            let chave = 'Outros';
            if (this.visaoAtual === 'empresa') chave = item.empresa || item.empresa_nome || 'Desconhecida';
            else if (this.visaoAtual === 'ndf') {
                // Na visão NDF, usamos o código técnico (tipo_documento)
                chave = item.tipo_documento || item.doc_name || 'Sem Nome';
            }
            else chave = this.getDocType(item);
            
            if(chave.length > 25) chave = chave.substring(0, 22) + '...';
            
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
        if (renderizar) this.carregar();
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
            const nome = doc.doc_name || 'Sem Nome';
            const tipo = this.getDocType(doc);
            const empresa = doc.empresa || doc.empresa_nome || '';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            const docOficial = doc.tipo_documento || '';
            
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
            const subtitulo = isNdf && docOficial ? docOficial : `${tipo}`;
            const assistenteInfo = (!MinhaArea.getUsuarioAlvo()) ? `<span class="block text-[9px] text-blue-500 font-bold mt-1">👤 ${doc.assistente_nome || 'Equipe'}</span>` : '';

            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">${data} • ${subtitulo} ${empresa ? '• ' + empresa : ''}</span>
                        <h4 class="font-bold text-slate-700 text-sm leading-tight group-hover:text-rose-600 transition">${nome}</h4>
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
        let barColor = '#f43f5e'; 
        if (this.visaoAtual === 'empresa') barColor = '#3b82f6';
        if (this.visaoAtual === 'ndf') barColor = '#d97706';
        this.chartOfensores = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Ocorrências', data: values, backgroundColor: barColor, borderRadius: 4, barThickness: 20, hoverBackgroundColor: '#be123c' }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                onClick: (e, elements) => { if (elements.length > 0) { const index = elements[0].index; _this.filtrarPorSelecao(labels[index]); } },
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } } }
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