window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Iniciando Engine V3.0 (Diagnóstico Ativo)...");
        this.renderizarFiltros(); 
        // Pequeno delay para garantir que o DOM renderizou os filtros antes de buscar dados
        setTimeout(() => this.carregarDados(), 100);
        this.initialized = true;
    },

    renderizarFiltros: function() {
        const selAno = document.getElementById('sel-consolidado-ano');
        const selPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!selAno || !selPeriodo) return;

        // Configuração de Anos: Inclui 2026, 2025 e 2024 para garantir compatibilidade histórica
        const anoAtual = new Date().getFullYear(); 
        selAno.innerHTML = `
            <option value="${anoAtual}">${anoAtual}</option>
            <option value="${anoAtual - 1}" selected>${anoAtual - 1}</option> <option value="${anoAtual - 2}">${anoAtual - 2}</option>
        `;

        selPeriodo.innerHTML = `
            <option value="anual" class="font-bold">📅 Ano Completo</option>
            <optgroup label="Semestres">
                <option value="s1">1º Semestre (Jan-Jun)</option>
                <option value="s2">2º Semestre (Jul-Dez)</option>
            </optgroup>
            <optgroup label="Trimestres">
                <option value="t1">1º Trimestre (Jan-Mar)</option>
                <option value="t2">2º Trimestre (Abr-Jun)</option>
                <option value="t3">3º Trimestre (Jul-Set)</option>
                <option value="t4">4º Trimestre (Out-Dez)</option>
            </optgroup>
            <optgroup label="Meses">
                <option value="1">Janeiro</option> <option value="2">Fevereiro</option> <option value="3">Março</option>
                <option value="4">Abril</option> <option value="5">Maio</option> <option value="6">Junho</option>
                <option value="7">Julho</option> <option value="8">Agosto</option> <option value="9">Setembro</option>
                <option value="10">Outubro</option> <option value="11">Novembro</option> <option value="12">Dezembro</option>
            </optgroup>
        `;

        selAno.onchange = () => this.carregarDados();
        selPeriodo.onchange = () => this.carregarDados();
    },

    getDatasIntervalo: function() {
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');
        
        // Fallback seguro se elementos não existirem
        if (!elAno || !elPeriodo) {
            const y = new Date().getFullYear();
            return { inicio: `${y}-01-01`, fim: `${y}-12-31` };
        }

        const ano = elAno.value;
        const periodo = elPeriodo.value;

        let inicio = `${ano}-01-01`;
        let fim = `${ano}-12-31`;

        switch (periodo) {
            case 'anual': break;
            case 's1': inicio = `${ano}-01-01`; fim = `${ano}-06-30`; break;
            case 's2': inicio = `${ano}-07-01`; fim = `${ano}-12-31`; break;
            case 't1': inicio = `${ano}-01-01`; fim = `${ano}-03-31`; break;
            case 't2': inicio = `${ano}-04-01`; fim = `${ano}-06-30`; break;
            case 't3': inicio = `${ano}-07-01`; fim = `${ano}-09-30`; break;
            case 't4': inicio = `${ano}-10-01`; fim = `${ano}-12-31`; break;
            default:
                const mes = parseInt(periodo);
                if (mes >= 1 && mes <= 12) {
                    const lastDay = new Date(ano, mes, 0).getDate();
                    inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
                    fim = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
                }
                break;
        }

        // Atualiza display de debug na tela
        const debugInicio = document.getElementById('debug-data-inicio');
        const debugFim = document.getElementById('debug-data-fim');
        if(debugInicio) debugInicio.innerText = inicio;
        if(debugFim) debugFim.innerText = fim;

        return { inicio, fim };
    },

    countDiasUteis: function(inicioStr, fimStr) {
        let count = 0;
        let cur = new Date(inicioStr + 'T12:00:00'); 
        const end = new Date(fimStr + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++; 
            cur.setDate(cur.getDate() + 1);
        }
        return count > 0 ? count : 1;
    },

    carregar: function() {
        if(!this.initialized) this.init();
        else this.carregarDados();
    },

    carregarDados: async function() {
        const tbody = document.getElementById('cons-table-body');
        const { inicio, fim } = this.getDatasIntervalo();
        const diasUteisPeriodo = this.countDiasUteis(inicio, fim);

        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400 flex flex-col items-center gap-2"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i><span>Buscando dados no Supabase...</span></td></tr>';

        try {
            if(!Sistema || !Sistema.supabase) throw new Error("Sistema/Supabase não inicializado.");

            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { data_inicio: inicio, data_fim: fim });

            if (error) throw error;
            
            console.log("✅ [CONSOLIDADO] Dados Recebidos:", data);
            this.processarDados(data, diasUteisPeriodo);

        } catch (error) {
            console.error("❌ Erro ao carregar:", error);
            if (tbody) tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="p-8 text-center text-rose-500 bg-rose-50 rounded-lg">
                        <div class="font-bold mb-1">Erro ao carregar dados:</div>
                        <div class="text-xs font-mono">${error.message || error}</div>
                        <div class="mt-2 text-xs text-slate-500">Verifique se a função RPC 'get_painel_produtividade' existe no banco.</div>
                    </td>
                </tr>`;
        }
    },

    processarDados: function(data, diasUteisPeriodo) {
        if (!data || data.length === 0) {
            this.renderizarTabela([]);
            this.zerarKPIs();
            return;
        }

        // Filtro mais permissivo: Só remove se for explicitamente AUDITORA ou GESTORA
        const assistentes = data.filter(d => {
            const funcao = (d.funcao || '').toUpperCase();
            return !['AUDITORA', 'GESTORA'].includes(funcao);
        });

        // Totais Gerais
        let totalValidados = 0;
        let totalFifo = 0;
        let totalGradualTotal = 0;
        let totalGradualParcial = 0;
        let totalPerfilFc = 0;

        const dadosMapeados = assistentes.map(u => {
            // Mapeamento Flexível de Colunas (previne zeros se o nome da coluna mudar)
            const prod = Number(u.total_qty || u.producao || u.quantidade || 0);
            const fifo = Number(u.total_fifo || u.fifo || 0);
            const gradTotal = Number(u.total_gradual_total || u.gradual_total || 0);
            const gradParcial = Number(u.total_gradual_parcial || u.gradual_parcial || 0);
            const perfilFc = Number(u.total_perfil_fc || u.perfil_fc || 0);
            
            // Acumula
            totalValidados += prod;
            totalFifo += fifo;
            totalGradualTotal += gradTotal;
            totalGradualParcial += gradParcial;
            totalPerfilFc += perfilFc;

            // Cálculos
            const mediaDiaria = diasUteisPeriodo > 0 ? (prod / diasUteisPeriodo) : 0;
            const metaPeriodo = Number(u.meta_producao || 0) * diasUteisPeriodo;
            const atingimento = metaPeriodo > 0 ? (prod / metaPeriodo * 100) : 0;

            return {
                nome: u.nome || 'Desconhecido',
                fifo, gradTotal, gradParcial, perfilFc,
                total: prod,
                mediaDiaria,
                atingimento
            };
        });

        // Ordena por produção
        dadosMapeados.sort((a,b) => b.total - a.total);

        // --- ATUALIZA KPI'S ---
        const totalAssistentes = assistentes.length;
        const validacaoDiariaTime = diasUteisPeriodo > 0 ? (totalValidados / diasUteisPeriodo) : 0;
        
        // Média Período = Total Geral / Num Assistentes
        const mediaPeriodoPorAssistente = totalAssistentes > 0 ? (totalValidados / totalAssistentes) : 0;
        
        // Média Diária = (Total Geral / Dias) / Num Assistentes
        const mediaDiariaPorAssistente = (totalAssistentes > 0 && diasUteisPeriodo > 0) 
            ? (totalValidados / diasUteisPeriodo / totalAssistentes) 
            : 0;

        // Injeção nos IDs (usando safeSet para não quebrar se ID faltar)
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };

        safeSet('cons-total-validados', totalValidados.toLocaleString('pt-BR'));
        safeSet('cons-validacao-diaria-time', Math.round(validacaoDiariaTime).toLocaleString('pt-BR'));
        
        safeSet('cons-total-assistentes', totalAssistentes);
        safeSet('cons-dias-uteis', diasUteisPeriodo);
        
        safeSet('cons-media-diaria-assistente', mediaDiariaPorAssistente.toFixed(1).replace('.', ','));
        safeSet('cons-media-periodo-assistente', Math.round(mediaPeriodoPorAssistente).toLocaleString('pt-BR'));
        
        safeSet('cons-total-fifo', totalFifo.toLocaleString('pt-BR'));
        safeSet('cons-perfil-fc', totalPerfilFc.toLocaleString('pt-BR'));
        
        safeSet('cons-grad-total', totalGradualTotal.toLocaleString('pt-BR'));
        safeSet('cons-grad-parcial', totalGradualParcial.toLocaleString('pt-BR'));

        safeSet('total-consolidado-registros', totalAssistentes);

        this.renderizarTabela(dadosMapeados);
    },

    zerarKPIs: function() {
        const ids = [
            'cons-total-validados', 'cons-validacao-diaria-time', 'cons-total-assistentes',
            'cons-dias-uteis', 'cons-media-diaria-assistente', 'cons-media-periodo-assistente',
            'cons-total-fifo', 'cons-perfil-fc', 'cons-grad-total', 'cons-grad-parcial', 'total-consolidado-registros'
        ];
        ids.forEach(id => { const el = document.getElementById(id); if(el) el.innerText = '-'; });
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('cons-table-body');
        if(!tbody) return;

        tbody.innerHTML = '';

        if(dados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="p-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                        <i class="fas fa-inbox text-3xl mb-2 block text-slate-300"></i>
                        <span class="font-bold">Nenhum registro encontrado para este período.</span>
                        <div class="text-xs mt-1">Tente selecionar outro ano ou mês no filtro acima.</div>
                    </td>
                </tr>`;
            return;
        }

        dados.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition-colors group";

            let corAting = "text-slate-500";
            if(d.atingimento >= 100) corAting = "text-emerald-600 font-bold";
            else if(d.atingimento < 95) corAting = "text-rose-600 font-bold";

            const nomeCurto = d.nome.split(' ').slice(0, 2).join(' ');

            tr.innerHTML = `
                <td class="px-3 py-3 border-r border-slate-100">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">${d.nome.charAt(0)}</div>
                        <span class="font-bold text-slate-700 text-xs">${nomeCurto}</span>
                    </div>
                </td>
                <td class="px-2 py-3 text-center text-slate-500 border-r border-slate-100 font-mono text-xs">-</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.fifo.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.gradTotal.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.gradParcial.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.perfilFc.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center font-bold text-blue-700 bg-blue-50/30 border-x border-blue-100 text-sm">${d.total.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-700 font-bold border-r border-slate-100 text-xs">${Math.round(d.mediaDiaria)}</td>
                <td class="px-2 py-3 text-center ${corAting} text-xs">${d.atingimento.toFixed(1)}%</td>
            `;
            tbody.appendChild(tr);
        });
    }
};