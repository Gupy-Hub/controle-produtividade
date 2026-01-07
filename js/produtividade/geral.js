Produtividade.Geral = {
    META_DIARIA_POR_PESSOA: 120, // Ajuste sua meta aqui

    dadosView: [], // Dados filtrados para a tabela
    dadosMesInteiro: [], // Para cálculos de dias úteis globais
    
    carregarTela: async function() {
        const dateInput = document.getElementById('global-date');
        const viewModeEl = document.getElementById('view-mode');
        
        const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const modoVisualizacao = viewModeEl ? viewModeEl.value : 'dia'; // 'dia', 'mes', 'semana'

        // 1. Definir Período de Busca (Inicio e Fim)
        let dataInicio = dataSelecionada;
        let dataFim = dataSelecionada;

        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);

        // Se for visualização Mensal, pega do dia 1 até o último dia do mês
        if (modoVisualizacao === 'mes') {
            dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const ultimoDia = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
        }
        
        // --- CONSULTA 1: Dados para a Tabela (Respeita o Filtro Dia/Mês) ---
        const { data: producao, error } = await Produtividade.supabase
            .from('producao')
            .select('*, usuarios!inner(nome, id)')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.error("Erro ao carregar dados:", error);
            return;
        }

        // --- CONSULTA 2: Contexto de Dias Úteis do Mês (Para o Card KPI) ---
        // Mesmo se estiver vendo só o "Dia", precisamos saber que é o "Dia 3 de 20"
        const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`;
        
        const { data: diasDb } = await Produtividade.supabase
            .from('producao')
            .select('data_referencia')
            .gte('data_referencia', inicioMes)
            .lte('data_referencia', fimMes);

        // Processa dias únicos trabalhados pelo time no mês
        const diasUnicosSet = new Set(diasDb ? diasDb.map(d => d.data_referencia) : []);
        const diasTrabalhadosTime = Array.from(diasUnicosSet).sort();

        this.processarDados(producao, modoVisualizacao, diasTrabalhadosTime, dataSelecionada);
    },

    processarDados: function(dadosBrutos, modo, diasTrabalhadosTime, dataRef) {
        let dadosAgrupados = [];

        if (modo === 'mes') {
            // Agrupa por usuário para somar o mês
            const mapa = {};
            dadosBrutos.forEach(row => {
                const uid = row.usuario_id;
                if (!mapa[uid]) {
                    mapa[uid] = {
                        usuario_id: uid,
                        usuarios: row.usuarios,
                        quantidade: 0,
                        fifo: 0,
                        gradual_total: 0,
                        gradual_parcial: 0,
                        perfil_fc: 0,
                        dias_trabalhados: new Set() // Para contar dias individuais
                    };
                }
                mapa[uid].quantidade += (row.quantidade || 0);
                mapa[uid].fifo += (row.fifo || 0);
                mapa[uid].gradual_total += (row.gradual_total || 0);
                mapa[uid].gradual_parcial += (row.gradual_parcial || 0);
                mapa[uid].perfil_fc += (row.perfil_fc || 0);
                mapa[uid].dias_trabalhados.add(row.data_referencia);
            });
            // Converte de volta para array
            dadosAgrupados = Object.values(mapa).map(u => ({
                ...u,
                dias_calc: u.dias_trabalhados.size // Converte Set para número
            }));
        } else {
            // Modo Dia: Apenas mapeia e define dias_calc = 1
            dadosAgrupados = dadosBrutos.map(row => ({
                ...row,
                dias_calc: 1
            }));
        }

        this.dadosView = dadosAgrupados;
        this.atualizarKPIs(dadosAgrupados, diasTrabalhadosTime, dataRef, modo);
        this.renderizarTabela();
        
        // Limpa nome selecionado se houver recarga
        const nomeFiltro = document.getElementById('selected-name');
        if(nomeFiltro && nomeFiltro.innerText === "") nomeFiltro.innerText = "";
    },

    atualizarKPIs: function(dados, diasTrabalhadosTime, dataRef, modo) {
        // --- KPI 1: Dias Úteis (Baseado no TRABALHO REAL DO TIME) ---
        const totalDiasNoMes = diasTrabalhadosTime.length;
        
        // Descobre a posição do dia selecionado (ex: é o 3º dia trabalhado do mês?)
        let diaAtualIndex = diasTrabalhadosTime.indexOf(dataRef) + 1;
        if (diaAtualIndex === 0 && modo === 'dia') diaAtualIndex = '-'; // Data sem produção
        if (modo === 'mes') diaAtualIndex = totalDiasNoMes; // Se vê o mês, mostra total

        const elDias = document.getElementById('kpi-dias');
        if (elDias) elDias.innerText = `${diaAtualIndex} / ${totalDiasNoMes}`;

        // --- KPI 2: Totais de Produção ---
        let totalProducao = 0;
        let totalDiasIndividuaisSomados = 0; // Soma dos dias de cada pessoa

        dados.forEach(reg => {
            totalProducao += reg.quantidade;
            totalDiasIndividuaisSomados += (reg.dias_calc || 1);
        });

        // Contagem de Pessoas (Ativas no período)
        const countPessoas = dados.length;

        // Meta Calculada
        // Se for DIA: Meta = Pessoas * MetaDiaria
        // Se for MES: Meta = Soma(DiasTrabalhadosDeCadaUm) * MetaDiaria
        const metaCalculada = totalDiasIndividuaisSomados * this.META_DIARIA_POR_PESSOA;
        
        const atingimento = metaCalculada > 0 ? (totalProducao / metaCalculada) * 100 : 0;

        // Renderiza KPIs
        if(document.getElementById('kpi-total')) 
            document.getElementById('kpi-total').innerText = totalProducao.toLocaleString('pt-BR');
        
        if(document.getElementById('kpi-meta-total')) 
            document.getElementById('kpi-meta-total').innerText = metaCalculada.toLocaleString('pt-BR');

        if(document.getElementById('kpi-pct')) 
            document.getElementById('kpi-pct').innerText = atingimento.toFixed(1) + "%";
            
        // Contadores de Equipe
        if(document.getElementById('kpi-count-clt')) document.getElementById('kpi-count-clt').innerText = countPessoas;
        
        // Média Diária (Total Produção / Total Dias Pessoas)
        const media = totalDiasIndividuaisSomados > 0 ? Math.round(totalProducao / totalDiasIndividuaisSomados) : 0;
        if(document.getElementById('kpi-media-todas'))
            document.getElementById('kpi-media-todas').innerText = media;
            
        // Individual (apenas exemplo visual, pega o melhor ou média)
        if(document.getElementById('kpi-media-assist'))
            document.getElementById('kpi-media-assist').innerText = media; 
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.dadosView.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-slate-400">Nenhum dado encontrado para este período.</td></tr>`;
            return;
        }

        // Ordena por produção (maior para menor)
        this.dadosView.sort((a, b) => b.quantidade - a.quantidade);

        this.dadosView.forEach(row => {
            // Meta individual baseada nos dias que ELA trabalhou
            const diasDela = row.dias_calc || 1;
            const metaIndividual = diasDela * this.META_DIARIA_POR_PESSOA;
            
            const pct = metaIndividual > 0 ? (row.quantidade / metaIndividual) * 100 : 0;
            
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
                <td class="px-6 py-3 text-center text-slate-500 font-bold bg-slate-50/50">${diasDela}</td>
                <td class="px-6 py-3 text-center font-black text-blue-700 text-lg">${(row.quantidade || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.fifo || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_total || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-600">${(row.gradual_parcial || 0)}</td>
                <td class="px-6 py-3 text-center text-slate-400 text-xs">${metaIndividual}</td>
                <td class="px-6 py-3 text-center">
                    <span class="${corStatus} px-2 py-1 rounded text-xs font-bold border border-current opacity-80">
                        ${pct.toFixed(0)}%
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    limparSelecao: function() {
        this.carregarTela();
    },

    excluirDadosDia: async function() {
        if(!confirm("Tem certeza que deseja apagar TODOS os dados da visualização atual?")) return;
        const dateInput = document.getElementById('global-date');
        const viewMode = document.getElementById('view-mode').value;
        const data = dateInput.value;
        
        let query = Produtividade.supabase.from('producao').delete();

        if (viewMode === 'mes') {
            const [ano, mes] = data.split('-');
            const inicio = `${ano}-${mes}-01`;
            const fim = `${ano}-${mes}-${new Date(ano, mes, 0).getDate()}`;
            query = query.gte('data_referencia', inicio).lte('data_referencia', fim);
        } else {
            query = query.eq('data_referencia', data);
        }
            
        const { error } = await query;
            
        if(error) alert("Erro ao excluir: " + error.message);
        else {
            alert("Dados excluídos.");
            this.carregarTela();
        }
    },
    
    // Função chamada ao mudar o select "Visualização"
    toggleSemana: function() {
        this.carregarTela();
    }
};