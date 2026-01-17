MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosNoksCache: [],
    visaoAtual: 'doc', // 'doc' ou 'empresa'

    carregar: async function() {
        console.log("🚀 UX Dashboard: Iniciando...");
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        const containerTotal = document.getElementById('total-nok-detalhe');
        const containerNdf = document.getElementById('total-ndf-detalhe');
        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        // Reset da interface
        if(btnLimpar) btnLimpar.classList.add('hidden');
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Analisando dados...</div>';

        try {
            // 1. Buscar Dados (Paginada)
            const dados = await this.buscarAuditoriasPaginadas(uid, inicio, fim);

            // 2. Filtrar apenas NOKs
            this.dadosNoksCache = dados.filter(d => {
                const qtd = Number(d.qtd_nok || 0);
                const isNokStatus = (d.status || '').toUpperCase() === 'NOK';
                return qtd > 0 || isNokStatus;
            });
            
            // 3. Atualizar Contadores
            if(containerTotal) containerTotal.innerText = this.dadosNoksCache.length;
            
            // Contagem NDF (Inicia com "DOC_NDF_")
            const totalNdf = this.dadosNoksCache.filter(d => 
                (d.nome_documento || '').toUpperCase().startsWith('DOC_NDF_')
            ).length;
            
            if(containerNdf) containerNdf.innerText = totalNdf;

            if (this.dadosNoksCache.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            // 4. Renderizar Gráfico e Feed Inicial
            this.atualizarGrafico();
            this.renderizarFeed(this.dadosNoksCache, containerFeed);

        } catch (err) {
            console.error(err);
            if(containerFeed) containerFeed.innerHTML = '<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard.</div>';
        }
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        const btnDoc = document.getElementById('btn-view-doc');
        const btnEmpresa = document.getElementById('btn-view-empresa');
        
        if (novaVisao === 'doc') {
            btnDoc.className = "px-3 py-1 text-[10px] font-bold rounded bg-white text-rose-600 shadow-sm transition";
            btnEmpresa.className = "px-3 py-1 text-[10px] font-bold rounded text-slate-500 hover:bg-white transition";
        } else {
            btnDoc.className = "px-3 py-1 text-[10px] font-bold rounded text-slate-500 hover:bg-white transition";
            btnEmpresa.className = "px-3 py-1 text-[10px] font-bold rounded bg-white text-rose-600 shadow-sm transition";
        }

        this.atualizarGrafico();
    },

    atualizarGrafico: function() {
        const agrupamento = {};
        
        this.dadosNoksCache.forEach(item => {
            let chave = 'Outros';
            if (this.visaoAtual === 'doc') {
                // Tenta pegar o nome amigável se for NDF, ou a categoria normal
                const cat = item.nome_documento || 'Geral';
                chave = cat.startsWith('DOC_NDF_') ? 'NDF (Outros)' : cat;
                
                // Se for muito longo, trunca
                if(chave.length > 25) chave = chave.substring(0, 22) + '...';
            } else {
                chave = item.empresa || item.empresa_nome || 'Desconhecida';
            }
            
            if (!agrupamento[chave]) agrupamento[chave] = 0;
            agrupamento[chave]++;
        });

        const topOfensores = Object.entries(agrupamento)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        this.renderizarGraficoOfensores(topOfensores);
    },

    filtrarNdf: function() {
        console.log("Filtrando NDF...");
        const filtrados = this.dadosNoksCache.filter(d => 
            (d.nome_documento || '').toUpperCase().startsWith('DOC_NDF_')
        );
        this.aplicarFiltroVisual(filtrados, "Documentos NDF");
    },

    filtrarPorSelecao: function(valor) {
        const filtrados = this.dadosNoksCache.filter(d => {
            if (this.visaoAtual === 'doc') {
                // Se o valor for "NDF (Outros)", filtra todos os NDFs
                if(valor === 'NDF (Outros)') {
                    return (d.nome_documento || '').toUpperCase().startsWith('DOC_NDF_');
                }
                const cat = d.nome_documento || 'Geral';
                const catTrunc = cat.length > 25 ? cat.substring(0, 22) + '...' : cat;
                return catTrunc === valor || cat === valor;
            } else {
                return (d.empresa || d.empresa_nome) === valor;
            }
        });
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

    limparFiltro: function() {
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(this.dadosNoksCache, container);
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
    },

    renderizarFeed: function(listaNok, container) {
        if(!container) return;
        
        if (listaNok.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum erro encontrado com este filtro.</div>';
            return;
        }

        listaNok.sort((a, b) => new Date(b.data_auditoria) - new Date(a.data_auditoria));

        let html = '';
        listaNok.forEach(doc => {
            const data = doc.data_auditoria ? new Date(doc.data_auditoria).toLocaleDateString('pt-BR') : '-';
            const nome = doc.doc_name || 'Sem Nome';
            const tipo = doc.nome_documento || 'Geral';
            const empresa = doc.empresa || doc.empresa_nome || '';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação.';
            
            const isNdf = tipo.toUpperCase().startsWith('DOC_NDF_');
            const borderClass = isNdf ? 'border-l-amber-500' : 'border-l-rose-500';
            const badgeClass = isNdf ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-600';
            const badgeText = isNdf ? 'NOK (NDF)' : 'NOK';

            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                            ${data} • ${tipo} ${empresa ? '• ' + empresa : ''}
                        </span>
                        <h4 class="font-bold text-slate-700 text-sm leading-tight group-hover:text-rose-600 transition">
                            ${nome}
                        </h4>
                    </div>
                    <div class="${badgeClass} text-[10px] font-bold px-2 py-1 rounded border border-white shadow-sm">
                        ${badgeText}
                    </div>
                </div>
                <div class="bg-slate-50 p-3 rounded text-xs text-slate-600 italic border border-slate-100">
                    <i class="fas fa-quote-left text-slate-300 mr-1"></i>
                    ${obs}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    },

    renderizarGraficoOfensores: function(dadosTop5) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;

        if (this.chartOfensores) this.chartOfensores.destroy();

        const labels = dadosTop5.map(d => d[0]);
        const values = dadosTop5.map(d => d[1]);
        const _this = this;

        this.chartOfensores = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reprovações',
                    data: values,
                    backgroundColor: '#f43f5e',
                    borderRadius: 4,
                    barThickness: 25,
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
                        const labelClicado = labels[index];
                        _this.filtrarPorSelecao(labelClicado);
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
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center p-8">
                <div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 text-emerald-500">
                    <i class="fas fa-trophy text-3xl"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-700">Parabéns!</h3>
                <p class="text-sm text-slate-500">Nenhum erro encontrado neste período.</p>
            </div>`;
    },

    renderizarGraficoVazio: function() {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();
    },

    buscarAuditoriasPaginadas: async function(uid, inicio, fim) {
        let todos = [];
        let page = 0;
        const size = 1000;
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
                .range(page * size, (page + 1) * size - 1);

            if(error) throw error;

            todos = todos.concat(data);
            if(data.length < size) continuar = false;
            else page++;
        }
        return todos;
    }
};