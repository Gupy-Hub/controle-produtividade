MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosNoksCache: [],
    visaoAtual: 'doc', // 'doc', 'empresa', 'ndf'
    mostrarTodos: false, // Estado do toggle

    carregar: async function() {
        console.log("🚀 UX Dashboard: Iniciando...");
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        const containerTotal = document.getElementById('total-nok-detalhe');
        const containerNdf = document.getElementById('total-ndf-detalhe');
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        // Reset
        if(btnLimpar) btnLimpar.classList.add('hidden');
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Analisando dados...</div>';

        try {
            const dados = await this.buscarAuditoriasPaginadas(uid, inicio, fim);

            // Filtro de NOKs
            this.dadosNoksCache = dados.filter(d => {
                const qtd = Number(d.qtd_nok || 0);
                const isNokStatus = (d.status || '').toUpperCase() === 'NOK';
                return qtd > 0 || isNokStatus;
            });
            
            if(containerTotal) containerTotal.innerText = this.dadosNoksCache.length;
            
            const totalNdf = this.dadosNoksCache.filter(d => this.isNDF(d)).length;
            if(containerNdf) containerNdf.innerText = totalNdf;

            if (this.dadosNoksCache.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            this.atualizarGrafico();
            this.atualizarFeedPorVisao();

        } catch (err) {
            console.error(err);
            if(containerFeed) containerFeed.innerHTML = '<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard.</div>';
        }
    },

    // Nova função para alternar visualização
    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.innerText = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        
        this.atualizarGrafico();
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        const btnDoc = document.getElementById('btn-view-doc');
        const btnEmpresa = document.getElementById('btn-view-empresa');
        const btnNdf = document.getElementById('btn-view-ndf');
        
        const baseClass = "px-3 py-1 text-[10px] font-bold rounded transition ";
        const activeClass = "bg-white text-rose-600 shadow-sm";
        const inactiveClass = "text-slate-500 hover:bg-white";

        btnDoc.className = baseClass + (novaVisao === 'doc' ? activeClass : inactiveClass);
        btnEmpresa.className = baseClass + (novaVisao === 'empresa' ? activeClass : inactiveClass);
        btnNdf.className = baseClass + (novaVisao === 'ndf' ? activeClass : inactiveClass);

        this.limparFiltro(false);
        this.atualizarGrafico();
        this.atualizarFeedPorVisao();
    },

    atualizarGrafico: function() {
        const agrupamento = {};
        let dadosFiltrados = this.dadosNoksCache;

        if (this.visaoAtual === 'ndf') {
            dadosFiltrados = this.dadosNoksCache.filter(d => this.isNDF(d));
        }

        dadosFiltrados.forEach(item => {
            let chave = 'Outros';
            if (this.visaoAtual === 'empresa') {
                chave = item.empresa || item.empresa_nome || 'Desconhecida';
            } else {
                const cat = this.getDocType(item);
                chave = cat;
                if (this.visaoAtual === 'doc' && this.isNDF(item)) {
                    chave = 'NDF (Geral)';
                }
            }
            if(chave.length > 25) chave = chave.substring(0, 22) + '...';
            if (!agrupamento[chave]) agrupamento[chave] = 0;
            agrupamento[chave]++;
        });

        // Atualiza total com base no filtro
        const containerTotal = document.getElementById('total-nok-detalhe');
        if(containerTotal) containerTotal.innerText = dadosFiltrados.length;

        // Ordenação e Slice (Top 5 vs Todos)
        let dadosGrafico = Object.entries(agrupamento).sort((a, b) => b[1] - a[1]);
        
        if (!this.mostrarTodos) {
            dadosGrafico = dadosGrafico.slice(0, 5);
        }

        this.renderizarGraficoOfensores(dadosGrafico);
    },

    atualizarFeedPorVisao: function() {
        const container = document.getElementById('feed-erros-container');
        let lista = this.dadosNoksCache;
        if (this.visaoAtual === 'ndf') {
            lista = this.dadosNoksCache.filter(d => this.isNDF(d));
        }
        this.renderizarFeed(lista, container);
    },

    filtrarPorSelecao: function(valor) {
        let filtrados = [];
        if (this.visaoAtual === 'empresa') {
            filtrados = this.dadosNoksCache.filter(d => {
                const emp = d.empresa || d.empresa_nome || 'Desconhecida';
                return emp.includes(valor.replace('...', ''));
            });
        } else {
            filtrados = this.dadosNoksCache.filter(d => {
                if (valor === 'NDF (Geral)') return this.isNDF(d);
                const tipo = this.getDocType(d);
                return tipo.includes(valor.replace('...', ''));
            });
        }
        this.aplicarFiltroVisual(filtrados, valor);
    },

    aplicarFiltroVisual: function(lista, nomeFiltro) {
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(lista, container);
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) {
            btn.classList.remove('hidden');
            btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar: ${nomeFiltro}`;
        }
    },

    limparFiltro: function(renderizar = true) {
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
        if (renderizar) this.atualizarFeedPorVisao();
    },

    renderizarFeed: function(listaNok, container) {
        if(!container) return;
        if (listaNok.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum erro encontrado nesta visão.</div>';
            return;
        }
        listaNok.sort((a, b) => new Date(b.data_auditoria) - new Date(a.data_auditoria));
        let html = '';
        listaNok.forEach(doc => {
            const data = doc.data_auditoria ? new Date(doc.data_auditoria).toLocaleDateString('pt-BR') : '-';
            const nome = doc.doc_name || 'Sem Nome';
            const tipo = this.getDocType(doc);
            const empresa = doc.empresa || doc.empresa_nome || '';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            const borderClass = isNdf ? 'border-l-amber-500' : 'border-l-rose-500';
            const badgeClass = isNdf ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-600';
            const badgeText = isNdf ? 'NDF' : 'NOK';

            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                            ${data} • ${tipo} ${empresa ? '• ' + empresa : ''}
                        </span>
                        <h4 class="font-bold text-slate-700 text-sm leading-tight group-hover:text-rose-600 transition">${nome}</h4>
                    </div>
                    <div class="${badgeClass} text-[10px] font-bold px-2 py-1 rounded border border-white shadow-sm">${badgeText}</div>
                </div>
                <div class="bg-slate-50 p-3 rounded text-xs text-slate-600 italic border border-slate-100">
                    <i class="fas fa-quote-left text-slate-300 mr-1"></i> ${obs}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    },

    getDocType: function(d) {
        // Tenta pegar a coluna DOCUMENTO original, ou fallback para doc_name
        return d.nome_documento || d.documento || d.doc_name || 'Geral';
    },

    isNDF: function(d) {
        const tipo = this.getDocType(d).toUpperCase();
        return tipo.startsWith('DOC_NDF') || tipo.includes('NDF');
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
                    label: 'Reprovações',
                    data: values,
                    backgroundColor: barColor,
                    borderRadius: 4,
                    barThickness: 20,
                    hoverBackgroundColor: '#be123c'
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
                    x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } }
                }
            }
        });
    },

    renderizarVazio: function(container) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-center p-8"><div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 text-emerald-500"><i class="fas fa-trophy text-3xl"></i></div><h3 class="text-lg font-bold text-slate-700">Parabéns!</h3><p class="text-sm text-slate-500">Nenhum erro encontrado neste período.</p></div>';
    },

    renderizarGraficoVazio: function() {
        const ctx = document.getElementById('graficoTopOfensores');
        if (ctx && this.chartOfensores) this.chartOfensores.destroy();
    },

    buscarAuditoriasPaginadas: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        let continuar = true;
        while(continuar) {
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_auditoria', inicio)
                .lte('data_auditoria', fim)
                .neq('auditora', null)
                .neq('auditora', '')
                .range(page*1000, (page+1)*1000-1);
            
            if(error) throw error;
            todos = todos.concat(data);
            if(data.length < 1000) continuar = false;
            else page++;
        }
        return todos;
    }
};