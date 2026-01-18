window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    chartEvolucao: null,
    chartRanking: null,

    init: function() {
        console.log("Produtividade > Assertividade: Init");
        this.carregar();
    },

    // Função visual para colorir notas
    renderizarCelula: function(valor) {
        let valNum = 0;
        if (typeof valor === 'number') valNum = valor;
        else if (typeof valor === 'string') valNum = parseFloat(valor.replace('%','').replace(',','.'));
        
        if (isNaN(valNum)) valNum = 0;

        let classeCor = 'bg-rose-100 text-rose-700 border-rose-200';
        let icone = '<i class="fas fa-times-circle"></i>';

        if (valNum >= 98) {
            classeCor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
            icone = '<i class="fas fa-check-circle"></i>';
        } else if (valNum >= 95) {
            classeCor = 'bg-amber-100 text-amber-700 border-amber-200';
            icone = '<i class="fas fa-exclamation-circle"></i>';
        }

        return `<div class="flex items-center justify-center"><span class="${classeCor} border px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">${icone} ${valNum.toFixed(2)}%</span></div>`;
    },

    carregar: async function() {
        const datas = Sistema.getPeriodo();
        const containerKPI = document.getElementById('kpi-assertividade-container');
        
        if(containerKPI) containerKPI.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-500"></i> Analisando produção...</div>';

        try {
            // CORREÇÃO 1: Filtrar pela DATA DE PRODUÇÃO (data_referencia/end_time)
            // Isso garante que peguemos o dia que a pessoa trabalhou (01/12), não quando foi auditado.
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*')
                .gte('data_referencia', `${datas.inicio}T00:00:00`)
                .lte('data_referencia', `${datas.fim}T23:59:59`);

            if (error) throw error;

            if (!data || data.length === 0) {
                this.renderizarVazio();
                return;
            }

            const stats = this.processarDados(data);

            this.renderizarKPIs(stats);
            this.renderizarGraficoEvolucao(stats.porDia);
            this.renderizarGraficoRanking(stats.porAssistente);
            this.renderizarTabelaDetalhada(stats.listaCompleta);

        } catch (erro) {
            console.error("Erro assertividade:", erro);
            if(containerKPI) containerKPI.innerHTML = '<div class="text-red-500 p-4">Erro ao carregar dados.</div>';
        }
    },

    processarDados: function(dados) {
        // Totais Gerais
        let totalDocsProduzidos = dados.length; // Total de linhas (Ex: 546)
        let totalDocsAuditados = 0;             // Apenas os que têm nota (Ex: 37)
        let totalErros = 0;
        let somaPorcentagem = 0;
        
        const porDia = {};
        const porAssistente = {};

        dados.forEach(item => {
            // Normaliza métricas
            const nNok = Number(item.qtd_nok || item.nok || 0);
            const nOk = Number(item.qtd_ok || item.ok || 0);
            const nCampos = Number(item.num_campos || item.campos || (nOk + nNok));
            
            // Tratamento da Porcentagem
            let pct = null; // Começa nulo
            if (item.porcentagem !== undefined && item.porcentagem !== null) {
                if (typeof item.porcentagem === 'string') {
                    // Só converte se não for vazio
                    if(item.porcentagem.trim() !== '') {
                        pct = parseFloat(item.porcentagem.replace('%','').replace(',','.'));
                    }
                } else {
                    pct = Number(item.porcentagem);
                }
            }

            // CORREÇÃO 2: Só conta na média se tiver nota válida (exclui REV, EMPR, vazios)
            if (pct !== null && !isNaN(pct)) {
                totalDocsAuditados++;
                somaPorcentagem += pct;
                totalErros += nNok; // Soma erros apenas dos auditados
            } else {
                // Se não tem nota, assume 0 para cálculos seguros ou ignora?
                // Para a média justa (91.89%), devemos IGNORAR quem não tem nota.
                pct = 0; // Valor seguro apenas para gráficos de soma, não para média
            }

            // Data (Baseada na produção)
            let dia = 'N/A';
            if (item.data_referencia) {
                const dataIso = item.data_referencia.split('T')[0];
                const partes = dataIso.split('-');
                if (partes.length === 3) dia = `${partes[2]}/${partes[1]}`;
            }

            // Agrupamentos
            if (!porDia[dia]) porDia[dia] = { total: 0, erros: 0, somaPct: 0, docsAuditados: 0, docsProduzidos: 0 };
            porDia[dia].docsProduzidos++;
            
            // Só soma estatísticas de qualidade se foi auditado
            if (pct !== null && !isNaN(Number(item.porcentagem))) {
                porDia[dia].total += nCampos;
                porDia[dia].erros += nNok;
                porDia[dia].somaPct += pct;
                porDia[dia].docsAuditados++;
            }

            const nomeAssistente = item.nome_assistente || item.assistente || 'Desconhecido';
            if (!porAssistente[nomeAssistente]) porAssistente[nomeAssistente] = { docsAuditados: 0, erros: 0, somaPct: 0 };
            
            if (pct !== null && !isNaN(Number(item.porcentagem))) {
                porAssistente[nomeAssistente].docsAuditados++;
                porAssistente[nomeAssistente].erros += nNok;
                porAssistente[nomeAssistente].somaPct += pct;
            }
        });

        // Cálculo Final da Média (Ex: 3400 / 37 = 91.89%)
        const mediaGeral = totalDocsAuditados > 0 ? (somaPorcentagem / totalDocsAuditados).toFixed(2) : 0;

        return {
            totalDocsProduzidos,
            totalDocsAuditados,
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

        // Cards Superiores
        setTxt('kpi-assert-docs', stats.totalDocsAuditados); // Mostra 37 (Auditados)
        setTxt('kpi-assert-erros', stats.totalErros);        // Erros encontrados
        setTxt('kpi-assert-media', stats.mediaGeral + '%');  // 91.89%
        
        // Dica: Se quiser mostrar o total produzido (546) em algum lugar, use stats.totalDocsProduzidos

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
            return d.docsAuditados > 0 ? (d.somaPct / d.docsAuditados).toFixed(2) : 0;
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
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 80, max: 100 } } }
        });
    },

    renderizarGraficoRanking: function(dadosPorAssistente) {
        const ctx = document.getElementById('chart-ranking-assertividade');
        if (!ctx) return;
        if (this.chartRanking) this.chartRanking.destroy();

        const ranking = Object.entries(dadosPorAssistente)
            .map(([nome, d]) => ({
                nome,
                media: d.docsAuditados > 0 ? (d.somaPct / d.docsAuditados).toFixed(2) : 0,
                vol: d.docsAuditados
            }))
            .filter(r => r.vol > 0) // Só mostra quem foi auditado
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
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { min: 90, max: 100 } } }
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
        
        // Mostra apenas os erros na tabela de detalhes
        const erros = lista
            .filter(d => (Number(d.qtd_nok) > 0 || String(d.status) === 'NOK'))
            .sort((a,b) => new Date(b.data_referencia || b.data_auditoria) - new Date(a.data_referencia || a.data_auditoria))
            .slice(0, 20);

        if(erros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhum erro encontrado no período.</td></tr>';
            return;
        }

        let html = '';
        erros.forEach(row => {
            // Usa data de produção (referencia) ou auditoria
            let dataFmt = '-';
            const dataBase = row.data_referencia || row.data_auditoria;
            if(dataBase) dataFmt = dataBase.split('T')[0].split('-').reverse().join('/');

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