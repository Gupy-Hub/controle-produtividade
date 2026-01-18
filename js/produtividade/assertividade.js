// Namespace global
window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    chartEvolucao: null,
    chartRanking: null,

    init: function() {
        console.log("Produtividade > Assertividade: Init");
        this.carregar();
    },

    // --- FUNÇÃO QUE FALTAVA (Correção do Erro) ---
    // Chamada pelo geral.js para formatar a célula na tabela principal
    renderizarCelula: function(valor) {
        // Trata input
        let valNum = 0;
        if (typeof valor === 'number') valNum = valor;
        else if (typeof valor === 'string') valNum = parseFloat(valor.replace('%','').replace(',','.'));
        
        if (isNaN(valNum)) valNum = 0;

        // Lógica de Cores (Meta padrão 98%)
        let classeCor = 'bg-rose-100 text-rose-700 border-rose-200';
        let icone = '<i class="fas fa-times-circle"></i>';

        if (valNum >= 98) {
            classeCor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
            icone = '<i class="fas fa-check-circle"></i>';
        } else if (valNum >= 95) {
            classeCor = 'bg-amber-100 text-amber-700 border-amber-200';
            icone = '<i class="fas fa-exclamation-circle"></i>';
        }

        return `
            <div class="flex items-center justify-center">
                <span class="${classeCor} border px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                    ${icone} ${valNum.toFixed(2)}%
                </span>
            </div>
        `;
    },

    carregar: async function() {
        // 1. Pega datas do filtro global
        const datas = Sistema.getPeriodo();
        
        const containerKPI = document.getElementById('kpi-assertividade-container');
        
        if(containerKPI) containerKPI.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-500"></i> Carregando dados...</div>';

        try {
            // 2. Busca no Supabase
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*')
                .gte('data_auditoria', datas.inicio)
                .lte('data_auditoria', datas.fim);

            if (error) throw error;

            if (!data || data.length === 0) {
                this.renderizarVazio();
                return;
            }

            // 3. Processamento
            const stats = this.processarDados(data);

            // 4. Renderiza Componentes Internos (Aba Detalhada)
            this.renderizarKPIs(stats);
            this.renderizarGraficoEvolucao(stats.porDia);
            this.renderizarGraficoRanking(stats.porAssistente);
            this.renderizarTabelaDetalhada(stats.listaCompleta);

        } catch (erro) {
            console.error("Erro ao carregar assertividade:", erro);
            if(containerKPI) containerKPI.innerHTML = '<div class="text-red-500 p-4">Erro ao carregar dados.</div>';
        }
    },

    processarDados: function(dados) {
        let totalDocs = 0;
        let totalCampos = 0;
        let totalErros = 0;
        let somaPorcentagem = 0;
        
        const porDia = {};
        const porAssistente = {};

        dados.forEach(item => {
            // Tratamento de nulos e strings
            const nNok = Number(item.qtd_nok || item.nok || 0);
            const nOk = Number(item.qtd_ok || item.ok || 0);
            const nCampos = Number(item.num_campos || item.campos || (nOk + nNok));
            
            let pct = 0;
            if (item.porcentagem !== undefined && item.porcentagem !== null) {
                if (typeof item.porcentagem === 'string') {
                    pct = parseFloat(item.porcentagem.replace('%','').replace(',','.'));
                } else {
                    pct = Number(item.porcentagem);
                }
            } else {
                pct = nCampos > 0 ? ((nCampos - nNok) / nCampos) * 100 : 100;
            }

            totalDocs++;
            totalCampos += nCampos;
            totalErros += nNok;
            somaPorcentagem += pct;

            // Data
            let dia = 'N/A';
            if (item.data_auditoria) {
                const dataIso = item.data_auditoria.split('T')[0]; 
                const partes = dataIso.split('-'); 
                if (partes.length === 3) {
                    dia = `${partes[2]}/${partes[1]}`;
                }
            }

            // Agrupamento Dia
            if (!porDia[dia]) porDia[dia] = { total: 0, erros: 0, somaPct: 0, docs: 0 };
            porDia[dia].total += nCampos;
            porDia[dia].erros += nNok;
            porDia[dia].somaPct += pct;
            porDia[dia].docs++;

            // Agrupamento Assistente
            const nomeAssistente = item.nome_assistente || item.assistente || 'Desconhecido';
            if (!porAssistente[nomeAssistente]) porAssistente[nomeAssistente] = { docs: 0, erros: 0, somaPct: 0 };
            porAssistente[nomeAssistente].docs++;
            porAssistente[nomeAssistente].erros += nNok;
            porAssistente[nomeAssistente].somaPct += pct;
        });

        const mediaGeral = totalDocs > 0 ? (somaPorcentagem / totalDocs).toFixed(2) : 0;

        return {
            totalDocs,
            totalCampos,
            totalErros,
            mediaGeral,
            porDia,
            porAssistente,
            listaCompleta: dados
        };
    },

    renderizarKPIs: function(stats) {
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.innerText = val;
        };

        setTxt('kpi-assert-docs', stats.totalDocs);
        setTxt('kpi-assert-erros', stats.totalErros);
        setTxt('kpi-assert-media', stats.mediaGeral + '%');
        
        const elMedia = document.getElementById('kpi-assert-media');
        if(elMedia) {
            elMedia.className = parseFloat(stats.mediaGeral) >= 98 
                ? "text-3xl font-bold text-emerald-600" 
                : "text-3xl font-bold text-rose-600";
        }
    },

    renderizarGraficoEvolucao: function(dadosPorDia) {
        const ctx = document.getElementById('chart-evolucao-assertividade');
        if (!ctx) return;

        if (this.chartEvolucao) this.chartEvolucao.destroy();

        const labels = Object.keys(dadosPorDia).sort((a,b) => {
            const [d1, m1] = a.split('/');
            const [d2, m2] = b.split('/');
            return new Date(2025, m1-1, d1) - new Date(2025, m2-1, d2);
        });

        const data = labels.map(dia => {
            const d = dadosPorDia[dia];
            return (d.somaPct / d.docs).toFixed(2);
        });

        this.chartEvolucao = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Assertividade Média (%)',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { min: 80, max: 100 } }
            }
        });
    },

    renderizarGraficoRanking: function(dadosPorAssistente) {
        const ctx = document.getElementById('chart-ranking-assertividade');
        if (!ctx) return;

        if (this.chartRanking) this.chartRanking.destroy();

        const ranking = Object.entries(dadosPorAssistente)
            .map(([nome, d]) => ({
                nome,
                media: (d.somaPct / d.docs).toFixed(2)
            }))
            .sort((a, b) => b.media - a.media)
            .slice(0, 10);

        this.chartRanking = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ranking.map(r => r.nome),
                datasets: [{
                    label: 'Assertividade (%)',
                    data: ranking.map(r => r.media),
                    backgroundColor: ranking.map(r => r.media < 95 ? '#f43f5e' : '#3b82f6'),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { min: 90, max: 100 } }
            }
        });
    },

    renderizarVazio: function() {
        ['kpi-assert-docs', 'kpi-assert-erros', 'kpi-assert-media'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = '-';
        });
        if (this.chartEvolucao) this.chartEvolucao.destroy();
        if (this.chartRanking) this.chartRanking.destroy();
    },
    
    renderizarTabelaDetalhada: function(lista) {
        const tbody = document.getElementById('tabela-assertividade-body');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        
        // Filtra erros
        const erros = lista
            .filter(d => (Number(d.qtd_nok) > 0 || String(d.status) === 'NOK'))
            .sort((a,b) => new Date(b.data_auditoria) - new Date(a.data_auditoria))
            .slice(0, 20);

        if(erros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhum erro encontrado no período.</td></tr>';
            return;
        }

        let html = '';
        erros.forEach(row => {
            const dataFmt = row.data_auditoria ? row.data_auditoria.split('-').reverse().join('/') : '-';
            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="py-2 px-3 text-xs font-bold text-slate-700">${dataFmt}</td>
                    <td class="py-2 px-3 text-xs text-slate-600">${row.nome_assistente || row.assistente}</td>
                    <td class="py-2 px-3 text-xs text-slate-600 truncate max-w-[200px]" title="${row.doc_name}">${row.doc_name}</td>
                    <td class="py-2 px-3 text-center"><span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded">NOK</span></td>
                    <td class="py-2 px-3 text-xs text-slate-500 italic truncate max-w-[200px]" title="${row.obs}">${row.obs || '-'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }
};