const Perf = {
    initialized: false,
    
    init: async function() {
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        if (!this.initialized) {
            this.initialized = true;
        }
        this.carregarRanking();
    },

    limparSelecao: function() {
        document.getElementById('perf-btn-limpar').classList.add('hidden');
        document.getElementById('perf-view-individual').classList.remove('hidden');
        this.carregarRanking(); 
    },

    // Função Principal
    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando...</td></tr>';

        // Pega o valor do seletor da BARRA SUPERIOR
        const tipoPeriodo = document.getElementById('perf-period-type').value; 
        
        // Pega data global
        const globalInput = document.getElementById('global-date');
        const dataGlobal = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
        
        let d = new Date(dataGlobal + 'T12:00:00');
        let inicio, fim, label;

        // Lógica de Datas
        const ano = d.getFullYear();
        const mes = d.getMonth();

        if (tipoPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
            label = `Mês: ${inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
        } 
        else if (tipoPeriodo === 'trimestre') {
            const tri = Math.floor(mes / 3);
            inicio = new Date(ano, tri * 3, 1);
            fim = new Date(ano, (tri + 1) * 3, 0);
            label = `${tri + 1}º Trimestre de ${ano}`;
        } 
        else if (tipoPeriodo === 'semestre') {
            const sem = mes < 6 ? 0 : 1;
            inicio = new Date(ano, sem * 6, 1);
            fim = new Date(ano, (sem + 1) * 6, 0);
            label = `${sem + 1}º Semestre de ${ano}`;
        } 
        else { // ano
            inicio = new Date(ano, 0, 1);
            fim = new Date(ano, 11, 31);
            label = `Ano de ${ano}`;
        }

        // Converte para YYYY-MM-DD
        const sInicio = inicio.toISOString().split('T')[0];
        const sFim = fim.toISOString().split('T')[0];

        // Atualiza label na tela (se ainda existir, senão ignora)
        const lbl = document.getElementById('perf-range-label');
        if(lbl) lbl.innerText = label;

        // Busca dados
        const { data: rawData } = await _supabase
            .from('producao')
            .select('usuario_id, data_referencia, quantidade')
            .gte('data_referencia', sInicio)
            .lte('data_referencia', sFim);

        // Processa dados
        const stats = {};
        const diasUteisTotal = Sistema.Dados.calcularMediaBasePeriodo(sInicio, sFim); // Placeholder, ideal seria contar dias úteis reais

        if (rawData) {
            rawData.forEach(r => {
                const u = Sistema.Dados.usuariosCache[r.usuario_id];
                if (u && (u.funcao === 'Assistente' || u.funcao === 'Auditora' || u.funcao === 'Gestora')) {
                    if (!stats[u.nome]) {
                        stats[u.nome] = { nome: u.nome, total: 0, dias: new Set(), funcao: u.funcao, contrato: u.contrato };
                    }
                    stats[u.nome].total += (Number(r.quantidade) || 0);
                    stats[u.nome].dias.add(r.data_referencia);
                }
            });
        }

        // Converte para array e ordena
        const ranking = Object.values(stats).sort((a, b) => b.total - a.total);

        // Renderiza
        if (tbody) {
            tbody.innerHTML = '';
            if (ranking.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Sem dados no período.</td></tr>';
            } else {
                ranking.forEach((r, idx) => {
                    const diasTrab = r.dias.size;
                    const media = diasTrab > 0 ? Math.round(r.total / diasTrab) : 0;
                    
                    // Meta Total Simplificada (Dias Trab * 650)
                    const meta = diasTrab * 650;
                    const pct = meta > 0 ? Math.round((r.total / meta) * 100) : 0;
                    
                    let badgeColor = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';

                    tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                        <td class="px-6 py-4 font-bold text-slate-400">#${idx + 1}</td>
                        <td class="px-6 py-4 font-bold text-slate-700">
                            ${r.nome} <span class="text-[10px] text-slate-400 font-normal ml-1">(${r.funcao})</span>
                        </td>
                        <td class="px-6 py-4 text-center font-black text-blue-700">${r.total.toLocaleString()}</td>
                        <td class="px-6 py-4 text-center text-slate-500">${diasTrab}</td>
                        <td class="px-6 py-4 text-center font-bold text-slate-600">${media.toLocaleString()}</td>
                        <td class="px-6 py-4 text-center text-slate-400 text-xs">${meta.toLocaleString()}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="${badgeColor} px-2 py-1 rounded text-xs font-black">${pct}%</span>
                        </td>
                    </tr>`;
                });
            }
        }
        
        // Atualiza Cards Superiores (Totais)
        const totalGeral = ranking.reduce((acc, curr) => acc + curr.total, 0);
        const diasGeral = ranking.reduce((acc, curr) => acc + curr.dias.size, 0);
        const mediaGeral = diasGeral > 0 ? Math.round(totalGeral / diasGeral) : 0; // Média ponderada por dia trabalhado

        const elTotal = document.getElementById('perf-card-total');
        if(elTotal) elTotal.innerText = totalGeral.toLocaleString();

        const elMedia = document.getElementById('perf-card-media');
        if(elMedia) elMedia.innerText = mediaGeral.toLocaleString();

        // Cards CLT vs PJ
        const clt = ranking.filter(r => r.contrato === 'CLT');
        const pj = ranking.filter(r => r.contrato === 'PJ');
        
        const totClt = clt.reduce((acc, r) => acc + r.total, 0);
        const totPj = pj.reduce((acc, r) => acc + r.total, 0);
        const grandTotal = totClt + totPj;

        if (grandTotal > 0) {
            document.getElementById('perf-pct-clt').innerText = Math.round((totClt / grandTotal) * 100) + '%';
            document.getElementById('perf-pct-pj').innerText = Math.round((totPj / grandTotal) * 100) + '%';
        }
        
        document.getElementById('perf-count-clt').innerText = clt.length;
        document.getElementById('perf-count-pj').innerText = pj.length;
    }
};