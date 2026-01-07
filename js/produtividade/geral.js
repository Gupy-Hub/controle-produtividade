Produtividade.Geral = {
    // Configuração de Meta Padrão (ajuste conforme sua necessidade)
    META_DIARIA_POR_PESSOA: 120, 

    dadosDia: [],
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

        // 1. Carregar dados do Banco para o dia selecionado
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios(nome, id)')
            .eq('data_referencia', dataSelecionada);

        if (error) {
            console.error("Erro ao carregar dados:", error);
            return;
        }

        this.dadosDia = producao || [];

        // 2. Calcular KPIs
        this.atualizarKPIs(dataSelecionada);

        // 3. Renderizar Tabela
        this.renderizarTabela();
        
        // Atualiza nome selecionado no topo se houver filtro
        const nomeFiltro = document.getElementById('selected-name');
        if(nomeFiltro) nomeFiltro.innerText = "";
    },

    atualizarKPIs: function(dataRef) {
        // --- CÁLCULO DE DIAS ÚTEIS ---
        const [ano, mes, dia] = dataRef.split('-').map(Number); // ex: 2026, 01, 02
        
        // Função auxiliar: conta dias úteis (seg-sex) no mês inteiro e até o dia atual
        const getDiasUteis = (y, m, dLimit) => {
            let totalMes = 0;
            let decorrido = 0;
            const ultimoDiaMes = new Date(y, m, 0).getDate(); // m já vem correto do split? (1=Jan). Date usa 1 para pegar o dia 0 do prox mes
            
            for (let i = 1; i <= ultimoDiaMes; i++) {
                let dt = new Date(y, m - 1, i); // Mes no Date é 0-11
                let diaSem = dt.getDay();
                if (diaSem !== 0 && diaSem !== 6) { // 0=Dom, 6=Sab
                    totalMes++;
                    if (i <= dLimit) decorrido++;
                }
            }
            return { decorrido, totalMes };
        };

        const uteis = getDiasUteis(ano, mes, dia);
        
        // Atualiza Card de Dias Úteis
        const elDias = document.getElementById('kpi-dias');
        if (elDias) elDias.innerText = `${uteis.decorrido} / ${uteis.totalMes}`;

        // --- CÁLCULO DE TOTAIS ---
        let totalProducao = 0;
        let countCLT = 0;
        let countPJ = 0; // Se você tiver essa distinção no banco, senão conta tudo junto
        
        // Itera sobre os dados carregados
        this.dadosDia.forEach(reg => {
            totalProducao += (reg.quantidade || 0);
            // Simulação de contagem (se tiver campo 'tipo_contrato' no usuario, use ele. Aqui conto todos como CLT por enquanto)
            countCLT++; 
        });

        // Meta do Dia (Qtd Pessoas * Meta Individual)
        const metaDia = (countCLT + countPJ) * this.META_DIARIA_POR_PESSOA;
        const atingimento = metaDia > 0 ? (totalProducao / metaDia) * 100 : 0;

        // Atualiza Cards
        if(document.getElementById('kpi-total')) 
            document.getElementById('kpi-total').innerText = totalProducao.toLocaleString('pt-BR');
        
        if(document.getElementById('kpi-meta-total')) 
            document.getElementById('kpi-meta-total').innerText = metaDia.toLocaleString('pt-BR');

        if(document.getElementById('kpi-pct')) 
            document.getElementById('kpi-pct').innerText = atingimento.toFixed(1) + "%";
            
        // Atualiza card de equipe (exemplo simples)
        if(document.getElementById('kpi-count-clt')) document.getElementById('kpi-count-clt').innerText = countCLT;
        if(document.getElementById('kpi-pct-clt')) document.getElementById('kpi-pct-clt').innerText = "100%"; // Ajustar conforme lógica real
        
        // Médias
        const media = (countCLT + countPJ) > 0 ? Math.round(totalProducao / (countCLT + countPJ)) : 0;
        if(document.getElementById('kpi-media-todas'))
            document.getElementById('kpi-media-todas').innerText = media;
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.dadosDia.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-slate-400">Nenhum dado encontrado para esta data.</td></tr>`;
            return;
        }

        // Ordena por maior produção
        this.dadosDia.sort((a, b) => b.quantidade - a.quantidade);

        this.dadosDia.forEach(row => {
            const metaIndividual = this.META_DIARIA_POR_PESSOA;
            const pct = metaIndividual > 0 ? (row.quantidade / metaIndividual) * 100 : 0;
            
            // Definição de cores baseada na % da meta
            let corStatus = "text-red-600 bg-red-50";
            if (pct >= 100) corStatus = "text-emerald-600 bg-emerald-50";
            else if (pct >= 80) corStatus = "text-yellow-600 bg-yellow-50";

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                </td>
                <td class="px-6 py-3 font-bold text-slate-700">
                    ${row.usuarios ? row.usuarios.nome : 'Desconhecido'}
                    <div class="text-[10px] text-slate-400 font-normal">ID: ${row.usuario_id}</div>
                </td>
                <td class="px-6 py-3 text-center text-slate-500">1</td>
                <td class="px-6 py-3 text-center font-black text-blue-700 text-lg">${(row.quantidade || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.fifo || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_total || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_parcial || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-400">${metaIndividual}</td>
                <td class="px-6 py-3 text-center">
                    <span class="${corStatus} px-2 py-1 rounded text-xs font-bold border border-current opacity-80">
                        ${pct.toFixed(0)}%
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    // Funções extras (limpar filtro, excluir, etc) podem ser mantidas ou adicionadas conforme necessidade
    limparSelecao: function() {
        this.carregarTela();
    },

    excluirDadosDia: async function() {
        if(!confirm("Tem certeza que deseja apagar TODOS os dados desta data?")) return;
        const dateInput = document.getElementById('global-date');
        const data = dateInput.value;
        
        const { error } = await Produtividade.supabase
            .from('producao')
            .delete()
            .eq('data_referencia', data);
            
        if(error) alert("Erro ao excluir: " + error.message);
        else {
            alert("Dados excluídos.");
            this.carregarTela();
        }
    },
    
    toggleSemana: function() {
        // Lógica futura para alternar visualização
        this.carregarTela();
    }
};