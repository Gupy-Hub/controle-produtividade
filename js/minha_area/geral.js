// js/minha_area/geral.js

MinhaArea.Geral = {
    carregar: async function() {
        console.log("Carregando Dia a Dia (Tabela Producao)...");
        
        const datas = MinhaArea.getDatasFiltro();
        const usuario = MinhaArea.usuario;
        
        if (!usuario || !usuario.id) {
            console.error("Usuário não identificado");
            return;
        }

        this.setLoading(true);

        try {
            // 1. BUSCAR PRODUÇÃO (Tabela 'producao')
            const { data: dadosProducao, error: erroProd } = await window.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', usuario.id)
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: false });

            if (erroProd) throw new Error("Erro ao buscar produção: " + erroProd.message);

            // 2. BUSCAR METAS (Tabela 'metas')
            // CORREÇÃO: Usar 'mes' e 'ano' em vez de 'data_inicio'
            // Buscamos todas as metas do usuário para garantir que teremos a competência necessária
            // (Poderíamos filtrar por ano, mas buscar tudo é seguro dado o volume baixo de metas/ano)
            const { data: dadosMetas, error: erroMetas } = await window.supabase
                .from('metas')
                .select('mes, ano, meta') // Colunas corretas baseadas em gestao/metas.js
                .eq('usuario_id', usuario.id);

            if (erroMetas) throw new Error("Erro ao buscar metas: " + erroMetas.message);

            // 3. Processar e Cruzar Dados
            const dadosConsolidados = this.processarDados(dadosProducao || [], dadosMetas || []);
            
            // 4. Renderizar
            this.renderizarKPIs(dadosConsolidados);
            this.renderizarTabela(dadosConsolidados);

        } catch (erro) {
            console.error("Erro Geral:", erro);
            const tbody = document.getElementById('tabela-diario');
            if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-400">Erro: ${erro.message}</td></tr>`;
        } finally {
            this.setLoading(false);
        }
    },

    // Função para cruzar Produção com a Meta da competência (Mês/Ano)
    processarDados: function(listaProducao, listaMetas) {
        const mapaDias = {};

        listaProducao.forEach(reg => {
            const data = reg.data_referencia; // Formato YYYY-MM-DD
            
            if (!mapaDias[data]) {
                // Extrai Mês e Ano da data da produção para encontrar a meta correspondente
                const [anoStr, mesStr, diaStr] = data.split('-');
                const anoRef = parseInt(anoStr);
                const mesRef = parseInt(mesStr);

                // Busca a meta onde mes e ano batem
                const metaCompetencia = listaMetas.find(m => m.mes === mesRef && m.ano === anoRef);
                const valorMeta = metaCompetencia ? Number(metaCompetencia.meta) : 0;

                mapaDias[data] = {
                    data: data,
                    producao: 0,
                    meta: valorMeta,
                    fator: Number(reg.fator) || 1, 
                    detalhes: [] 
                };
            }

            mapaDias[data].producao += Number(reg.quantidade || 0);
        });

        // Retorna array ordenado (Data mais recente primeiro)
        return Object.values(mapaDias).sort((a, b) => new Date(b.data) - new Date(a.data));
    },

    renderizarKPIs: function(dados) {
        let totalProduzido = 0;
        let totalMeta = 0;
        let diasProdutivos = 0;
        let somaFatores = 0;

        dados.forEach(d => {
            totalProduzido += d.producao;
            // A meta total é a soma das metas diárias ponderadas ou simples?
            // Geralmente: Meta do Mês * Fator do Dia (se houver lógica de dias úteis)
            // Aqui vamos somar a meta do dia apenas se houver produção ou se esperava produção
            totalMeta += d.meta; 
            
            if (d.producao > 0) diasProdutivos++;
            somaFatores += d.fator;
        });

        // 1. Total
        const elTotal = document.getElementById('kpi-total');
        if(elTotal) elTotal.innerText = totalProduzido.toLocaleString('pt-BR');

        // 2. Atingimento
        let atingimento = totalMeta > 0 ? (totalProduzido / totalMeta) * 100 : 0;
        if (totalMeta === 0 && totalProduzido > 0) atingimento = 100;

        const elPct = document.getElementById('kpi-pct');
        const elBar = document.getElementById('bar-progress');
        
        if(elPct) elPct.innerText = atingimento.toFixed(1) + '%';
        if(elBar) {
            elBar.style.width = Math.min(atingimento, 100) + '%';
            
            if(atingimento >= 100) {
                elPct.className = "text-2xl font-black text-emerald-600";
                elBar.className = "h-full bg-emerald-500 rounded-full transition-all duration-500";
            } else if (atingimento >= 80) {
                elPct.className = "text-2xl font-black text-amber-500";
                elBar.className = "h-full bg-amber-400 rounded-full transition-all duration-500";
            } else {
                elPct.className = "text-2xl font-black text-red-500";
                elBar.className = "h-full bg-red-400 rounded-full transition-all duration-500";
            }
        }

        // 3. Dias
        const elDias = document.getElementById('kpi-dias');
        if(elDias) elDias.innerText = diasProdutivos;

        // 4. Média
        const media = diasProdutivos > 0 ? (totalProduzido / diasProdutivos) : 0;
        const elMedia = document.getElementById('kpi-media-real');
        if(elMedia) elMedia.innerText = media.toFixed(0);
        
        const elMediaTime = document.getElementById('kpi-media-time');
        if(elMediaTime) elMediaTime.innerText = "-"; 
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if(!tbody) return;
        
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400">Nenhum registro encontrado neste período.</td></tr>`;
            return;
        }

        dados.forEach(dia => {
            const pct = dia.meta > 0 ? (dia.producao / dia.meta) * 100 : 0;
            
            let statusHtml;
            if (dia.meta === 0) {
                statusHtml = `<span class="bg-slate-100 text-slate-500 py-1 px-3 rounded-full text-[10px] font-bold">SEM META</span>`;
            } else if (dia.producao >= dia.meta) {
                statusHtml = `<span class="bg-emerald-100 text-emerald-700 py-1 px-3 rounded-full text-[10px] font-bold border border-emerald-200">META BATIDA</span>`;
            } else if (dia.producao > 0) {
                statusHtml = `<span class="bg-amber-100 text-amber-700 py-1 px-3 rounded-full text-[10px] font-bold border border-amber-200">PARCIAL (${pct.toFixed(0)}%)</span>`;
            } else {
                statusHtml = `<span class="bg-red-50 text-red-500 py-1 px-3 rounded-full text-[10px] font-bold border border-red-100">ABAIXO</span>`;
            }

            const partesData = dia.data.split('-'); 
            const dataVisual = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
            
            tr.innerHTML = `
                <td class="px-6 py-4 font-bold text-slate-700">
                    ${dataVisual}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="font-bold text-blue-600 text-sm">${dia.producao}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="text-slate-500 text-xs">${dia.fator.toFixed(2)}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="text-slate-500 font-semibold text-xs">${dia.meta}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    ${statusHtml}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="text-xs text-slate-400">-</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    setLoading: function(isLoading) {
        const tbody = document.getElementById('tabela-diario');
        if(!tbody) return;
        
        if (isLoading) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500 mb-2"></i><br>Carregando dados...</td></tr>`;
        }
    }
};