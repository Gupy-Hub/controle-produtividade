MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosNoksCache: [], // Cache para filtro

    carregar: async function() {
        console.log("🚀 UX Dashboard (Interativo): Iniciando...");
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
            // 1. Buscar Dados
            const dados = await this.buscarAuditoriasPaginadas(uid, inicio, fim);

            // 2. Filtrar apenas NOKs
            this.dadosNoksCache = dados.filter(d => {
                const qtd = Number(d.qtd_nok || 0);
                const isNokStatus = (d.status || '').toUpperCase() === 'NOK';
                return qtd > 0 || isNokStatus;
            });
            
            // 3. Atualizar Contadores
            if(containerTotal) containerTotal.innerText = this.dadosNoksCache.length;
            
            // Contagem NDF (Se o nome do documento contiver 'NDF')
            const totalNdf = this.dadosNoksCache.filter(d => 
                (d.nome_documento || '').toUpperCase().includes('NDF') || 
                (d.doc_name || '').toUpperCase().includes('NDF')
            ).length;
            
            if(containerNdf) containerNdf.innerText = totalNdf;

            if (this.dadosNoksCache.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            // 4. Processar Gráfico (Top Ofensores)
            const ofensores = {};
            this.dadosNoksCache.forEach(item => {
                const tipo = item.nome_documento || 'Outros'; 
                if (!ofensores[tipo]) ofensores[tipo] = 0;
                ofensores[tipo]++;
            });

            const topOfensores = Object.entries(ofensores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // 5. Renderizar
            this.renderizarGraficoOfensores(topOfensores);
            this.renderizarFeed(this.dadosNoksCache, containerFeed);

        } catch (err) {
            console.error(err);
            if(containerFeed) containerFeed.innerHTML = '<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard.</div>';
        }
    },

    renderizarFeed: function(listaNok, container) {
        if(!container) return;
        
        if (listaNok.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum erro encontrado com este filtro.</div>';
            return;
        }

        // Ordenar por data recente
        listaNok.sort((a, b) => new Date(b.data_auditoria) - new Date(a.data_auditoria));

        let html = '';
        listaNok.forEach(doc => {
            const data = doc.data_auditoria ? new Date(doc.data_auditoria).toLocaleDateString('pt-BR') : '-';
            const nome = doc.doc_name || 'Sem Nome';
            const tipo = doc.nome_documento || 'Geral';
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação registrada.';
            
            // Destaque visual se for NDF
            const isNdf = tipo.toUpperCase().includes('NDF');
            const borderClass = isNdf ? 'border-l-amber-500' : 'border-l-rose-500';
            const badgeClass = isNdf ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-600';
            const badgeText = isNdf ? 'NOK (NDF)' : 'NOK';

            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                            ${data} • ${tipo}
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

        const _this = this; // Referência para o callback

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
                    hoverBackgroundColor: '#be123c' // Cor ao passar o mouse
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
                        _this.filtrarPorTipo(labelClicado);
                    }
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: { 
                        callbacks: {
                            label: (ctx) => ` ${ctx.raw} erros`
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } }
                }
            }
        });
    },

    filtrarPorTipo: function(tipoDocumento) {
        console.log(`Filtro ativado: ${tipoDocumento}`);
        
        // Filtra o cache
        const filtrados = this.dadosNoksCache.filter(d => d.nome_documento === tipoDocumento);
        
        // Atualiza o feed
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(filtrados, container);
        
        // Mostra botão de limpar
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) {
            btn.classList.remove('hidden');
            btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar: ${tipoDocumento}`;
        }
    },

    limparFiltro: function() {
        console.log("Filtro limpo");
        
        // Restaura lista completa
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(this.dadosNoksCache, container);
        
        // Esconde botão
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
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