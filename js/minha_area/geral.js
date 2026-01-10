// js/minha_area/geral.js

MinhaArea.Geral = {
    carregar: async function() {
        console.log("Carregando Dia a Dia (Extrato)...");
        
        // 1. Obter Contexto
        const datas = MinhaArea.getDatasFiltro();
        const usuario = MinhaArea.usuario;
        
        if (!usuario || !usuario.id) {
            console.error("Usuário não identificado");
            return;
        }

        // Indicador de Carregamento
        this.setLoading(true);

        try {
            // 2. Buscar Dados no Supabase
            // Buscamos na tabela principal de produção
            const { data, error } = await supabase
                .from('relatorio_producao')
                .select('*')
                .eq('func_id', usuario.id) // Apenas dados deste usuário
                .gte('data', datas.inicio)
                .lte('data', datas.fim)
                .order('data', { ascending: false });

            if (error) throw error;

            // 3. Processar e Agrupar Dados por Dia
            // O banco pode ter várias linhas por dia. Vamos consolidar.
            const dadosAgrupados = this.agruparPorDia(data);
            
            // 4. Renderizar Interface
            this.renderizarKPIs(dadosAgrupados);
            this.renderizarTabela(dadosAgrupados);

        } catch (erro) {
            console.error("Erro ao carregar dia a dia:", erro);
            alert("Erro ao carregar dados do período.");
        } finally {
            this.setLoading(false);
        }
    },

    agruparPorDia: function(registros) {
        const dias = {};

        registros.forEach(reg => {
            const dataChave = reg.data; // YYYY-MM-DD
            
            if (!dias[dataChave]) {
                dias[dataChave] = {
                    data: dataChave,
                    producao: 0,
                    meta: 0,
                    fator: 0,
                    obs: []
                };
            }

            // Somatórias
            dias[dataChave].producao += Number(reg.qtd_produzida || 0);
            
            // Assumindo que a meta e fator são constantes por dia ou pegamos o maior registro
            // Se houver lógica de meta variável, ajustamos aqui.
            // Priorizamos valores que existem
            if (reg.meta_diaria > dias[dataChave].meta) dias[dataChave].meta = Number(reg.meta_diaria);
            if (reg.fator > dias[dataChave].fator) dias[dataChave].fator = Number(reg.fator);
            
            // Justificativas (concatenar se houver texto único)
            if (reg.observacao) {
                if (!dias[dataChave].obs.includes(reg.observacao)) {
                    dias[dataChave].obs.push(reg.observacao);
                }
            }
        });

        // Transforma objeto em array ordenado por data (mais recente primeiro)
        return Object.values(dias).sort((a, b) => new Date(b.data) - new Date(a.data));
    },

    renderizarKPIs: function(dados) {
        let totalProduzido = 0;
        let totalMeta = 0;
        let diasProdutivos = 0;
        let somaFatores = 0;

        dados.forEach(d => {
            totalProduzido += d.producao;
            totalMeta += d.meta;
            if (d.producao > 0) diasProdutivos++;
            somaFatores += d.fator;
        });

        // 1. Total Produzido
        document.getElementById('kpi-total').innerText = totalProduzido.toLocaleString('pt-BR');

        // 2. Atingimento (Total Produzido / Total Meta do período)
        // Se meta for 0, evita divisão por zero
        let atingimento = totalMeta > 0 ? (totalProduzido / totalMeta) * 100 : 0;
        
        // Elementos visuais
        const elPct = document.getElementById('kpi-pct');
        const elBar = document.getElementById('bar-progress');
        
        elPct.innerText = atingimento.toFixed(1) + '%';
        elBar.style.width = Math.min(atingimento, 100) + '%'; // Trava visual em 100% pra não quebrar layout
        
        // Cores dinâmicas para o atingimento
        if(atingimento >= 100) {
            elPct.className = "text-2xl font-black text-emerald-600";
            elBar.className = "h-full bg-emerald-500 rounded-full";
        } else if (atingimento >= 80) {
            elPct.className = "text-2xl font-black text-yellow-600";
            elBar.className = "h-full bg-yellow-500 rounded-full";
        } else {
            elPct.className = "text-2xl font-black text-red-600";
            elBar.className = "h-full bg-red-500 rounded-full";
        }

        // 3. Dias Produtivos
        document.getElementById('kpi-dias').innerText = diasProdutivos;

        // 4. Média Diária
        const media = diasProdutivos > 0 ? (totalProduzido / diasProdutivos) : 0;
        document.getElementById('kpi-media-real').innerText = media.toFixed(0);
        
        // Opcional: Calcular média do Time (Hardcode ou fetch separado se necessário futuramente)
        // Por enquanto deixamos um placeholder ou calculamos se tivermos acesso
        document.getElementById('kpi-media-time').innerText = "-"; 
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400">Nenhum registro encontrado neste período.</td></tr>`;
            return;
        }

        dados.forEach(dia => {
            // Cálculos da linha
            const atingimentoDia = dia.meta > 0 ? (dia.producao / dia.meta) * 100 : 0;
            
            // Definição de Status
            let statusHtml = '';
            if (dia.producao >= dia.meta && dia.meta > 0) {
                statusHtml = `<span class="bg-emerald-100 text-emerald-700 py-1 px-3 rounded-full text-[10px] font-bold border border-emerald-200">META BATIDA</span>`;
            } else if (dia.producao > 0) {
                statusHtml = `<span class="bg-yellow-100 text-yellow-700 py-1 px-3 rounded-full text-[10px] font-bold border border-yellow-200">PARCIAL (${atingimentoDia.toFixed(0)}%)</span>`;
            } else {
                statusHtml = `<span class="bg-slate-100 text-slate-500 py-1 px-3 rounded-full text-[10px] font-bold border border-slate-200">AUSENTE/FOLGA</span>`;
            }

            // Formatação Data
            const dataFormatada = new Date(dia.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
            
            tr.innerHTML = `
                <td class="px-6 py-4 font-bold text-slate-700">
                    ${dataFormatada}
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
                <td class="px-6 py-4">
                    <span class="text-xs text-slate-500 italic truncate max-w-[200px] block" title="${dia.obs.join(', ')}">
                        ${dia.obs.length > 0 ? dia.obs.join(', ') : '-'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    setLoading: function(isLoading) {
        const tbody = document.getElementById('tabela-diario');
        if (isLoading) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500 mb-2"></i><br>Carregando extrato...</td></tr>`;
        }
    }
};