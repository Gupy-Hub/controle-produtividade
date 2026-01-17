MinhaArea.Comparativo = {
    chartOfensores: null,

    carregar: async function() {
        console.log("🚀 UX Dashboard (Assertividade): Iniciando...");
        const uid = MinhaArea.getUsuarioAlvo();
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        const containerTotal = document.getElementById('total-nok-detalhe');
        
        // Proteção contra container não encontrado
        if(!containerFeed) { console.error("Container do feed não encontrado!"); return; }

        containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Analisando dados...</div>';

        try {
            // 1. Buscar Dados (Paginação Robusta)
            const dados = await this.buscarAuditoriasPaginadas(uid, inicio, fim);
            console.log(`📦 Dados baixados para detalhamento: ${dados.length}`);

            // 2. Filtrar apenas NOKs (Gestão por Exceção)
            // Lógica dupla: verifica qtd_nok (número) ou nok (se vier string do CSV)
            const noks = dados.filter(d => {
                const qtd = Number(d.qtd_nok || 0);
                const isNokStatus = (d.status || '').toUpperCase() === 'NOK';
                // Consideramos NOK se tiver quantidade > 0 OU se o status for NOK
                return qtd > 0 || isNokStatus;
            });
            
            if(containerTotal) containerTotal.innerText = noks.length;

            if (noks.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                return;
            }

            // 3. Processar Dados para o Gráfico (Top Ofensores)
            const ofensores = {};
            noks.forEach(item => {
                const tipo = item.nome_documento || 'Outros'; 
                if (!ofensores[tipo]) ofensores[tipo] = 0;
                ofensores[tipo]++;
            });

            const topOfensores = Object.entries(ofensores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // 4. Renderizar Gráfico e Feed
            this.renderizarGraficoOfensores(topOfensores);
            
            noks.sort((a, b) => new Date(b.data_auditoria) - new Date(a.data_auditoria));
            this.renderizarFeed(noks, containerFeed);

        } catch (err) {
            console.error("Erro no detalhamento:", err);
            containerFeed.innerHTML = '<div class="text-rose-500 text-center py-8">Erro ao carregar dashboard.</div>';
        }
    },

    renderizarFeed: function(listaNok, container) {
        let html = '';
        
        listaNok.forEach(doc => {
            const data = doc.data_auditoria ? new Date(doc.data_auditoria).toLocaleDateString('pt-BR') : '-';
            const nome = doc.doc_name || 'Sem Nome';
            const tipo = doc.nome_documento || 'Geral';
            // Prioridade de campos para achar a observação
            const obs = doc.observacao || doc.obs || doc.apontamentos || 'Sem observação registrada.';
            
            html += `
            <div class="bg-white p-4 rounded-lg border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition border border-slate-100 group">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                            ${data} • ${tipo}
                        </span>
                        <h4 class="font-bold text-slate-700 text-sm leading-tight group-hover:text-rose-600 transition">
                            ${nome}
                        </h4>
                    </div>
                    <div class="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-1 rounded border border-rose-100">
                        NOK
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

        this.chartOfensores = new Chart(ctx, {
            type: 'bar', 
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reprovações',
                    data: values,
                    backgroundColor: '#f43f5e', 
                    borderRadius: 4,
                    barThickness: 20
                }]
            },
            options: {
                indexAxis: 'y', 
                responsive: true,
                maintainAspectRatio: false,
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